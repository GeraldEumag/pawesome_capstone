# Phase 10 — Deployment Recovery Checklist

**Prepared:** 2026-10-11 · For an authorized operator with Vercel + Railway access. **This checklist changes nothing by itself** — it documents how to verify and restore the intended deployment safely.

**Current broken state (probed 2026-10-11):**
- `https://pawesome-production.up.railway.app` → Railway `404 Application not found` (service suspended/deleted)
- `https://pawesomezapote.vercel.app` → live but STALE pre-Vite CRA bundle
- `https://pawesome-frontend.vercel.app` → 404 (recorded `FRONTEND_URL` gone)

---

## Part 1 — Railway backend recovery

### 1a. Locate the service
- [ ] Railway dashboard → find the project that previously hosted `pawesome-production`.
- [ ] Determine why it 404s: free-trial/credit exhaustion (most common — Railway shows "suspended"), manual deletion, or project removed.
- [ ] If the service exists but suspended: restore payment/credits → it resumes with the same URL. If deleted: create a new service (URL will change — record the new one for steps below).
- [ ] Confirm the service is connected to the correct GitHub repo (`llanetageraldrudolph-commits/pawesome` — the `production` remote) and branch `main`, root directory `backend/`.

### 1b. Verify configuration before redeploy
- [ ] Build: PHP 8.2+ (Dockerfile or Nixpacks), `composer install`, Node 20 asset build.
- [ ] `backend/railway.json` is picked up: `preDeployCommand: php artisan migrate --force`, healthcheck `/api/health`.
- [ ] **MySQL service exists and is reachable** — check the linked database variables; do NOT create a new database if the old one still holds data. If a new database is unavoidable, that is a data-loss scenario — stop and get owner sign-off on restore-from-backup vs. fresh seed.
- [ ] **Persistent volume mounted at the app's resolved `storage/app` path BEFORE first traffic** — without it, payment proofs and uploads evaporate on every redeploy. Confirm the resolved path inside the running container (`php artisan tinker` → `storage_path('app')`) before mounting.
- [ ] Environment variables set (names only — never commit values):

| Variable | Required value |
|---|---|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | generated key (preserve the old one if decrypting existing data) |
| `APP_URL` | `https://<railway-service>.up.railway.app` |
| `FRONTEND_URL` | the live Vercel origin (see Part 2 — decide canonical name first) |
| `DB_CONNECTION` `DB_HOST` `DB_PORT` `DB_DATABASE` `DB_USERNAME` `DB_PASSWORD` | Railway MySQL service vars |
| `CORS_ALLOWED_ORIGINS` | exact Vercel origin(s), comma-separated, no wildcard |
| `SANCTUM_STATEFUL_DOMAINS` | Vercel hostname(s) without scheme |
| `SESSION_DRIVER` / `CACHE_STORE` | `file` |
| `QUEUE_CONNECTION` | `sync` (demo) — queued mail sends inside the request |
| `FILESYSTEM_DISK` | `public` |
| `PRIVATE_STORAGE_DRIVER` / `PUBLIC_STORAGE_DRIVER` | `local` (with the mounted volume) |
| `MAIL_MAILER` | `brevo` |
| `BREVO_API_KEY` | Railway secret only — REST API key, never SMTP key |
| `MAIL_FROM_ADDRESS` | Brevo-verified sender |
| `MAIL_FROM_NAME` | display name |
| `CHATBOT_AI_ENABLED` | `false` unless server-side Gemini verified |
| `TRUSTED_PROXIES` | `*` (default — needed behind Railway/Cloudflare edge) |

