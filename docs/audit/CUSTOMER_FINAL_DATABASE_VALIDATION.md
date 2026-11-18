# Customer Role — Final Database Validation (Phase 8 + 9)

**Date:** 2026-11-18 · `pawesome_customer_audit` (MariaDB 10.4.32 local; MySQL 8 remains CI-gated)

## Integrity checks — all clean

| Query | Result |
| --- | --- |
| Orphan `pets` (no customer) | 0 |
| Orphan `service_requests` (no user) | 0 |
| Orphan `appointments` (dangling service_request_id) | 0 |
| Orphan `boarding_room_reservations` (source_type=pet_hotel, dangling boarding) | 0 |
| Invalid `service_requests.status` values | 0 |
| Invalid `payment_status` values | 0 |
| `paid` rows lacking `verified_by` | 0 (SR + boardings) |
| `pending` rows lacking proof+method | 0 |
| Overlapping approved room reservations | 1 pair, **capacity-legal** (2/5 units on `total_rooms=5` type; conflict logic at `BoardingController:1596` compares count vs `total_rooms`) |
| Duplicate transactions / duplicate receipts | 0 (receipt numbers unique `SR-REC-*`/`BD-REC-*` with timestamp+id suffix) |
| `failed_jobs` | 0 |
| `email_deliveries` duplicates | 0 (occurrence_key dedup enforced) |

## Transaction/rollback evidence
Approve paths run under `DB::transaction` + `lockForUpdate` (verified in `ReceptionistRequestController::performApprove`, `BoardingController::scheduleLegacyHotelRoom`); payment verify commits linked state atomically (`TransactionAtomicityTest` covers failure→rollback). Concurrent room submission → single reservation (Phase 12.2 evidence).

## Soft-delete behavior
`pets`, users/customers soft-delete with restore (SoftDeleteRetentionTest); boarding_rooms use `deleted_at`.

## MySQL 8 compatibility — static + simulation evidence

- Migration scan: **no incompatible constructs** (no `jsonb`, no `GENERATED ALWAYS`, no hardcoded `utf8mb4_0900`, no MariaDB-only syntax found).
- Phase 13 strict-mode simulation on MariaDB with the full MySQL-8 `sql_mode` set: **916 passed / 1 skipped / 1 failed** — the single failure reproduced under loose mode (local data issue, not a strict-mode regression).
- JSON columns, date handling, FK behavior and transactions behave identically in the exercised paths.
- **Authoritative MySQL 8 run = CI `mysql:8.0` job** — Docker unavailable locally, so a real MySQL 8 execution remains the environment gate. Risk assessed LOW given clean static scan + strict-mode sim + prior CI parity.

## Production-config surface (no secrets exposed)

| Item | State |
| --- | --- |
| `APP_DEBUG`/`APP_ENV` | `true`/`local` in dev `.env` — must be `false`/`production` at deploy (checklist item) |
| `SESSION_SECURE_COOKIE` | env-driven (unset for http dev; required in prod) |
| CORS | env-driven origin list + `supports_credentials`; exact prod origins required |
| Sanctum stateful domains | env-driven |
| Rate limiting | `throttle:api` on all groups; `throttle:60,1` on webhooks; auth throttling on login/register |
| Queue | `sync` locally — prod needs `queue:work --queue=emails,receipts,default` + scheduler |
| Mail auth | Brevo API-key transport; credentials present (never exposed); SPF/DKIM/DMARC need a real sending domain |
| Private storage | local private disk locally — prod needs S3-compatible private bucket |
