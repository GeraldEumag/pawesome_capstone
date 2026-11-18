# Final System Discovery — Baseline

**Date:** 2026-11-18 · **HEAD:** `2eb0161` (reports rebase fix incl. e2e evidence) on top of `21e480a` (20 P1 defect remediation) · **Env:** PHP 8.2.12, Node 24.x, MariaDB 10.4.32 (sql_mode `NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION` — lenient, no STRICT_TRANS_TABLES), Docker unavailable.

## Verified commits
- `21e480a` — fix(reports): remediate all 20 P1 defects from reports module audit
- `2eb0161` — fix(reports): re-apply payrollReports removal lost in rebase; e2e evidence

## Stacks used
| Stack | API | Frontend | Database | Purpose |
|---|---|---|---|---|
| Dev | :8000 | — | `pawesome` | Gate B/C/D, integrity SQL, report reconciliation |
| Audit | :8001 | :3001 (`VITE_API_BASE_URL=:8001/api`) | `pawesome_reports_audit` | Gate A, Playwright, E2E workflows |
| Test | — | — | `pawesome_test` (mysql) | Full phpunit suite |

## Confirmed completed work
- Reports Module audit: 24 defects closed, 88 routes role-gated, RevenueService canonical (commits verified in tree).
- Customer Role finalization docs present and consistent with checkout.
- Audit docs: `REPORTS_MODULE_{AUDIT,ARCHITECTURE,DATABASE_RECONCILIATION,TEST_CASES,SECURITY_AUDIT,FINAL_READINESS}.md` plus customer/payroll/security/email finalization docs — all preserved untouched.

## Work rerun this pass (all recorded)
- Gate A cross-role E2E → 31 pass / 0 fail / 1 warn (`browser-evidence/cross-role-e2e-audit/audit-report-20261118-140615.json`).
- Gate B security/RBAC → 140 pass / 0 fail; 1 high + 3 medium = local `.env` dev values (`security-rbac-audit/security-rbac-audit-20261118-141034.json`).
- Gate C DB readiness → 122 pass / 0 fail / 2 warn (`database-readiness-audit/database-readiness-audit-20261118-131044.json`).
- Gate D report reconciliation → 50/50 PASS (`report-reconciliation-audit/report-reconciliation-audit-20261118-130552.json`).
- Full phpunit on `pawesome_test` → 1127 passed / 1 skipped (GD) / 0 failed, 5594 assertions, 406s.
- Vitest → 44/44 (9 files). Vite production build green.
- Playwright serial on audit stack → 15/15 (export regression 3, admin report charts 3, role smoke 9).

## Missing / pending evidence
- **MySQL 8 run:** no Docker, no MySQL 8 binary — MariaDB 10.4 only. CI run on MySQL 8 remains pending.
- **Production env values:** `.env` is local (`APP_ENV=local`, `APP_DEBUG=true`, empty DB password); production values must be set at deploy.
- **Real mail delivery:** local `MAIL_MAILER=log`; Brevo API key / verified sender domain / SPF-DKIM-DMARC not configured (no real domain).
- **Queue worker/scheduler supervision:** commands and schedule entries verified; no supervised daemon running locally.

## Unrelated modifications preserved
- All pre-existing untracked audit docs/evidence (4 Reports docs, browser-evidence JSONs) left untouched per safety rules.