### 1c. Post-deploy verification
- [ ] `GET /api/health` → `{"status":"ok"}` (not Railway's `Application not found`).
- [ ] `GET /api/settings/public` → 200 JSON (proves DB + app boot).
- [ ] `php artisan migrate:status` — no pending migrations; **never** `migrate:fresh`/`db:seed` on a database with real data.
- [ ] Logs clean of startup/DB/mail errors (`railway logs` or dashboard).
- [ ] `php artisan storage:link` ran (it's in the startCommand); uploaded file reachable via an authenticated file route.
- [ ] Scheduler loop (`schedule:work`) running — check logs for `email-deliveries:dispatch` firing every minute.

---

## Part 2 — Vercel frontend recovery

- [ ] Identify which Vercel project is canonical: `pawesomezapote` (currently live but stale) vs `pawesome-frontend` (404 — likely deleted). Decide one; update backend `FRONTEND_URL`/`CORS_ALLOWED_ORIGINS`/`SANCTUM_STATEFUL_DOMAINS` to match.
- [ ] Project → connected Git repo + branch `main`, root directory `frontend/`, framework preset **Vite**, build `npm run build`, output `build/` (matches `frontend/vercel.json`).
- [ ] Set `VITE_API_BASE_URL=https://<railway-service>.up.railway.app/api` as a **production** env var. This is the only required env — never put secrets in `VITE_*` vars.
- [ ] Trigger a fresh deploy of current `main`. **Verify the deploy actually picked the Vite build**: response should reference `/assets/index-*.js`, NOT `/static/js/main.*.js` (CRA). If still CRA → wrong repo/branch/root dir.
- [ ] Verify Phase 8/9 features exist in the served bundle (e.g. walk-in cashier UI renders).
- [ ] Security headers present on responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` (from `vercel.json`).

---

## Part 3 — Email & security verification (after both services are up)

- [ ] **Email**: register a NEW test customer → check Railway logs for `email-deliveries:dispatch` picking up the outbox row → confirm Brevo event `sent`→`delivered` in the Brevo dashboard or via webhook log. **A 200 API response is NOT delivery evidence.**
- [ ] Password-reset flow: request reset → link arrives → reset works.
- [ ] **CORS**: from the Vercel origin, a browser preflight to `/api/auth/login` returns `Access-Control-Allow-Origin` matching the exact frontend origin — not `*`.
- [ ] **Auth**: login per role; an expired/garbage token → 401; customer token cannot hit staff endpoints (403); inactive account blocked.
- [ ] **Debug**: `APP_DEBUG=false` confirmed — a forced 500 must return JSON `{"status":"error",...}`, not a stack trace.
- [ ] **Uploads**: upload a payment proof → file lands on the mounted volume → **redeploy → file still retrievable** (persistence proof).
- [ ] **Headers**: backend responses carry `SecurityHeaders` middleware output (nosniff, DENY, CSP).

---

## Part 4 — Production smoke-test matrix

Use isolated test accounts; never real customer data, real payments, or customer-facing emails. Reuse `frontend/e2e/phase9-capstone-b-demo.spec.js` journeys where the environment allows.

| # | Check | Expected |
|---|---|---|
| S1 | Frontend loads at Vercel URL | Current Vite bundle, no console errors |
| S2 | `GET /api/health` | `{"status":"ok"}` |
| S3 | Login/logout, all 7 roles | Token issued; role routes load |
| S4 | Disabled account login | Rejected |
| S5 | Role isolation | customer→staff endpoints 403; cross-customer records invisible |
| S6 | Customer UI booking → receptionist queue | Row created `online/pending`; receptionist sees it |
| S7 | Receptionist approve | Downstream record created; **repeat approve → idempotent, no duplicate reservation** |
| S8 | GCash proof upload → cashier verify → receipt | `paid/gcash`; receipt shows backend net+VAT=total |
| S9 | Walk-in → counter cash | `paid/cash`; pre-approval absent from cashier queue |
| S10 | POS sale + void | Totals correct; `cancelled` + `voided_by`; duplicate void rejected |
| S11 | Boarding reservation + conflict | Conflict refused; release → `status=cancelled` |
| S12 | Inventory negative adjustment | 422, stock unchanged |
| S13 | Vet consult/complete | Workflow transitions persist |
| S14 | Manager reports | Reflect persisted records incl. voided sale |
| S15 | Email on registration/payment | Brevo `delivered` event confirmed |
| S16 | Upload survives redeploy | Proof retrievable after restart |
| S17 | Browser console/network | No unexpected errors, no mixed content |

## Part 5 — Deployment sequence & rollback

**Order:** 1) Railway MySQL verify → 2) Railway backend restore + env + volume + migrate → 3) health check → 4) Vercel env + redeploy → 5) CORS/auth smoke → 6) S1–S17 matrix.

**Rollback:** Vercel → instant rollback to previous deployment (Deployments → ⋯ → Instant Rollback). Railway → redeploy previous deployment/image. Migrations are additive — take a MySQL snapshot/backup BEFORE `migrate --force` runs so a bad deploy can be reverted to schema+data.

**Stop conditions:** database identity uncertain (don't guess which MySQL holds data), volume would be reformatted, `APP_KEY` lost with encrypted data to decrypt, or any step requires deleting/recreating a database — escalate to the owner first.
