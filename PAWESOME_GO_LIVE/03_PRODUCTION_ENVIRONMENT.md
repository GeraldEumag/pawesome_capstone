# 03 — Production Environment Variables

**No secret values appear in this file.** All secrets go into the
hosting platform's secret/env store only.

## Backend (Railway service variables)

### Required — application identity

| Variable | Production value | Notes |
| --- | --- | --- |
| `APP_NAME` | `Pawesome` | |
| `APP_ENV` | `production` | |
| `APP_KEY` | **fresh `base64:...`** | Generate once via `php artisan key:generate` locally, paste into Railway Variables, **never commit/print**. Losing it invalidates encrypted data (email recipients, suppression descriptors). |
| `APP_DEBUG` | `false` | Non-negotiable |
| `APP_URL` | `https://<api-domain>` | No trailing slash |
| `FRONTEND_URL` | `https://<frontend-domain>` | Used in email links |
| `APP_TIMEZONE` | `Asia/Manila` | **Decision needed** — business operates in PH; default UTC shifts booking/attendance day boundaries. Recommend `Asia/Manila`. |

### Required — database

| Variable | Value |
| --- | --- |
| `DB_CONNECTION` | `mysql` |
| `DB_HOST` | Railway MySQL **internal** hostname (private network) |
| `DB_PORT` | `3306` |
| `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | From Railway MySQL service |

### Required — HTTP/security

| Variable | Recommended value | Analysis |
| --- | --- | --- |
| `SESSION_DRIVER` | `file` **or `cookie`** | API auth is Sanctum **bearer tokens** (`personal_access_tokens` table) — sessions are not the auth mechanism. `file` sessions live in `storage/framework/sessions` (ephemeral, outside the `storage/app` volume) → lost on redeploy; impact ≈ nil since tokens carry auth. `cookie` driver is encrypted client-side, survives restarts, needs no table — **marginally safer**; `database` would need a `sessions` table migration that doesn't exist. Either is acceptable; `file` is fine. |
| `SESSION_LIFETIME` | `120` | |
| `SESSION_SECURE_COOKIE` | `true` | Required behind HTTPS edge |
| `SANCTUM_STATEFUL_DOMAINS` | `<frontend-host>` (no scheme) | Exact host only |
| `CORS_ALLOWED_ORIGINS` | `https://<frontend-origin>` | **Exact origin; never `*`** — custom Cors middleware would reflect `*` WITH credentials |
| `CORS_SUPPORTS_CREDENTIALS` | `true` | |
| `TRUSTED_PROXIES` | `*` | **Reviewed:** Railway does not publish stable proxy CIDRs; the container port is not publicly reachable except through Railway's edge, so `*` is the practical choice and is required for correct `X-Forwarded-Proto/Host` (HTTPS URLs, secure cookies). Risk accepted: direct container access would allow header spoofing — not possible via Railway's public surface. Keep `*`; do NOT tighten to guessed CIDRs. |

### Required — storage/queue/cache

| Variable | Recommended | Notes |
| --- | --- | --- |
| `FILESYSTEM_DISK` | `public` | |
| `PRIVATE_STORAGE_DRIVER` / `PUBLIC_STORAGE_DRIVER` | `local` | With volume mounted; switch both to `s3` later without code change |
| `PRIVATE_STORAGE_ROOT` / `PUBLIC_STORAGE_ROOT` | (empty → defaults) | Only needed for s3/custom paths |
| `QUEUE_CONNECTION` | **`database`** (prod) | `jobs`/`failed_jobs` tables exist via default migrations — works out of box. `sync` only for demo. |
| `DB_QUEUE_RETRY_AFTER` | `180` | **Correction to prior report:** correct env name is `DB_QUEUE_RETRY_AFTER` (default 150). Job max timeout = `ProcessReceiptScan` **120s** (verified). 150>120 already, but set `180` explicitly for headroom. |
| `CACHE_STORE` | `file` | Single-node OK; `database` also works (`cache` table exists) |

### Required — email

| Variable | Value |
| --- | --- |
| `MAIL_MAILER` | `brevo` |
| `BREVO_API_KEY` | Secret — Brevo REST API key |
| `MAIL_FROM_ADDRESS` | Brevo-verified sender |
| `MAIL_FROM_NAME` | `Pawesome` |
| `BREVO_WEBHOOK_SECRET` | If delivery-event webhook enabled |
| `MAIL_PHYSICAL_ADDRESS` | Already in `.env.example` (CAN-SPAM style footer) |

### Optional

| Variable | Notes |
| --- | --- |
| `CHATBOT_AI_ENABLED` | `false` unless Gemini/Groq key verified |
| `CHATBOT_GROQ_API_KEY` / `CHATBOT_AI_API_KEY` | Backend secret only |
| `AWS_*` | Only if moving storage to S3 |
| `LOG_LEVEL` | `error` (example default) |

## Frontend (Vercel env — baked at build)

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://<api-domain>/api` — **must be set before the production build**; rebuilding without it bakes the dev URL |

## APP_KEY safety procedure

1. Generate locally: `cd backend && php artisan key:generate --show` (prints once — copy directly into Railway Variables, don't save to file).
2. Never commit; never paste into reports/chat.
3. Preserve: it encrypts `email_deliveries` recipients + suppression descriptors — losing it orphans those rows.
4. No rotation needed (fresh env).

## Variables verified as actually used

Cross-checked against `config/*.php` + `env()` calls: every variable
above is consumed; `REDIS_*`/`MEMCACHED_*` are optional (only if those
drivers chosen). `BREVO_DOMAIN` only if Brevo assigns regional endpoint.
