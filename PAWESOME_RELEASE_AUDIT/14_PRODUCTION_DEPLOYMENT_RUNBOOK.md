# 14 — Production Deployment Runbook

Target architecture: **Vercel frontend + Railway Laravel/MySQL**
(canonical per `docs/DEPLOYMENT.md`), Cloudflare DNS/TLS when domain
owned, Brevo email. Hostinger shared is the documented fallback.

---

## A. Pre-deployment

### A.1 Services to provision

- [ ] Vercel project (frontend, root `frontend/`)
- [ ] Railway project: Laravel service (root `backend/`, Dockerfile) +
      MySQL service + **persistent volume mounted at `storage/app`**
- [ ] Optional: second Railway service for queue worker (see A.6)
- [ ] Domain + DNS (Cloudflare or registrar) for frontend + API
      subdomain (e.g., `app.example.com`, `api.example.com`)

### A.2 Required PHP extensions (backend host)

`pdo_mysql mbstring bcmath intl zip curl dom fileinfo gd openssl`
+ PHP `^8.2`. The checked-in Dockerfile covers all **except `gd`** —
add `gd` to `docker-php-ext-install` for PDF image fidelity (low risk
either way; dompdf degrades gracefully).

### A.3 Required environment variables (backend — Railway service vars)

```
APP_NAME=Pawesome
APP_ENV=production
APP_KEY=            # php artisan key:generate — FRESH, never reuse dev key
APP_DEBUG=false
APP_URL=https://api.<domain>
FRONTEND_URL=https://<domain>
APP_TIMEZONE=Asia/Manila        # verify business timezone intent
DB_CONNECTION=mysql
DB_HOST=<railway mysql internal host>
DB_PORT=3306
DB_DATABASE=<db>
DB_USERNAME=<user>
DB_PASSWORD=<secret>
SESSION_DRIVER=file
SESSION_LIFETIME=120
SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=<frontend-host>
CORS_ALLOWED_ORIGINS=https://<frontend-origin>   # EXACT origin, NO wildcard, NO localhost
CORS_SUPPORTS_CREDENTIALS=true
TRUSTED_PROXIES=*              # edge-terminated TLS; narrow if origin directly reachable
FILESYSTEM_DISK=public
PRIVATE_STORAGE_DRIVER=local   # or s3 with AWS_* below
PUBLIC_STORAGE_DRIVER=local
QUEUE_CONNECTION=database      # production; sync only for demo
CACHE_STORE=file               # single-node OK
QUEUE_RETRY_AFTER=180          # > ProcessReceiptScan 120s timeout
MAIL_MAILER=brevo
BREVO_API_KEY=<secret>
MAIL_FROM_ADDRESS=<brevo-verified-sender>
MAIL_FROM_NAME=Pawesome
BREVO_WEBHOOK_SECRET=<secret>  # if delivery-event webhook used
CHATBOT_AI_ENABLED=false       # enable only with verified Gemini/Groq key
```

Frontend (Vercel env, **baked at build time**):
`VITE_API_BASE_URL=https://api.<domain>/api`

### A.4 Database preparation

- [ ] Create empty MySQL database + user (least privilege: no DROP/GRANT OPTION)
- [ ] **Take/confirm backup procedure exists before first migrate**
- [ ] Plan migration window (enum rebuilds on `service_requests.status`,
      `holidays.type` — brief table locks)

### A.5 Backup before deploy

- [ ] Fresh `mysqldump --single-transaction --routines --triggers --hex-blob`
      stored off-host (procedure proven in report 05)
- [ ] Snapshot `storage/app` (or confirm S3 versioning)

### A.6 Queue decision

- **Demo:** `QUEUE_CONNECTION=sync` — no worker needed; mail renders
  inline during scheduler/request.
- **Production:** `QUEUE_CONNECTION=database` + second Railway service:
  `php artisan queue:work --queue=emails,receipts,default --sleep=3`

### A.7 Domain/HTTPS

- [ ] DNS A/CNAME for frontend (Vercel) and API (Railway)
- [ ] TLS auto-provisioned by platforms; verify `https://` end-to-end
- [ ] `APP_URL`/`FRONTEND_URL`/`CORS`/`SANCTUM`/`VITE_API_BASE_URL` all
      consistent with final domains

