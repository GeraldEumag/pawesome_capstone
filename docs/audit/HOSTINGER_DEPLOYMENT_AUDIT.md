# Hostinger Deployment Audit — 2026-10-25 · baseline `main` @ `dcf28f6`, clean tree

## Confirmed facts
- Local DB = **MariaDB 10.4.32** (not MySQL) — whole app + 808 tests already proven on MariaDB.
- Laravel 12/PHP ^8.2; Hostinger PHP 8.3.35 satisfies requirements.
- CORS: env-driven `allowed_origins`; frontend env var is `VITE_API_BASE_URL` (must include `/api`).
- Health endpoint: `GET /api/health`.
- Auth = Sanctum PAT (bearer), not cookie-CSRF — session cookie settings are low-risk for API SPA.
- Email outbox (`email_deliveries` + `emails` queue + `SendEmailDelivery`) + scheduler commands `email-deliveries:dispatch/:reconcile` exist and are used by cron.
- `QUEUE_CONNECTION=sync` supported (demo-acceptable per DEPLOYMENT.md) — jobs run in-request.
- Private files: `PRIVATE_STORAGE_ROOT`/`PUBLIC_STORAGE_ROOT` disks, `throw=>true`, storage failure → 503.
- `APP_KEY` must NOT be regenerated on an existing deploy (encrypts outbox recipients).

## Assumptions needing verification on account
- composer availability via SSH; PHP CLI version under SSH; docroot→`public/` support; outbound HTTPS to Brevo; `storage:link` support on Hostinger shared.

## Blockers requiring user action
- Create DB+user in hPanel; enable SSL; obtain new Brevo key + verified sender; set Vercel `VITE_API_BASE_URL`; add cron entry; plan expires Nov 5.

## Risks
- MariaDB 10.5 exact-version unverified (LOW — 10.4 already proven; verify `migrate:status` on target).
- Free `hostingersite.com` domain can't carry DKIM/SPF → emails land in spam (demo-acceptable, document).
- Sync queue = slow requests on email send; acceptable for demo only.
- No queue workers/WebSockets on shared hosting — by design excluded.
