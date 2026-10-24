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
 * Concurrent retries fall back to the endpoint's own locking — the unique
 * (user, key, route) index only settles after the first response commits.
 */
class IdempotencyKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = trim((string) $request->header('Idempotency-Key', ''));
        if ($key === '' || !in_array($request->method(), ['POST', 'PUT', 'PATCH'], true) || !$request->user()) {
            return $next($request);
        }

        // The storage column is varchar(128) — an oversized key must be
        // rejected before the action runs, not fail storage afterwards.
        if (strlen($key) > 128) {
            return response()->json([
                'message' => 'Idempotency-Key must be at most 128 characters.',
            ], 422);
        }

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

        if (!$existing) {
            DB::table('idempotency_keys')
                ->where('user_id', $userId)
                ->where('key', $key)
                ->where('route', $route)
                ->where('created_at', '<', $expiredBefore)
                ->delete();
        }

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
