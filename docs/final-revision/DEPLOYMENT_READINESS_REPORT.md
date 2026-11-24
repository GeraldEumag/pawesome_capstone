# DEPLOYMENT_READINESS_REPORT.md — Pawesome Capstone B (Final Revision)

**Date:** 2026-11-24 · Target: Vercel (React/Vite frontend) + Railway (Laravel API/MySQL). `docs/DEPLOYMENT.md` is canonical; `backend/render.yaml` and nested deploy workflow are NOT active.

## 1. Readiness gates

| Gate | Status | Evidence / blocker |
|---|---|---|
| Backend suite on MySQL 8 | VERIFIED (this revision, pending final count) | `phpunit -c phpunit.mysql8.xml` on MySQL 8.0.44 @3307 |
| CI parity | VERIFIED (config) / HISTORICAL (last run) | `.github/workflows/ci.yml` runs full suite on `mysql:8.0`; last green run pre-revision — re-run requires push authorization |
| Frontend build + vitest | VERIFIED | 75/75 vitest; `vite build` green |
| Migrations on MySQL 8 | VERIFIED | 191 prior + 2 new additive migrations Ran clean on 3307 test DB |
| Queue/scheduler daemons | BLOCKED | Requires deployed env: `queue:work --queue=emails,receipts,default` + cron `schedule:run` |
| Email provider (Brevo) | PARTIAL | Outbox→SMTP→inbox proven end-to-end (recipient screenshot evidence 2026-11-18); `BREVO_API_KEY` REST + custom-domain SPF/DKIM/DMARC = external gates |
| Payment provider settlement | BLOCKED | GCash/Maya auto-confirm not wired; scanner assists cashier verification only |
| Edge HTTPS / prod CORS / Sanctum domains | BLOCKED | Deployment-time configuration |
| Production secrets/APP_KEY/APP_DEBUG | BLOCKED | Deployment checklist items |
| Backups/restore drills | BLOCKED | Requires deployed infra |

## 2. Deployment checklist status (from AGENTS.md release checklist)

- [ ] `APP_DEBUG=false`, production `APP_KEY`, prod DB credentials — deployment-time
- [ ] Exact production CORS/Sanctum/frontend/API domains — deployment-time
- [ ] Persistent volume or private/public object storage — deployment-time
- [ ] Queue worker/scheduler — deployment-time
- [ ] No demo seed accounts in prod — deployment-time
- [x] Dependency audit reviewed — `composer audit` clean; `npm audit` xlsx-only, risk-accepted (C-03)
- [ ] Backup/rollback tested — deployment-time
- [~] CI/health/smoke — CI config verified; latest run predates revision commits

## 3. Revision-relevant deployment notes

- Two new additive migrations must run on deploy (`migrate --force`); both reversible.
- New inventory fields are backward-compatible: existing items get NULL/default UOM packaging → treated as base-unit-only (conversion skipped when pack/box unset).
- No new environment variables, services, or infrastructure required.
- PAT TTL/rotation policy absent (C-02) — recommend documenting token lifetime expectations in ops runbook.

## 4. Verdict

**PARTIALLY VERIFIED / BLOCKED (external gates)** — code and test readiness confirmed; production deployment, provider credentials, domain auth, and daemon supervision cannot be verified locally and remain BLOCKED per acceptance rules.
