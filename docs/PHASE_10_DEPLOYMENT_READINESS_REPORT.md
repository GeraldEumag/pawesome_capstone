# Phase 10 — Production & Deployment Readiness Report

**Date:** 2026-10-11 · **Scope:** `main` @ `66ff1d2` · Read-only deployment audit. **No code, configuration, deployment, or production-data changes were made.**

## 1. Executive Summary

The **application is verified** (542/542 backend tests, clean production build, all Phase 9 workflows green), but the **deployed environment is non-functional**:

| Service | Recorded URL | Probed result |
|---|---|---|
| Railway backend | `https://pawesome-production.up.railway.app` | **`404 — Railway "Application not found"`** (service suspended or deleted) |
| Vercel frontend | `https://pawesomezapote.vercel.app` | **Live but STALE** — serves a pre-Vite Create React App bundle missing all Phase 6–9 features; no security headers; embeds a `127.0.0.1:8000` API fallback |
| Vercel frontend (prior report's `FRONTEND_URL`) | `https://pawesome-frontend.vercel.app` | **404 — project no longer exists** |

Consequence: every deployed-environment check (Phase 7 staging journeys, live CORS/Sanctum, deployed auth, storage persistence, provider email delivery) is **BLOCKED** — there is no working backend to validate against. This is an infrastructure/operations finding, not an application-code defect: both git remotes carry the same HEAD as local (`66ff1d2`), so the fix is redeployment plus environment configuration, not more code.

**Final recommendation: `BLOCKED — REQUIRED FIXES OR EVIDENCE MISSING`**

## 2. Verified Repository Baseline

- Branch `main`, HEAD `66ff1d2f18f677766c22f1d488f17f65b5c1a659` — matches the reported Phase 9 baseline.
- `git diff --check` clean; ~76 modified/untracked entries all accounted for (Phase 8/9 work + phase reports).
- Phase 9 artifacts present: `frontend/e2e/phase9-capstone-b-demo.spec.js`, `browser-evidence/phase9-capstone-b-demo/` (16 screenshots + correlation JSON), both regression tests in `backend/tests/Feature/PaymentBookingChannelTest.php` (lines 231, 572).
- Remotes: `origin/main` and `production/main` **both at `66ff1d2`** — the deployed services are not behind on pushed code; they are stale because Vercel has not been rebuilt/redeployed and the Railway service is gone.

## 3. Actual Deployment Architecture

Repository configuration (internally consistent, matches `docs/DEPLOYMENT.md`):

- **Frontend** `frontend/vercel.json`: Vite, `npm run build` → `build/` (matches `vite.config.js` `outDir: "build"`); SPA rewrite `/((?!api/).*) → /index.html`; `nosniff`/`DENY`/`strict-origin-when-cross-origin` headers; immutable `/assets/*` caching.
- **Backend** `backend/railway.json`: `preDeployCommand: php artisan migrate --force`; startCommand runs `config:cache`, `storage:link`, `schedule:work`, `serve --host=0.0.0.0 --port=$PORT`; healthcheck `/api/health` (route exists, `api.php:69`, returns only `{"status":"ok"}` — no internal disclosure).
- **Dockerfile** `backend/Dockerfile`: PHP 8.2-cli, Node 20 asset stage, `pdo_mysql`, OPcache; `storage/` dockerignored → requires a Railway volume mounted at the resolved `storage/app` path for upload persistence.
- **CI** `.github/workflows/ci.yml`: PHP 8.2 + MySQL 8 backend suite, Node 22 frontend build — tests only, **no deploy job** (deploy is manual/provider-side, as documented).
- **Legacy** `backend/render.yaml` and `backend/.github/workflows/deploy.yml` are not active (nested workflow is undiscoverable by Actions) — correctly flagged as legacy in DEPLOYMENT.md.

## 4. Environment & Configuration Audit

- `config/cors.php`: origins env-driven via `CORS_ALLOWED_ORIGINS`; `allowed_origins_patterns` matches only `localhost`/`127.0.0.1` (never real deployed origins) — safe, but production **must** set the exact Vercel origin.
- `config/app.php` `frontend_url` defaults to localhost — `FRONTEND_URL` override is required (documented in the runbook env matrix).
- `bootstrap/app.php`: `SecurityHeaders` middleware registered globally; custom `AuthenticationException`/`FilesystemException` renderers (503 JSON on storage failure).
- Auth throttles present (`throttle:auth`, kiosk `throttle:10,1`/`60,1`, `throttle:api` on all staff groups).
- Mail: custom `brevo` transport registered (`config/mail.php:58`, `AppServiceProvider::Mail::extend`) — matches the documented Brevo HTTPS API plan. Prior-phase report recorded real Brevo `sent→delivered` events on Railway when the service was live; currently unverifiable.
- Queue: `QUEUE_CONNECTION=sync` is the documented demo default (mail sends block the request); business production needs a `queue:work` service + scheduler — `schedule:work` is already in the Railway startCommand.
- Storage: `private`/`public` disks use `throw=>true`; `FileStorageService::storeAndPersist` writes under `storage/app/{private,public}` — **ephemeral without the Railway volume** (documented; unverifiable while the service is down).

## 5. Findings (ranked)

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| F1 | **Critical** | Railway backend `pawesome-production.up.railway.app` returns `Application not found` — the service is suspended/deleted. No API, database, or uploads exist to validate. | Infra — needs service restore/redeploy |
| F2 | **High** | `pawesomezapote.vercel.app` serves a stale CRA-era bundle (`/static/js/main.*.js`, "Create React App Sample" manifest, `Last-Modified` Oct 11 but pre-Vite content): no `booking_channel`, `walk_in`, payment-verification, or any Phase 6–9 code; vercel.json security headers absent. | Infra — needs Vercel redeploy of current `main` |
| F3 | **High** | `pawesome-frontend.vercel.app` (the `FRONTEND_URL`/`CORS_ALLOWED_ORIGINS` recorded in the prior production-verification report) returns 404 — the recorded project no longer exists. | Infra — reconcile project naming with env vars |
| F4 | **Medium** | `frontend/src/services/chatbotService.js` falls back to a hardcoded `http://127.0.0.1:8000/api` when `VITE_API_BASE_URL` is unset — silently targets the viewer's own localhost and leaks a dev URL into the production bundle. The main `api/client.js` correctly falls back to relative `/api`; the chatbot should match. | **Confirmed code defect — fix proposed, awaiting approval** |
| F5 | **Medium** | `api/client.js`'s relative `/api` fallback dead-ends on Vercel (no backend at that origin) if `VITE_API_BASE_URL` is unset at build — acceptable per the documented env requirement, but fails silently. | Env prerequisite — document/enforce |
| F6 | **Low** | Railway startCommand uses `php artisan serve` (single-process dev server). Adequate for a controlled capstone demo per DEPLOYMENT.md; not for business production. | Documented limitation |
| F7 | **Low** | CSP permits `'unsafe-inline'`/`'unsafe-eval'` in `script-src` — permissive but functional; tightening is a hardening item, not a blocker. | Noted |

## 6. Regression & Build Gates (re-run this session — not inherited from Phase 9)

| Gate | Result |
|---|---|
| `php artisan test` (MySQL `pawesome_test`) | **542 passed / 2,583 assertions / 108.71s** |
| `npm run build` (Vite → `build/`) | **PASS / 28.85s** — only pre-existing chunk-size & dynamic-import warnings |
| `git diff --check` | clean |
| `GET /api/health` (local stack) | `{"status":"ok"}` |

## 7. Blocked Checks & Missing Prerequisites

All blocked by **F1** (no live backend) — none can be marked PASS:

- Deployed Phase 7 journeys A–H (customer → receptionist → cashier → inventory → vet → manager → auth battery).
- Live CORS/`SANCTUM_STATEFUL_DOMAINS` correctness against the real Vercel origin.
- Deployed auth/session/token behavior, rate limiting in deployed environment.
- Railway volume persistence for payment proofs (`storage/app` mount must exist **before** uploads are used).
- Brevo provider acceptance/delivery on the deployed service (previously verified when the service was live; must be re-verified after restore).
- `migrate --force` preDeploy behavior against a real Railway MySQL schema.
- Deployed `APP_DEBUG=false` / secrets hygiene verification.

Missing prerequisites to unblock: (a) access to the Railway project to restore/redeploy the backend + MySQL service and attach the storage volume; (b) access to the Vercel project to redeploy current `main` with `VITE_API_BASE_URL` set to the restored API origin; (c) the restored Railway URL to set `APP_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `SANCTUM_STATEFUL_DOMAINS`.

## 8. Fixes Applied

None — Phase 10 ran read-only per the safety rules. One fix is proposed and awaiting approval:

- **F4 minimal fix** (`frontend/src/services/chatbotService.js`): change the fallback from `http://127.0.0.1:8000/api` to relative `/api`, matching `api/client.js`. One line, no behavior change when `VITE_API_BASE_URL` is set, eliminates the localhost leak. (Affects the deployed bundle → requires approval per the production-change rule.)

## 9. Remaining Risks

- Even after redeploy, uploads are volatile until the Railway volume is mounted — payment-proof evidence could be lost on redeploy/restart.
- `php artisan serve` under demo load is fragile (single process); concurrent demo users may see stalls or 429s.
- Stale `pending` GCash-proof rows and test fixtures exist in the **local** dev DB only — harmless, but the same hygiene rule must apply to any staging DB used for demos.
- No automated deploy pipeline exists — each release is a manual provider operation; drift between the repo and the deployed services (exactly what F2 demonstrates) can recur.

## 10. Deployment & Rollback Recommendations

1. Restore/redeploy the Railway backend from `main` @ `66ff1d2` + a fresh or restored Railway MySQL service; mount the `storage/app` volume **before** first traffic.
2. Set the full env matrix from `docs/DEPLOYMENT.md` Mode A (exact origins, `APP_DEBUG=false`, `MAIL_MAILER=brevo` + secrets, `CHATBOT_AI_ENABLED=false` unless verified).
3. Redeploy Vercel from `frontend/` with `VITE_API_BASE_URL=https://<restored-railway>.up.railway.app/api`; decide the canonical project name (`pawesomezapote` vs `pawesome-frontend`) and update `FRONTEND_URL`/CORS/Sanctum to match.
4. Smoke-check `/api/health` → `settings/public` → login → one full J3 payment journey on staging before any demo.
5. Rollback: Vercel instant-rollback to previous deployment; Railway redeploy previous image; migrations are additive — keep a pre-deploy DB snapshot for revert.

## 11. Final Release Recommendation

**`BLOCKED — REQUIRED FIXES OR EVIDENCE MISSING`**

The application code is release-quality (all local gates green), but the intended production environment does not currently exist in a verifiable state: the API service is gone and the live frontend is a stale pre-feature build. Restoring the Railway service and redeploying the current Vite build — then running the Phase 7 staging journeys against it — are the required next actions. No production readiness can be claimed until the actual target environment is reachable and validated.
