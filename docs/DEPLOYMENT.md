# Pawesome Deployment Runbook

This document describes two deployment modes. It is configuration guidance, not evidence that a provider account, domain, DNS zone, storage bucket, or production database already exists. Deployments are not automated by the checked-in CI workflow.

## Architecture

Common target:

- Frontend: Vercel, project root `frontend/`, Vite output `build/`
- Backend: Railway Laravel service, project root `backend/`
- Database: MySQL; do not migrate to PostgreSQL without a concrete compatibility reason
- DNS/TLS: Cloudflare, when the production domain is available
- Email: Brevo SMTP, credentials only in backend service secrets
- Chatbot: optional Gemini API, key only in backend service secrets

`backend/render.yaml` and `backend/.github/workflows/deploy.yml` are legacy files and are not the canonical deployment configuration. The latter is nested below `backend/`, so GitHub Actions does not discover it as a workflow. `.github/workflows/ci.yml` runs tests/build only and deliberately does not deploy.

## Mode A — Capstone demo

### Services

1. Vercel frontend, rooted at `frontend/`.
2. Railway Laravel API and a separate Railway MySQL service/database.
3. Railway persistent volume mounted at Laravel `storage/app` for local public and private uploads. Confirm the resolved application path in the running service before mounting; do not use ephemeral deploy storage for uploads.
4. Brevo SMTP. Gemini is optional; leave it disabled unless a backend-only key has been configured.
5. Cloudflare DNS/TLS only after a domain is owned and verified.

### Environment

Set the following in provider environment settings, not committed files:

| Variable | Demo configuration |
| --- | --- |
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | Unique generated key for this environment |
| `APP_URL` | Actual Railway API origin |
| `FRONTEND_URL` | Actual Vercel frontend origin |
| `DB_CONNECTION` | `mysql` |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Railway MySQL service values/secrets |
| `CORS_ALLOWED_ORIGINS` | Exact frontend origin(s), no wildcard |
| `SANCTUM_STATEFUL_DOMAINS` | Frontend hostname(s), no scheme |
| `SESSION_DRIVER` | `file` |
| `CACHE_STORE` | `file` |
| `QUEUE_CONNECTION` | `sync` for a simple demo; this means queued mail is processed during the request |
| `FILESYSTEM_DISK` | `public` |
| `PRIVATE_STORAGE_DRIVER` | `local` |
| `PUBLIC_STORAGE_DRIVER` | `local` |
| `MAIL_MAILER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS` | Brevo values; username/password stored as provider secrets |
| `CHATBOT_AI_ENABLED` | `false` unless the server-side Gemini setup is verified |
| `CHATBOT_AI_API_KEY` | Backend secret only when enabled |

Use the exact production origins in `CORS_ALLOWED_ORIGINS` and `SANCTUM_STATEFUL_DOMAINS`; remove local and preview hosts from production settings. Do not enable seeded demo accounts in a business environment.

### Demo release sequence

1. Confirm the Railway app points at this repository and the `backend/` root; confirm the selected PHP build supports PHP 8.2+, MySQL, required extensions, and the intended start command.
2. Create a dedicated demo MySQL database and configure the backend environment. Never point staging/demo at business-production data.
3. Attach the persistent volume at Laravel `storage/app` before accepting uploads. Verify both `storage/app/private` and `storage/app/public` survive a redeploy using test files. Run `php artisan storage:link` in the start command (it is idempotent) so public-disk assets such as inventory photos and landing-page images resolve under `APP_URL/storage/...`.
4. Configure Vercel root, build command `npm run build`, output directory `build`, SPA rewrites, and `VITE_API_BASE_URL` as a Vercel build environment variable.
5. Run CI and review the migration diff. Back up the demo database before any migration on a populated instance.
6. Apply only reviewed forward migrations with `php artisan migrate --force` against the demo database. Never run `migrate:fresh`, `db:wipe`, or seed demo users against a business database.
7. Deploy backend and frontend, then run the smoke checklist below. No deployment has been performed by this audit.

## Mode B — Business production

### Services

1. Separate Railway staging and production applications and MySQL databases; never share a database between environments.
2. Railway Redis for cache/queue and a separately supervised `php artisan queue:work` service.
3. A Railway scheduler/cron process invoking `php artisan schedule:run` every minute, or a supervised `php artisan schedule:work` process. The application currently schedules daily reminders.
4. Cloudflare R2/S3-compatible object storage, using separate private and public buckets. Payment proofs and pet photos remain in the private bucket and are served only through authenticated/authorized Laravel endpoints. Profile/landing-page assets use the public bucket and a verified custom domain.
5. Automated database backups, retention, alerting, and at least one test restore. Monitor application exceptions, database availability, failed jobs, storage errors, and deployments.
6. Vercel frontend, Cloudflare DNS/TLS, Brevo SMTP, and optional Gemini with separate staging/production credentials.

The S3 adapter is present in Composer dependencies and `private`/`public` disks are configurable. Both disks use `throw => true`, so a failed write surfaces as a `503` JSON response instead of persisting an empty path. On S3/R2 the disks never request a `public-read` object ACL (R2 does not implement ACLs); public read access for the public bucket must come from the bucket's public/custom-domain setting. R2 access, bucket policy, URL generation, uploads, deletes, and authorized downloads still require a provider-level integration test before production readiness.

