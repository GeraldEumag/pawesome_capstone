# 00 — Production Baseline (Post-Deployment Hardening)

Date: 2026-11-28 · Live deploy: `a036fb76` @ `d1fda4af` (app code identical to `20fe0c53`)

## Change-control verification

| Item | State |
|---|---|
| Git HEAD | `d1fda4af` on `main`, clean tree (untracked evidence dirs only) |
| Railway live deploy | `a036fb76` SUCCESS — commit `d1fda4af` |
| Vercel | production alias serving build from `main` |
| `/api/health` | 200 `{"status":"ok"}` |
| Frontend | 200 |
| Changes since `20fe0c53` | docs-only (`PAWESOME_DEPLOYMENT/` reports) — zero app-code drift |

## Baseline metrics (live, via `railway ssh` + tinker)

| Metric | Value |
|---|---|
| Database size | **9.4 MB** across **98 tables** |
| Key row counts | users 49 · customers 36 · pets 25 · appointments 31 · sales 21 · inventory_items 846 · service_requests 80 |
| Queue backlog | `jobs` = **0**, `failed_jobs` = **0** |
| Email outbox | `accepted` 438 · `suppressed` 3 · **pending 0** · failures 0 |
| Oldest pending email | none |
| Storage | `storage/app` = **59 MB** of 434 MB volume (**14%**) |
| Laravel log | `storage/logs/` empty — `LOG_LEVEL=error`, channel emits to Railway log drain |

## Smoke-test residue identified (for Phase 7)

- User id 52 (`kiezerherristpascua+smoke…`), customer_id 39
- Pets 23, 24, 25 (SmokePet, SmokePetPhoto, SmokeRabbit)
- Appointments 30, 31 (requested, Dec 1–2)
- Inventory item 846 `SMOKE-001` (stock 45 after decrement)
- POS sale/TRX id 21 `TRX-6B0AB43C714E1` (completed, ₱200)
- email_deliveries 442–445 (accepted test sends)

## Baseline conclusion

System is healthy: empty queues, zero email failures, modest data/storage footprint. No cleanup performed (per Phase 0 rules).