---

## B. Deployment

1. **Tag the release:** `git tag vX.Y.Z && git push --tags` on
   `b952fa66` (or approved successor).
2. **Backend:** Railway deploys on push (or dashboard deploy) —
   `preDeployCommand` runs `php artisan migrate --force` automatically.
   *For deliberate control, run migrate manually first, then deploy.*
3. **Frontend:** Vercel builds `frontend/` → `build/`; ensure
   `VITE_API_BASE_URL` is set **before** the build.
4. **Post-deploy artisan (once):**
   ```
   php artisan storage:link        # already in start command
   php artisan config:cache && php artisan route:cache && php artisan view:cache
   ```
5. **Permissions:** `storage/` + `bootstrap/cache` writable (Dockerfile
   pre-sets `a+rw`; verify on volume mounts).
6. **Workers/scheduler:** `schedule:work` loop is inside
   `railway.json` start command; add queue worker service if database
   queue chosen.
7. **Seeders:** run ONLY approved reference seeders if needed
   (`BoardingRoomSeeder`, `HotelRoomSeeder`, `WardBedSeeder` — note
   `2026_11_19_000000_seed_ward_beds` migration already seeds ward beds).
   **NEVER** `DemoDataSeeder`/`PawesomeLiveDemoSeeder`/`--seed` blanket.

---

## C. Post-deployment verification checklist

- [ ] `GET https://api.<domain>/api/health` → 200
- [ ] `GET https://api.<domain>/up` → 200
- [ ] `curl https://api.<domain>/.env` → 404/403 (not readable)
- [ ] Staff login (admin + one role account) → token issued
- [ ] Customer register → verification email received (check Brevo log
      / `email_deliveries` row)
- [ ] Email verification completes → booking unlocked
- [ ] Pet registration + photo upload → appears in portal
- [ ] Appointment booking → appears in receptionist queue
- [ ] Species mismatch rejection (e.g., incompatible pet/service) → 422
- [ ] Inventory: item create → stock in → stock out → history rows
- [ ] POS sale → receipt total = VAT-inclusive math; stock decremented
- [ ] Receipt/Invoice PDF or print renders with logo
- [ ] Payment proof upload → visible to authorized roles only
- [ ] `email-deliveries:dispatch` drains pending intents
      (`SELECT status,COUNT(*) FROM email_deliveries GROUP BY status`)
- [ ] `schedule:run` executes (check `activity`/logs next minute)
- [ ] `queue:work` processes a test job (if database queue)
- [ ] `storage/logs/laravel.log` shows no recurring errors
- [ ] Frontend loads, no console errors, API calls hit prod origin

---

## D. Rollback

| Layer | Procedure | Caveat |
| --- | --- | --- |
| Frontend | Vercel instant rollback to previous deployment | Safe, instant |
| Backend code | Railway redeploy previous image/commit | Safe |
| **Database** | **Restore pre-deploy backup** — `migrate:rollback` is NOT safe (several `down()` are lossy/no-op: enum reverts, dropped tables) | Requires backup; expect data written after deploy to be lost — prefer fix-forward when possible |
| Queue | Workers pick up old jobs; `failed_jobs` inspect; email outbox state survives (DB-backed) | Safe |
| Files | Restore `storage/app` snapshot or re-point to S3 bucket version | Uploads made post-deploy lost on restore |
| Config | Revert env vars; `config:cache` rebuild | Instant |

**Golden rule:** take the pre-deploy backup in A.5 *before* touching
production. A code rollback does not reverse schema changes.

---

## E. Owner manual actions (cannot be automated)

1. Provision Vercel + Railway + MySQL + volume.
2. Generate fresh `APP_KEY`, DB creds, `BREVO_API_KEY`, webhook secret.
3. Brevo: verify sender; optionally domain auth (SPF/DKIM/DMARC).
4. DNS records for both hosts.
5. Configure backup schedule (cron `mysqldump` + off-site copy or
   provider snapshots) — procedure proven, schedule is manual.
6. Uptime monitor on `/api/health`.
7. Name primary + backup operators for restore drills.
