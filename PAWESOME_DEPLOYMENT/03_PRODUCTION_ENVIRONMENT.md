# 03 — Production Environment Configuration (Verified Live)

Date: 2026-11-28 · Source: `railway variables` on service `pawesome` (values redacted where secret)

## Application

| Variable | Value | Status |
|---|---|---|
| `APP_ENV` | `production` | ✅ |
| `APP_DEBUG` | `false` | ✅ |
| `APP_KEY` | set (fresh production key; not reproduced here) | ✅ |
| `APP_URL` | `https://pawesome-production-c73a.up.railway.app` | ✅ |
| `APP_TIMEZONE` | `UTC` | ✅ **corrected during deployment** — was `Asia/Manila`, which broke Eloquent UTC hydration (all datetimes −8h). `config/app.php` requires UTC; Manila semantics live in `ServiceDurationService::STORE_TIMEZONE` |
| `APP_NAME`, `APP_LOCALE`, `APP_FALLBACK_LOCALE`, `BCRYPT_ROUNDS` | set | ✅ |

## Database

| Variable | Value | Status |
|---|---|---|
| `DB_CONNECTION` | `mysql` | ✅ |
| `DB_HOST` | `mysql.railway.internal` (private network) | ✅ |
| `DB_PORT` | `3306` | ✅ |
| `DB_DATABASE` | `railway` | ✅ |
| `DB_USERNAME` / `DB_PASSWORD` | set (Railway-managed; not reproduced) | ✅ |

## CORS / frontend / Sanctum

| Variable | Value | Status |
|---|---|---|
| `FRONTEND_URL` | `https://pawesome-iota.vercel.app` | ✅ |
| `CORS_ALLOWED_ORIGINS` | `https://pawesome-iota.vercel.app` | ✅ exact origin, no wildcard |
| `CORS_SUPPORTS_CREDENTIALS` | `true` | ✅ |
| `SANCTUM_STATEFUL_DOMAINS` | `pawesome-iota.vercel.app` | ✅ |

## Session / security

| Variable | Value | Status |
|---|---|---|
| `SESSION_DRIVER` | `file` | ✅ acceptable — auth is Sanctum bearer tokens (DB), not sessions |
| `SESSION_LIFETIME` | `120` | ✅ |
| `SESSION_SECURE_COOKIE` | `true` | ✅ |
| `SESSION_ENCRYPT` | `false` | ✅ |
| `TRUSTED_PROXIES` | `*` | ✅ retained per report 03 analysis — Railway edge-only exposure, required for correct `X-Forwarded-Proto`/secure cookies; re-evaluate only if architecture changes |

## Queue / cache

| Variable | Value | Status |
|---|---|---|
| `QUEUE_CONNECTION` | `database` | ✅ changed from `sync` during this engagement (user decision) |
| `DB_QUEUE_RETRY_AFTER` | `180` | ✅ added — exceeds longest job timeout (120s) with margin |
| `CACHE_STORE` | `file` | ✅ |

## Storage

| Variable | Value | Status |
|---|---|---|
| `FILESYSTEM_DISK` | `public` | ✅ |
| `PUBLIC_STORAGE_DRIVER` | `local` | ✅ backed by `pawesome-volume` at `/app/storage/app` |
| `PRIVATE_STORAGE_DRIVER` | `local` | ✅ same volume; private disk is not publicly routed |

## Email

| Variable | Value | Status |
|---|---|---|
| `MAIL_MAILER` | `brevo` | ✅ |
| `BREVO_API_KEY` | set (not reproduced) | ✅ |
| `MAIL_FROM_ADDRESS` | configured sender (account-owner Gmail; must be Brevo-verified) | ⚠️ see report 09 — deliverability test pending |
| `MAIL_FROM_NAME` | `Pawesome` | ✅ |
| `BREVO_WEBHOOK_SECRET` | **not set** | ❌ webhook auth cannot be exercised until configured |

## AI / other

| Variable | Value | Status |
|---|---|---|
| `CHATBOT_AI_ENABLED` | `true` | ℹ️ enabled with `CHATBOT_GROQ_API_KEY`/`OPENROUTER_*` set — pre-existing owner configuration; not changed |
| `RECEIPT_SCANNER_ENABLED`, `RECEIPT_READER_*` | set | ℹ️ pre-existing |
| `LOG_CHANNEL`/`LOG_LEVEL`/`LOG_STACK` | set (`error` level) | ✅ |

## Frontend env (Vercel)

| Variable | Value | Status |
|---|---|---|
| `VITE_API_BASE_URL` | `https://pawesome-production-c73a.up.railway.app/api` | ✅ was empty before this engagement — fixed; verified in deployed bundle |

No secrets were written to Git or to these reports.
