<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Boundary normalizer for API JSON responses.
 *
 * Additive only — existing top-level keys are preserved so current frontend
 * consumers keep working:
 *
 *   - Adds "success" (true for <400, false otherwise) when absent.
 *   - Adds "message" when absent (HTTP reason phrase / 'OK').
 *   - Renames nothing; if a legacy "error" key exists without "message",
 *     copies it into "message".
 *   - Laravel paginator payloads ({data, current_page, last_page, ...})
 *     additionally get a "meta" block; original keys are kept.
 *   - Bare top-level JSON arrays are wrapped as { success, message, data }.
 *   - Non-JSON responses (streams, downloads, file views) pass through.
 */
class NormalizeApiResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (!$request->is('api/*') || !$response instanceof JsonResponse) {
            return $response;
        }

        $payload = $response->getData(true);

        if (!is_array($payload)) {
            return $response;
        }

        $status = $response->getStatusCode();

        // Bare top-level array → wrap in the envelope's data field.
        if (array_is_list($payload)) {
            $payload = [
                'success' => $status < 400,
                'message' => 'OK',
                'data' => $payload,
            ];
        } else {
            if (isset($payload['error']) && !isset($payload['message'])) {
                $payload['message'] = $payload['error'];
            }
            if (!array_key_exists('success', $payload)) {
                $payload['success'] = $status < 400;
            }
            if (!array_key_exists('message', $payload)) {
                $payload['message'] = $status >= 400
                    ? (Response::$statusTexts[$status] ?? 'Error')
                    : 'OK';
            }

            // Paginator-shaped payload → also expose a meta block.
            if (isset($payload['data'], $payload['current_page'], $payload['last_page'], $payload['total'])
                && is_array($payload['data']) && !isset($payload['meta'])) {
                $payload['meta'] = [
                    'current_page' => $payload['current_page'],
                    'last_page' => $payload['last_page'],
                    'per_page' => $payload['per_page'] ?? null,
                    'total' => $payload['total'],
                    'from' => $payload['from'] ?? null,
                    'to' => $payload['to'] ?? null,
                ];
            }
        }

        $response->setData($payload);

        return $response;
    }
}
