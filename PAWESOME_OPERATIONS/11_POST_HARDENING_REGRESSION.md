# 11 — Post-Hardening Regression

**Status:** PASS
**Date:** 2026-11-28 · Changes under test: `ops:backup` command + schedule
(commit `ced76f4d`, deploy `80b23c34`), `BREVO_WEBHOOK_SECRET` env var.
No application behavior code was modified — the only new surface is the
backup command and the now-configured webhook auth.

## Automated suites

| Suite | Result |
|---|---|
| Backend PHPUnit (`php artisan test`, MySQL `pawesome_test`) | **1298 passed, 1 skipped** (6442 assertions, 404s) — includes email outbox, webhook-adjacent mailables, file authorization, RBAC, POS/idempotency, inventory |
| CI (`backend` + `frontend` jobs on `ced76f4d`) | green — required for Railway deploy `80b23c34` SUCCESS |

## Live production verification (executed, not assumed)

| # | Check | Result |
|---|---|---|
| 1 | `GET /api/health` | 200 `{"status":"ok"}` |
| 2 | Frontend `https://pawesome-iota.vercel.app` | 200 (~0.8s) |
| 3 | Staff login path | unchanged — `auth.api` 401s verified on admin/customer routes |
| 4 | Unauthenticated admin/customer/private-file probes | 401 / 401 / 401 (correct) |
| 5 | CORS evil origin | no ACAO returned — blocked |
| 6 | `ops:backup` manual run on prod | DB 1,017,714 B / 98 tables; storage 55,915,035 B / 158 files; manifest `ok` |
| 7 | Backup artifact integrity | gzip valid, byte-exact vs manifest; zip opens, 158 entries readable |
| 8 | Isolated DB restore | 98 tables, row-count parity on all key tables (report 03) |
| 9 | Webhook — no/wrong secret | 401 |
| 10 | Webhook — valid secret, empty/malformed/unknown-uuid/duplicate | 200 `processed:0/1`, graceful, idempotent, no state corruption |
| 11 | Queue state post-deploy | `jobs=0`, `failed_jobs=0`; drain cycles in logs |
| 12 | Email outbox state | 438 accepted / 3 suppressed / 0 pending / 0 failed |
| 13 | TLS certificates | backend LE valid→2027-02-24; frontend GTS valid→2027-01-29 |

## Not re-tested (unchanged surfaces)

Full 27-point smoke matrix was executed during deployment (report
`PAWESOME_DEPLOYMENT/10`); nothing in this phase touched booking, POS,
files, or auth code paths, so those results stand. Frontend Vitest/Playwright
suites were not re-run — zero frontend changes.

## Regression verdict

**PASS** — the hardening changes are additive (backup command, env var)
and the entire backend suite plus live probes confirm no behavioral
regression.
