# 02 — Deployment Architecture Audit

## 1. Existing architecture (as documented + verified in repo)

Two documented target architectures exist; both are **configuration
guidance, not provisioned infrastructure**:

**Canonical (docs/DEPLOYMENT.md):**
- Frontend → **Vercel** (project root `frontend/`, Vite `build/` output)
- Backend → **Railway** Laravel service (root `backend/`)
- Database → Railway MySQL
- Edge/DNS/TLS → Cloudflare (when domain owned)
- Email → Brevo HTTPS API; Chatbot → optional Gemini (backend secret only)

Supporting artifacts verified present:
- `backend/Dockerfile` — multi-stage: Node assets build → `php:8.2-cli-bookworm`
  with `pdo_mysql mbstring bcmath intl zip curl opcache pcntl` + **gd absent
  from ext-install list** (dompdf tolerates missing gd for basic rendering;
  CI installs gd — see risk R-3).
- `backend/railway.json` — `preDeployCommand: php artisan migrate --force`,
  `startCommand` runs `config:cache && storage:link`, a **`schedule:work`
  background loop**, then `artisan serve`; healthcheck `/api/health`;
  restart ON_FAILURE ×5.
- `docker-compose.yml` — local MySQL 8 fallback (dev only).
- `backend/render.yaml`, nested `backend/.github/workflows/deploy.yml` —
  **legacy, not canonical** (GitHub doesn't discover nested workflows).

**Alternative (docs/DEPLOYMENT_HOSTINGER.md):** Hostinger shared
(PHP 8.3, MariaDB 10.5, LiteSpeed, SSH, cron) + Vercel frontend, with a
detailed runbook including MariaDB 10.4/10.5 rehearsal notes.

## 2. Required production architecture

| Concern | Requirement | Satisfied by design? |
| --- | --- | --- |
| PHP runtime | PHP ^8.2 + ext: pdo_mysql, mbstring, bcmath, intl, zip, curl, dom, fileinfo, **gd**, openssl | Yes — composer.json `"php": "^8.2"`; Dockerfile covers all but gd |
| Laravel 12 | `laravel/framework ^12.0` (locked 12.72.0) | Yes |
| MySQL | MySQL 8 recommended; MariaDB 10.5 rehearsed per Hostinger doc | Yes (CI runs MySQL 8.0) |
| Persistent file storage | `storage/app` must be a volume (Railway) or durable path (Hostinger) — uploads + private payment proofs | Yes — dual local/S3 disks; volume requirement documented |
| HTTPS | Edge-terminated TLS; `SESSION_SECURE_COOKIE=true`, `TRUSTED_PROXIES` set | Yes |
| API routing | Frontend calls absolute `VITE_API_BASE_URL` → no path routing needed; CORS env-restricted | Yes |
| Sanctum auth | Bearer tokens via `ApiTokenAuth`; stateful domains env-configured | Yes |
| Background workers | Email outbox `SendEmailDelivery` jobs on `emails` queue; **requires worker unless QUEUE_CONNECTION=sync** | Partial — see risks |
| Scheduled tasks | 14 cron entries (report 07 detail); `railway.json` runs `schedule:work`; Hostinger needs hPanel cron | Yes |
| Queue/scheduler on Hostinger | Shared hosting: `QUEUE_CONNECTION=sync` (inline) + cron `schedule:run` every minute | Yes, with caveats |

## 3. Recommended deployment arrangement

**Recommended: the documented Vercel + Railway path** — it is the most
complete artifact set (Dockerfile, railway.json, healthcheck, preDeploy
migrations, schedule:work loop). Hostinger shared remains a valid
lower-cost fallback **only if** its documented constraints are accepted
(sync queue = mail sent inline during requests; single-node file cache;
no worker supervision).

Minimum viable production:
1. Vercel: frontend project, root `frontend/`, env `VITE_API_BASE_URL=<railway-api>/api`.
2. Railway: backend service from `backend/` Dockerfile; MySQL service;
   persistent volume at `storage/app`; env vars per DEPLOYMENT.md table.
3. Cron equivalent: already inside `railway.json` via `schedule:work`.
4. Queue: either keep `QUEUE_CONNECTION=sync` (demo-acceptable; mail
   latency inline) **or** add a second Railway service running
   `php artisan queue:work --queue=emails,receipts,default` (production
   recommendation — report 07).

## 4. Platform compatibility verification

| Platform | PHP 8.2 | Laravel 12 | MySQL | Persistent storage | Queue worker | Scheduler | HTTPS | Rollback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Railway | Yes (Dockerfile pins 8.2) | Yes | Managed MySQL | Volume | Separate service | `schedule:work` in start cmd | Edge TLS | Deploy history rollback; **DB migrations NOT auto-reversed** |
| Vercel (frontend) | n/a (static) | n/a | n/a | n/a | n/a | n/a | Edge TLS | Instant alias rollback |
| Hostinger shared | PHP 8.3 selectable | Yes (composer) | MariaDB 10.5 (rehearsed) | Filesystem (no volume semantics) | **No** — sync only | hPanel cron | Let's Encrypt | Manual (git pull + cache) |
| Generic VPS | Full control | Yes | Self-managed | Full | Supervisor | cron | Manual/Caddy | Manual |

## 5. Configuration requirements (deploy-time, owner actions)

Real `APP_KEY` (fresh per env), `APP_URL`/`FRONTEND_URL`, DB creds,
`CORS_ALLOWED_ORIGINS` + `SANCTUM_STATEFUL_DOMAINS` = exact prod origins,
`BREVO_API_KEY` + verified `MAIL_FROM_ADDRESS`, `VITE_API_BASE_URL`
baked at frontend build, `QUEUE_CONNECTION` decision, storage volume,
Brevo webhook secret if delivery events used.

## 6. Deployment risks

- **R-1 (Medium):** No deploy automation — CI tests/build only; deploys
  are manual/provider-dashboard. Mitigate via runbook (report 14).
- **R-2 (Medium):** `QUEUE_CONNECTION=sync` on the documented demo path
  means every queued email renders+sends inside the HTTP request —
  latency + Brevo outage = failed user-facing requests. Acceptable for
  demo; production should run a worker.
- **R-3 (Low):** Dockerfile omits `gd`; dompdf degrades gracefully for
  the payslip path but images in PDFs may rasterize poorly. Add `gd` to
  ext-install for safety.
- **R-4 (Medium):** `preDeployCommand: migrate --force` runs migrations
  automatically on every deploy — irreversible schema changes go live
  with code; rollback of code does **not** roll back DB. Runbook must
  gate this (report 14).
- **R-5 (Low):** Single-node file cache/session — fine at this scale;
  noted if ever scaled horizontally.
- **R-6 (Info):** No staging environment documented; recommend one for
  migration rehearsal.

## 7. Operational complexity estimate

**Low-to-moderate.** Two services (static frontend + one containerized
API + managed DB), one cron-equivalent loop, one optional queue worker.
No Kubernetes/microservices needed. The dominant operational burdens
are: keeping `VITE_API_BASE_URL` in sync with the API domain, running
migrations deliberately, and supervising the queue worker if enabled.
