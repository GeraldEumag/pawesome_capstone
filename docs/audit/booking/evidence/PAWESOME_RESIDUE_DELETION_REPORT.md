# Working-DB Probe Residue — Deletion Report

**Date:** 2026-11-18 · **Operator:** Devin · **Approved by:** user (backup-then-delete)

## Incident

Probe runs 1–2 executed against `http://127.0.0.1:8010/api`, which was held by a
**stale worker-pool process (PID 22860)** from a previous session proxying to
legacy workers (:8001–8008) running against the working `pawesome` DB. The new
pool failed to bind (`EADDRINUSE`), so all probe writes landed in `pawesome`.
Detected via `service_requests` id divergence (pawesome=286 vs audit=279).

**Corrective:** audit pool re-established on `:8030` → workers :8011–8014
(env `DB_DATABASE=pawesome_booking_audit`), verified by direct worker auth and
token row creation in the audit DB only. Frontend re-pointed to `:8030`.

## Pre-deletion backup

- `backups/pawesome_backup_20261119_000031.sql` — 4,544,661 bytes, 94
  `CREATE TABLE` statements, valid dump header/footer. **Preserved.**

## Rows verified-by-PK then deleted (single transaction)

| Table | IDs | Identification |
| --- | --- | --- |
| `service_requests` | 280–286 | notes `audit*` / probe-created children |
| `appointments` | 70–73 | `service_request_id` ∈ 282–286 |
| `groomings` | 164 | `service_request_id` = 281 |
| `boardings` | 64 | `service_request_id` = 285 |
| `boarding_room_reservations` | 27 | `source_id` = boarding 64 |
| `medical_records` | 14, 15 | `appointment_id` ∈ {71,72} |
| `service_item_usages` | 220–223 | `service_id` ∈ {164,71,72,73} |
| `notifications` | 2399–2497 | `related_*` refs to deleted rows + probe sign-in notices |
| `email_deliveries` | 470–482 | `occurrence_key` refs sr 280–286 / appts 70–73 |
| `activity_logs` | 505–508 | descriptions reference appointments #71/#72 |

## Post-delete verification

All ten residue classes queried back: **0 rows remain**;
`MAX(service_requests.id)` = 279 (pre-probe state). Unrelated records intact —
only explicit IDs/ranges verified above were deleted; no broad date/pattern
deletes were used except the `notifications`/`email_deliveries` PK ranges whose
contents were individually inspected beforehand (all probe-related).
`personal_access_tokens` session rows left in place (normal Sanctum residue,
expire naturally).
