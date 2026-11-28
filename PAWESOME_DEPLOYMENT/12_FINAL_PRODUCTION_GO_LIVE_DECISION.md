# 12 — Final Production Go-Live Decision

Date: 2026-11-28 · Live commit: `20fe0c53` on `main` (both remotes)

## Decision: **GO LIVE WITH ACCEPTED RISKS**

## Gate evaluation

| Gate | Status |
|---|---|
| Backend deployment verified | ✅ live, healthy, correct commit |
| Frontend deployment verified | ✅ live, correct API URL baked in |
| Database migrations verified | ✅ nothing pending; pre-deploy backup taken & verified |
| Backup/recovery procedures active | ⚠️ point-in-time restore proven; **automated schedule not yet configured** — accepted risk R1 |
| Queue and scheduler operating | ✅ database queue + scheduled drain verified live (jobs=0, failed=0) |
| Email activation verified | ✅ Brevo `accepted` for verification/reset/booking emails; inbox placement pending owner confirmation — accepted risk R2 |
| 27 smoke tests | ✅ 25 unconditional PASS + 2 PASS pending inbox confirmation |
| Unresolved P0/P1 security/functional blockers | ✅ none — the two defects found (composer advisories, APP_TIMEZONE, empty VITE_API_BASE_URL, missing worker) were all **fixed and re-verified live** |

## Verified vs. claimed — honest ledger

- **Verified live:** health, HTTPS, frontend load, API URL, staff+customer auth, registration, pet+photo, species accept/reject, booking, booking+verification+reset emails accepted by Brevo, inventory CRUD+adjust, POS sale, VAT math, receipt, live PDF render (317KB), private-file protection (401/403), outbox→queue→worker→provider pipeline, scheduler execution, RBAC, CORS.
- **Passed with caveat:** email *inbox* delivery (provider acceptance proven; mailbox confirmation outstanding).
- **Blocked/not tested:** Brevo webhook auth (secret unset — fail-closed by design), provider-failure injection (non-destructive choice), browser-driven UI click-through (API-level verification only).
- **Not tested:** load/stress, real payment gateway (none integrated — POS is manual), custom domain.

## Accepted risks (owner: project owner)

| ID | Risk | Severity | Mitigation | Deadline suggestion |
|---|---|---|---|---|
| R1 | No automated off-site backups; only Railway volume snapshots + manual dumps | P2 | Schedule daily `mysqldump` → S3/R2/B2, retention 30d/12w/12m; quarterly restore drill | Before onboarding real volume |
| R2 | Email inbox delivery unconfirmed; `BREVO_WEBHOOK_SECRET` unset | P2 | Owner confirms test emails in inbox; set webhook secret in Railway + Brevo | This week |
| R3 | No uptime/queue/email-failure alerting | P2 | External monitor on `/api/health`; daily `queue:failed`/`email_deliveries` check | This week |
| R4 | Queue drain runs inside scheduler (~60s worst-case latency; shares web container) | P3 | Split dedicated worker service via Railway dashboard when traffic grows | As needed |
| R5 | Smoke-test records remain in prod DB (user 52, pets 23–25, appointments 30–31, item SMOKE-001, TRX-21) | P3 | Owner may delete/archive via UI; all clearly labeled "Smoke" | Anytime |
| R6 | `MAIL_FROM_ADDRESS` is a Gmail sender — Brevo sends signed but not domain-authenticated | P3 | Verify inbox placement; configure real domain + SPF/DKIM/DMARC when available | When domain procured |

## Why not NO GO LIVE

Every deployment gate passed with live evidence; the only gaps are operational maturities (backups scheduling, alerting, webhook secret) that don't impair current function and are documented with mitigations. Why not unconditional GO LIVE: R1–R3 are real risks the owner should explicitly accept.
