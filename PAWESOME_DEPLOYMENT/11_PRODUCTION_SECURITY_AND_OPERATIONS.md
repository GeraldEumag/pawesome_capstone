# 11 — Production Security and Operational Check

Date: 2026-11-28 · Verified live where executable

## Security configuration

| Check | Result | Evidence |
|---|---|---|
| `APP_DEBUG=false` | ✅ | `railway variables` |
| `APP_ENV=production` | ✅ | env |
| Secrets exposure | ✅ none | no secrets in reports/logs/bundle; `.env` → 404; `VITE_*` contains only public API URL |
| CORS restricted | ✅ | `CORS_ALLOWED_ORIGINS` = exact Vercel origin; evil origin receives **no** `Access-Control-Allow-Origin`; credentials only with exact origin |
| HTTPS enforced | ✅ | HTTP → 301 HTTPS on API domain; Vercel serves HTTPS |
| `TRUSTED_PROXIES=*` | ✅ retained | Railway edge-only model (documented in go-live report 03); required for correct proto/cookies |
| Private uploads protected | ✅ | pet photos/payment proofs behind signed authenticated routes: no-auth 401, cross-user 403 |
| Auth/RBAC | ✅ | 401 unauthenticated, 403 wrong-role across admin/POS/customer surfaces |
| Dev-only routes/creds | ✅ none found | no test endpoints exposed; seeded admin is a real staff account |
| Logs vs secrets | ✅ | deploy/runtime logs contain no credentials; `LOG_LEVEL=error` |
| Health endpoint hygiene | ✅ | `/api/health` returns only `{"status":"ok","success":true,"message":"OK"}` — no config/infra disclosure |

## Corrected during engagement

- **`APP_TIMEZONE`**: was `Asia/Manila` → **set to `UTC`** (required by `config/app.php` UTC-storage convention; Manila business semantics remain via hardcoded `STORE_TIMEZONE`). Without this, every stored datetime would read back −8h.
- **Composer advisories**: 9 Symfony CVEs cleared (`03bb8024`) — also unblocked the CI-gated deploy pipeline.

## Operations status

| Capability | Status |
|---|---|
| DB backups | ⚠️ point-in-time via Railway volumes + proven restore; **no automated off-site schedule yet** (report 05) |
| Queue failures observable | ✅ `failed_jobs` table + `queue:failed`; currently 0 |
| Email failures observable | ✅ `email_deliveries.status/failure_class/failure_code/provider_status` + `email-deliveries:reconcile` |
| Scheduler observable | ✅ deploy logs show every scheduled run |
| Storage capacity | ⚠️ volume 434M, 14% used — no alerting configured |
| Uptime monitoring | ❌ none configured — recommend external monitor on `/api/health` |
| Brevo webhook secret | ❌ unset — delivery-event webhooks inactive |

## Outstanding operational gaps (owned, not blockers for initial go-live)

1. Scheduled off-site DB+storage backups (P2).
2. `BREVO_WEBHOOK_SECRET` + Brevo webhook registration (P2 — needed for delivery-event reconciliation).
3. Uptime alerting on `/api/health` (P2).
4. Dedicated queue worker service (P3 — scheduler drain suffices at current volume; ~60s worst-case email latency).
