# Remaining Risks — Capstone B (2026-10-25)

| ID | Issue | Severity | Impact | Next action | Blocks demo? |
|---|---|---|---|---|---|
| R-01 | 51+ uncommitted app files (Revision B WIP) | High (process) | uncommitted work isn't protected/reviewable | commit or branch the WIP | no |
| R-02 | Route-by-route authorization sweep across 731 routes | Medium | sampled gates are solid; unsampled routes could leak | scripted route×role probe | no |
| R-03 | Token TTL/rotation policy undocumented | Medium | long-lived PATs possible | document expiry/revocation or enforce TTL | no |
| R-04 | Mailbox delivery unproven | Medium | users may not receive mail in prod | verify on deployed env w/ real domain | no (demo unaffected) |
| R-05 | Full 606-suite not rerun this session | Low-Med | subset covers audited areas; regression outside scope possible | CI run before release | no |
| R-06 | No concurrency soak (simultaneous proof upload, double-click storms) | Low-Med | races handled per-test but not load-tested | optional soak test | no |
| R-07 | Unexercised payroll/audit/barcode/settings surfaces | Low | documented w/ "under preparation" caveat | exercise before certifying §9.3 | no |
| R-08 | Production hardening undone (queue worker, Redis, DNS auth, backups) | High for prod | mail/queue/storage depend on it | DEPLOYMENT_READINESS checklist | yes — prod only |
| R-09 | Legacy/unused routes (inventory variants, receptionist orders) | Low | dead surface confuses audit | deprecate or document | no |
| R-10 | `pawesome` dev DB accumulates E2E fixtures | Low | demo data hygiene | snapshot/cleanup before presentation | no |
