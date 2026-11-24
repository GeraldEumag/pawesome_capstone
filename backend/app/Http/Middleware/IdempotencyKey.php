<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Honors the `Idempotency-Key` request header on retry-unsafe POST
 * endpoints. The first completed response is persisted; a retry with the
 * same key replays it verbatim (headers `Idempotent-Replayed: true`), and a
 * key reused with a different payload is rejected with 409.
 *
 * Concurrent retries serialize on the authenticated user row so the action
 * and its stored response commit together before another retry proceeds.
 */
class IdempotencyKey
{
    public function handle(Request $request, Closure $next, string $requirement = 'optional'): Response
    {
        $key = trim((string) $request->header('Idempotency-Key', ''));
        $isWriteRequest = in_array($request->method(), ['POST', 'PUT', 'PATCH'], true);
        if (!$isWriteRequest || !$request->user()) {
            return $next($request);
        }

        if ($key === '' && $requirement === 'required') {
            return response()->json([
                'message' => 'Idempotency-Key is required for this transaction.',
            ], 422);
        }

        if ($key === '') {
            return $next($request);
        }

        // The storage column is varchar(128) — an oversized key must be
        // rejected before the action runs, not fail storage afterwards.
        if (strlen($key) > 128) {
            return response()->json([
                'message' => 'Idempotency-Key must be at most 128 characters.',
            ], 422);
        }

        return DB::transaction(function () use ($request, $next, $key) {
            DB::table('users')->where('id', $request->user()->id)->lockForUpdate()->first();

            return $this->handleLocked($request, $next, $key);
        });
    }

    private function handleLocked(Request $request, Closure $next, string $key): Response
    {
        $userId = (int) $request->user()->id;
        $route = $request->method() . ' ' . $request->path();
        $requestHash = hash('sha256', $request->getContent());

        // Stored responses expire after 30 days so the table can't grow
        // unbounded and stale payloads aren't replayed forever.
        $expiredBefore = now()->subDays(30);

        $existing = DB::table('idempotency_keys')
            ->where('user_id', $userId)
            ->where('key', $key)
            ->where('route', $route)
            ->where('created_at', '>=', $expiredBefore)
            ->first();

        // Expired rows are ignored by the lookup above and removed by the
        // scheduled `idempotency:prune-keys` job. A per-request DELETE here
        // takes gap/supremum locks on the unique index early in the
        // transaction; a concurrent request holding business-row locks then
        // deadlocks against this transaction's final INSERT (users ↔
        // idempotency_keys lock-order inversion).
        if ($existing) {
            if ($existing->request_hash !== $requestHash) {
                return response()->json([
                    'message' => 'This Idempotency-Key was already used with a different request payload.',
                ], 409);
            }

            // Return a JsonResponse so the boundary normalizer applies the
            // same envelope as the original pass — byte-identical replays.
            $decoded = json_decode($existing->response_body, true);
            $replay = is_array($decoded)
                ? response()->json($decoded, $existing->response_status)
                : response()->make($existing->response_body, $existing->response_status);
            $replay->headers->set('Idempotent-Replayed', 'true');
            return $replay;
        }

        $response = $next($request);

        // Only persist deterministic outcomes — server errors may be retried.
        if ($response->getStatusCode() < 500) {
            try {
                DB::table('idempotency_keys')->insert([
                    'user_id' => $userId,
                    'key' => $key,
                    'method' => $request->method(),
                    'route' => $route,
                    'request_hash' => $requestHash,
                    'response_status' => $response->getStatusCode(),
                    'response_body' => $response->getContent(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                // A racing request already stored this key — return ours;
                // the stored one is equivalent by construction.
            }
        }

        return $response;
    }
}