### Environment

Use distinct values and credentials for staging and production:

| Variable | Business production requirement |
| --- | --- |
| `APP_ENV`, `APP_DEBUG`, `APP_KEY` | `production`, `false`, unique secret generated once per environment |
| `APP_URL`, `FRONTEND_URL` | Actual API and frontend origins |
| `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Production-only Railway MySQL connection; secrets in provider settings |
| `CORS_ALLOWED_ORIGINS`, `SANCTUM_STATEFUL_DOMAINS` | Exact production frontend origins/hostnames only |
| `SESSION_DRIVER`, `SESSION_SECURE_COOKIE` | `file` or Redis, `true` under guaranteed HTTPS |
| `CACHE_STORE` | `redis` |
| `QUEUE_CONNECTION` | `redis` |
| `REDIS_URL` or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_CLIENT` | Railway Redis values; verify the PHP Redis extension/runtime or install and test the selected client |
| `PRIVATE_STORAGE_DRIVER`, `PUBLIC_STORAGE_DRIVER` | `s3` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT`, `AWS_DEFAULT_REGION` | R2/S3 credentials and endpoint; secret values only in provider settings |
| `AWS_PRIVATE_BUCKET`, `AWS_PUBLIC_BUCKET` | Separate buckets; never enable public access on the private bucket |
| `AWS_PUBLIC_URL` | Verified public custom-domain URL for the public bucket |
| `PRIVATE_STORAGE_ROOT`, `PUBLIC_STORAGE_ROOT` | Optional key prefix inside each bucket; leave empty for bucket root. Local filesystem paths are never used as S3 keys. |
| `MAIL_*` | Production Brevo SMTP values and verified sender |
| `CHATBOT_AI_ENABLED`, `CHATBOT_AI_API_KEY`, `CHATBOT_AI_MODEL`, `CHATBOT_AI_BASE_URL` | Optional, server-side only; use separate staging and production keys |

Do not set `VITE_*` variables for server credentials. `VITE_API_BASE_URL` is public build-time configuration and belongs in Vercel only.

### Production release sequence

1. Merge reviewed changes only after root CI passes; build and test a release candidate in staging first.
2. Verify all environment variables, exact CORS/Sanctum domains, TLS, MySQL connectivity, Redis client/extensions, S3 adapter, private/public bucket policies, Brevo delivery, and scheduler/worker health.
3. Back up the production database and verify backup age/retention. Confirm the documented recovery point and rollback owner.
4. Review migrations and run `php artisan migrate --pretend` against the correct target. Apply only reviewed forward migrations with `php artisan migrate --force` as a controlled release step, not in build/start commands. Never run `migrate:fresh`, `db:wipe`, or production seeders.
5. Deploy backend, worker, scheduler, then frontend. Restart queue workers using the hosting platform's safe process restart mechanism.
6. Check health and logs, run the smoke checklist, verify mail and queue delivery, and monitor errors/failed jobs before declaring the release complete.
7. Record release commit, migration result, backup reference, smoke results, and any approved risk exception.

## Shared post-deployment smoke checklist

- `GET /api/health` returns HTTP 200 without exposing exception details or secrets. It is currently a liveness response only; verify database/cache/storage independently with platform checks.
- CORS and Sanctum accept the exact frontend origin; unknown origins are rejected.
- Login/logout, email verification, password reset, role boundaries, and customer ownership checks work.
- A payment proof and a pet photo can be uploaded, are not reachable through a public URL, and can be fetched only through authorized file endpoints.
- Payment verification and inventory deductions remain backend-controlled; verify `status` and `payment_status` independently.
- Transactional email is delivered or, for the business mode, processed by the queue worker; inspect failed jobs without logging secrets.
- Uploads survive a demo redeploy or are persisted in the correct object bucket.
- Scheduler reminder and monitoring/alert checks are verified for business production.

## Backups and rollback

- Keep automated, encrypted, access-controlled database backups and documented retention for business production.
- Restore into an isolated database regularly; a backup without a tested restore is not verified.
- For application rollback, redeploy the previous known-good code release and verify the health/smoke checks.
- Do not automatically roll back database migrations. Prefer backward-compatible expand/contract migrations and a forward fix. Restoring a backup can discard writes and requires an explicitly approved maintenance window and recovery plan.
- Restore object data using the storage provider's versioning/backup process; application rollback alone does not restore deleted uploads.

## Known open deployment gates

- Existing medical-confinement payment proofs and pet photos may have been written to the public local disk by older code. Current changes protect new uploads only. Inventory and migrate any affected public files through an approved, backed-up data migration before production; do not delete or move existing user files blindly.
- Boarding and medical-confinement care-log photos are still stored on the public disk. Their intended access policy and any consumer must be established before business production.
- The configured target domains and actual host resources have not been verified. Replace all example values and prove provider connectivity before use.
- The `xlsx` frontend package currently has a high npm advisory with no available fix. It is currently used for workbook generation, not workbook parsing; keep the exception visible, restrict use to export flows, and reevaluate a maintained replacement before business-production approval.
