# Unified API Response Convention

All `/api/*` JSON responses carry a consistent envelope:

```json
{ "success": true, "message": "Payment verified successfully.", "data": {} }
{ "success": false, "message": "Unauthorized action.", "errors": {} }
```

| Field | Always? | Meaning |
|---|---|---|
| `success` | yes | `true` when HTTP status < 400, `false` otherwise |
| `message` | yes | Human-readable summary; HTTP reason phrase when absent upstream |
| `data` | on bare arrays / `ApiResponse` | Payload |
| `errors` | errors only | Field-keyed validation errors (Laravel 422 shape) |
| `meta` | paginated only | `current_page`, `last_page`, `per_page`, `total`, `from`, `to` |

## Implementation — boundary normalization, not controller rewrites

`App\Http\Middleware\NormalizeApiResponse` is appended to the `api` middleware
group in `bootstrap/app.php`. It post-processes `JsonResponse`s for `api/*`
requests **additively**:

- `success` added only when absent (existing `success: false` on a 200 is preserved).
- `message` added only when absent; a legacy `error` key is copied to `message`.
- Laravel paginator payloads (`{data, current_page, last_page, total, ...}`)
  additionally get `meta`; the original keys stay for existing consumers.
- Bare top-level JSON arrays are wrapped as `{success, message, data: [...]}`.
- Non-JSON responses (streams, CSV exports, secure-file views) pass through.

Because existing keys are never moved or removed, every current frontend
consumer keeps working — `res.data.users`, `res.customers`, `res.requests`,
and `normalizeList` fallbacks all still resolve.

## Deliberate-migration helper

`App\Support\ApiResponse` provides the canonical envelope for new endpoints or
deliberate controller migrations:

```php
ApiResponse::success($data, 'Booking approved successfully.');
ApiResponse::error('Unauthorized action.', 403);
ApiResponse::error('The given data was invalid.', 422, $validator->errors()->toArray());
ApiResponse::paginated($paginator, 'Users retrieved successfully.');
```

## Frontend consumption

`apiRequest()` in `frontend/src/api/client.js` returns the parsed body and
already reads `message` / `errors` for errors; `normalizeList()` accepts
`{data: [...]}` so wrapped arrays are compatible. No frontend changes were
required.

## Intentionally unchanged

- Streamed/download responses (CSV exports, `SecureFileController` file views)
  — binary bodies are not JSON and pass through untouched.
- Non-API routes (web) — the middleware is scoped to `api/*`.
- Custom paginated shapes such as `{customers: [...], pagination: {...}}` —
  gain `success`/`message` but keep their original keys; a future pass can
  standardize them onto `data` + `meta` if desired.

## Tests

`backend/tests/Feature/ApiResponseEnvelopeTest.php` — 11 tests covering the
envelope on legacy message-only responses, bare-array wrapping, 401/403/422
error shapes, paginator `meta` with preserved keys, no double-wrapping,
stream pass-through, explicit `success:false` preservation, and the
`ApiResponse` helper contract.
