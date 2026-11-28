# 01 — Production Environment Audit

## Laravel backend configuration

| Setting | Mechanism | Production posture |
| --- | --- | --- |
| `APP_ENV` / `APP_DEBUG` | env | `.env.example` ships `production`/`false`; must be set per-host. **Verified statically only** — no production env exists yet. |
| `APP_KEY` | env | Empty in example; must be generated per environment (`php artisan key:generate`). Never reuse dev key. |
| `APP_URL` / `FRONTEND_URL` | env | Example points at placeholder Railway/Vercel origins — must be replaced with real domains. |
| `APP_TIMEZONE` | env | `env('APP_TIMEZONE','UTC')` in `config/app.php` (fixed in prior inventory audit). Business timezone must be set intentionally for booking/attendance correctness. |
| Logging | `LOG_CHANNEL=stack`, `LOG_LEVEL=error`, `LOG_STACK=single` | Single-file log; acceptable for capstone scale; see report 11 for retention/monitoring gaps. |
| Session | `SESSION_DRIVER=file`, `SESSION_SECURE_COOKIE=true` (example), `SESSION_HTTP_ONLY=true` default, `same_site=lax` | Correct for cookie-based auth behind TLS. `SESSION_ENCRYPT=false` default — acceptable since session payload isn't sensitive beyond user id, but enable if compliance requires. |
| Cache | `CACHE_STORE=file` (example) | Fine for demo scale; `database`/`redis` available. Note: `ApiTokenAuth` inactivity check + `IdempotencyKey` middleware rely on cache — file cache works on single node; multi-node needs shared cache. |
| Queue | `QUEUE_CONNECTION` env; default in `config/queue.php` is `database` | `.env.example` sets `sync` — correct for demo; **production must use `database` (or redis) + worker** or email outbox intents never send (see reports 06/07). |
| Filesystem | `FILESYSTEM_DISK=public` default; separate `private`/`public` disks with local-or-S3 drivers via `PRIVATE_STORAGE_DRIVER`/`PUBLIC_STORAGE_DRIVER` | Well-designed dual-disk split; payment proofs can stay private. S3 supported via flysystem-aws-s3-v3. |
| Database | mysql env-driven | Standard. |
| Mail | `MAIL_MAILER=brevo` + `BREVO_API_KEY`, `MAIL_FROM_*`, reply-to, physical address | HTTPS API mailer (no SMTP needed). `MAIL_MAILER` fallback in `config/mail.php` is `log` — safe default. |
| Trusted proxies | `TRUSTED_PROXIES` env, default `*` in `bootstrap/app.php` | Required behind Railway/Vercel/Cloudflare edge; `*` is acceptable at edge-terminated TLS but should be narrowed to actual proxy CIDRs if the origin is directly reachable. |
| CORS | Custom `App\Http\Middleware\Cors` (replaces Laravel's) reading `CORS_ALLOWED_ORIGINS` | Production path only reflects env-listed origins. **Note:** `config/cors.php` `allowed_origins_patterns` still whitelists any `localhost/127.0.0.1` origin, but that file is inert — the custom middleware is what's registered. If `CORS_ALLOWED_ORIGINS` ever contains `*`, the middleware reflects it **with credentials** — do not set `*` in production. |
| Sanctum | `SANCTUM_STATEFUL_DOMAINS` env; `sanctum.expiration=null` | Token auth is bearer-only via custom `ApiTokenAuth` (rejects `?token=`). Inactivity timeout enforced via `SystemSetting security_session_timeout` (default 60 min, clamped 15–480). Per-token `expires_at` honored. Long-lived tokens possible if `expires_at` null — see security report. |

## Frontend configuration

- `vite.config.js`: dev proxy `/api` + `/storage` → `127.0.0.1:8000`;
  `build.outDir = "build"`; esbuild drops `debugger`. Clean.
- `src/api/client.js` reads `VITE_API_BASE_URL` (env) with fallbacks —
  no hardcoded production secrets; `frontend/.env` is gitignored and
  contains only `VITE_API_BASE_URL=http://localhost:8000/api` (dev value,
  non-secret).
- `.env.example` ships `VITE_API_BASE_URL=https://api.example.com/api`
  placeholder. **Production build MUST set the real API origin** — a
  Vite build bakes this in at build time; wrong value = broken deploy.
- No `VITE_*` secrets exist or are needed (all secrets are backend-side
  by design — verified: Brevo/Groq keys only read in Laravel). 
- Console-error hygiene verified previously via Playwright smoke specs
  (8 role dashboards, zero console errors).

## Environment safety checklist

| Check | Result |
| --- | --- |
| `.env` tracked? | **No** — gitignored (backend + frontend) |
| Secrets committed? | None found; `.env.example` has names/placeholders only; `.env.testing` has inert test values |
| `APP_DEBUG=false` in prod config | Yes (example + docs mandate it) |
| Stack traces in prod errors | `bootstrap/app.php` renders JSON for `api/*`; Laravel default hides traces when `APP_DEBUG=false` |
| Dev credentials reused in prod | N/A until prod env exists — runbook requires fresh `APP_KEY` + DB creds |
| Health endpoint | `/up` (Laravel) + `/api/health` (used by `railway.json` healthcheck) |

## PHP runtime requirements for production host

Required extensions (from composer/platform + code usage): `bcmath`,
`curl`, `dom`, `fileinfo`, `intl`, `mbstring`, `openssl`, `pdo_mysql`,
`tokenizer`, `xml`, `zip`, **`gd`** (dompdf image handling — absent in
local XAMPP PHP but installed in CI; must exist on host). PHP `^8.2`.

## Status: PASS (static) / NOT VERIFIED (no live production env exists)

The configuration surface is production-ready **by design**; every
concrete value (APP_KEY, DB creds, domains, Brevo key, S3 creds) is an
owner action at deploy time, enumerated in report 14.
