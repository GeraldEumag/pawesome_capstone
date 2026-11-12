# System Limits — Measured on the Dev Stack (2026-11-12)

Measured live against `php -d date.timezone=UTC -S 127.0.0.1:8000 -t public` (API),
XAMPP MySQL, Vite dev server. **Important:** `php -S` on Windows is
single-process/single-threaded — it serializes every request. Numbers below
are the dev-stack ceiling; a production php-fpm/Apache + real worker pool lifts
the concurrency limits substantially, but the application-level caps and the
unbounded-growth rows stay identical.

## Concurrency ceiling (dev stack)

`GET /api/health` — latency grows linearly with simultaneous requests (requests
queue instead of erroring; **0 errors at any level**):

| Concurrent | p50 | p95 | max |
| --- | --- | --- | --- |
| 1 | 735ms | 735ms | 735ms |
| 5 | 1,131ms | 1,923ms | 1,923ms |
| 10 | 2,340ms | 3,859ms | 3,859ms |
| 20 | 4,500ms | 7,927ms | 7,927ms |
| 40 | 8,083ms | 15,193ms | 15,577ms |
| 80 | 16,052ms | 29,934ms | 31,040ms |

Effective throughput ≈ 2.6 req/s; every extra concurrent client adds ~400ms.

`GET /api/customer/bookings` (heavy read, DB-backed):

| Concurrent | p50 | p95 |
| --- | --- | --- |
| 1 | 4,044ms | 4,044ms |
| 5 | 8,087ms | 14,075ms |
| 10 | 17,391ms | 30,259ms |
| 20 | 34,053ms | 57,731ms |

**Practical limit: ~10 concurrent heavy readers** on the dev stack — at 20,
p95 (57s) exceeds typical 30s client/proxy timeouts.

## Booking slot race (correctness under concurrency)

6 simultaneous `POST /api/customer/requests` for the same grooming slot:
**exactly 1 winner (201), 5 × 422 conflict.** Slot locking holds — no
double-booking under concurrency.

## Upload caps

Payment proof (`POST /api/customer/requests/{id}/payment-proof`):

| Size | Result |
| --- | --- |
| 5 MB | 200 accepted (~25s — includes the receipt-scanner read) |
| 5.2–39 MB | 422 `payment_proof must not be greater than 5120 kilobytes` |
| 41 MB | 413 — PHP `post_max_size` (40M) exceeded. **Edge defect:** emits a raw PHP warning before the JSON body, breaking the JSON contract. |

- App rule: `mimes:jpg,jpeg,png,webp,pdf | max:5120` (5 MB) — the real ceiling.
- PHP: `upload_max_filesize` = `post_max_size` = 40M, `memory_limit` = 512M,
  `max_execution_time` = 0 (unbounded).
- Landing-page image upload is stricter: `max:2048` (2 MB).
- Proof upload per request is one-shot: after a successful upload the row
  refuses further proofs (422 already-uploaded) until rejected.

## Rate limit

`throttle:api` default is **60 req/min per IP** (local `.env` currently
`API_RATE_LIMIT_PER_MINUTE=600` for E2E runs). 700 sequential requests over
~8 min never tripped 600/min — the single-threaded server itself can't exceed
~2.6 req/s sustained. Under the default 60/min, any client burst-writing more
than ~1 req/s hits 429 (this was the original E2E flake source).

## Booking window

`POST /api/customer/requests` at **+400 days → 201 accepted**. There is **no
advance-booking horizon** — customers can book indefinitely far out. Past
dates, holidays, closed days, and times outside 10:00–18:00 are refused by
validation, but nothing bounds the future. Worth a product decision.

## List/payload growth

Single-request measurements on the accumulated dev dataset (~550 bookings,
~560 customers):

| Endpoint | Status | Time | Payload |
| --- | --- | --- | --- |
| `GET /api/customer/bookings?range=all&tab=all` | 200 | 2,673ms | 320 KB |
| `GET /api/customer/my-requests` | 200 | 762ms | 625 KB |
| `GET /api/customer/requests/history` | 200 | 700ms | 625 KB |
| `GET /api/admin/customers` | 200 | 807ms | 258 KB |
| `GET /api/admin/reports/customers` | 200 | 6,949ms | 75 KB |

None of these paginate — payload and latency grow linearly with rows.
`/admin/reports/customers` at ~7s for ~560 customers is the heaviest read and
will hit timeout territory as data grows. `my-requests`/`history` return the
same 625KB payload shape.

## Business-rule limits (from code, not probed)

- Receipt scanner: **15 uploads per payable** (`receipt_scanner.max_uploads_per_payable`); 16th refused.
- Payroll periods: 1st–15th / 16th–end of month only.
- Same-day hotel check-in closes at **18:00**.
- Booking slots: shop hours **10:00–18:00**, grooming ~14 slots/day at 30-min intervals.
- Rate-limit override lives in local `.env` only (default 60/min stays the contract for real deployments).

## Bottom line

| Limit | Value | Type |
| --- | --- | --- |
| Concurrent requests (dev php -S) | ~2.6 req/s; latency queues, no errors | Infrastructure (dev) |
| Concurrent heavy readers | ~10 before p95 > 30s | Infrastructure (dev) |
| Same-slot double-book | Impossible — 1 winner enforced | Application (verified) |
| Payment proof size | 5 MB app / 40 MB PHP | Application + PHP |
| Landing image | 2 MB | Application |
| API rate | 60/min per IP (prod), 600/min local | Application |
| Advance booking | Unbounded (400d+ accepted) | Open gap — decide |
| Unpaginated lists | Grow linearly; heaviest ~7s at current data | Scaling risk |
| Receipt scans | 15 per payable | Application |
