# Final Release Checklist

**Date:** 2026-11-18 — infrastructure gate pass complete; status per item with evidence.

## Application gates — COMPLETE
- [x] All critical/major application defects closed — 24 reports defects remediated (`21e480a`, `2eb0161`); zero new defects across both passes.
- [x] Customer Role baseline valid — `docs/audit/CUSTOMER_FINAL_*.md` consistent with checkout.
- [x] Reports baseline valid — commits verified, Gate D 50/50.
- [x] Full backend tests pass — 1127/1127 MariaDB `pawesome_test`; **1128 tests, 1 skip (GD), 0 fail on real MySQL 8.0.44 strict mode** (`phpunit.mysql8.xml`).
- [x] MySQL 8 compatibility — **verified twice**: local MySQL 8.0.44 strict mode (1128 tests, 1 skip, 0 fail) **and** GitHub Actions run `44308050820` on `mysql:8.0` — backend + frontend **success** on HEAD `2eb0161`.
- [x] Browser smoke tests pass — 15/15 serial Playwright, audit stack.
- [x] Financial reports reconcile independently — Gate D 50/50; RevenueService canonical.
- [x] RBAC & sensitive-data access pass — Gate B 140/0-fail.
- [x] Email outbox + webhook mechanism verified — dispatch/suppression/receipts; webhook 401/200 auth verified; `hard_bounce` → suppression row verified.
- [x] SMTP transport verified — real Brevo relay 250 acceptance.
- [x] Recipient inbox delivery confirmed — test mail + 8 notification types landed in Gmail Primary (screenshot `browser-evidence/email-delivery/gmail-inbox-confirmation-20261118.png`).
- [x] Customer-store decision recorded — 410 disabled state preserved.
- [x] Production config structure verified — template + session/cors/sanctum/https review; `SESSION_SECURE_COOKIE` template fixed.

## Environment gates — PENDING (deploy-time)
- [ ] Deployed env: `APP_ENV=production`, `APP_DEBUG=false`, real `APP_KEY`, DB credentials.
- [ ] Exact production CORS / Sanctum stateful / frontend / API domains.
- [ ] HTTPS termination verified at deployed edge.
- [ ] Queue worker + scheduler daemons live (`queue:work --queue=emails,receipts,default`, cron `schedule:run`).
- [ ] Private/persistent storage provisioned (Railway volume or S3-private).
- [ ] `BREVO_API_KEY` (REST) configured → provider-side delivery/bounce/spam event verification (optional — webhook already reconciles).
- [ ] Sender domain verified; SPF/DKIM/DMARC published (requires custom domain).
- [ ] Deployed `POST /api/webhooks/brevo` registered in Brevo with `X-Pawesome-Webhook-Secret` custom header.
- [ ] No demo seed accounts in production data.
- [ ] Backup/restore tested; health check + post-deploy smoke.
