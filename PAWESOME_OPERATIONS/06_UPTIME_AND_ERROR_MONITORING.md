# 06 — Uptime & Application Monitoring

**Status:** BLOCKED — requires an external monitoring account (user action)
**Date:** 2026-11-28
**Current state:** no external uptime/error monitoring exists (accepted risk
R3 from deployment). Railway + Vercel provide platform logs/metrics only.

## Targets (verified reachable now)

| Target | URL | Live check (2026-11-28) |
|---|---|---|
| Backend health | `https://pawesome-production-c73a.up.railway.app/api/health` | 200 `{"status":"ok","success":true,"message":"OK"}` |
| Frontend | `https://pawesome-iota.vercel.app` | 200, ~0.8 s |
| TLS backend | `*.up.railway.app` | Let's Encrypt, valid to **2027-02-24** |
| TLS frontend | `*.vercel.app` | Google Trust Services, valid to **2027-01-29** |

`/api/health` intentionally returns only `{"status":"ok"}` — no internals
disclosed. Keep it that way; do not "enrich" it with DB/queue detail
publicly.

## Recommended setup — USER ACTION REQUIRED

**Pick ONE free-tier service** (do not stack several):

### Option A — UptimeRobot (recommended: simplest)

1. Sign up at uptimerobot.com (free: 50 monitors, 5-min checks).
2. Add HTTP(s) monitor: `https://pawesome-production-c73a.up.railway.app/api/health`
   - Keyword monitor: expect `"status":"ok"` (catches 200-with-error-body).
3. Add HTTP(s) monitor: `https://pawesome-iota.vercel.app`
   - Keyword: `Pawesome`.
4. Alert contacts: email + optional SMS. Interval: 5 min (free tier).
5. Enable "alert on TLS certificate expiry < 14 days" if offered.

### Option B — Better Stack (better logs+uptime in one)

1. betterstack.com → Uptime → create two HTTP checks (same URLs/keywords).
2. Optional: Laravel exception reporting via its Laravel integration —
   only if you want stack traces; requires `SENTRY_LARAVEL_DSN`-style env.
   **Recommendation: skip exception-tracking SaaS for capstone** — Railway
   logs + `laravel.log` on the volume are sufficient; revisit if traffic
   grows.

## Application-error monitoring (no new service needed)

| Signal | Where to look | Cadence |
|---|---|---|
| Laravel exceptions / 500s | `storage/logs/laravel.log` on volume; Railway service logs | daily |
| Failed queue jobs | `php artisan queue:failed` / `failed_jobs` table | daily |
| DB connection failures | surfaced as 500s + log entries | daily |
| Scheduler failures | `schedule:work` output in Railway logs | daily |
| Storage errors | log + volume usage | weekly |
| Email provider failures | `email_deliveries.status=failed/unknown`, `failed_jobs` | daily |
| Backup failures | `storage/app/backups/manifests/` — missing daily manifest = failed run | daily |

A daily ops checklist is codified in `12_PRODUCTION_OPERATIONS_RUNBOOK.md`.

## Security constraints for monitoring

- Monitors hit **public URLs only** — send no auth headers, no tokens, no
  `APP_KEY`/DB creds. UptimeRobot/Better Stack need nothing secret.
- Do NOT point a monitor at authenticated endpoints or file URLs
  (`/api/files/…` signed URLs expire anyway).
- Status pages (if enabled) should show only up/down — no version, env,
  or infra details.
- Brevo webhook secret and all env secrets stay out of any monitoring
  payload — verified: nothing in this design transmits them.

## Acceptance criteria once configured

- [ ] Two monitors live, 5-min interval, keyword-checked
- [ ] Test alert received (UptimeRobot: pause backend briefly OR use their
      "test notification" — do not take prod down just to test)
- [ ] TLS-expiry alerting enabled
- [ ] Alert contact is a mailbox the owner actually reads
