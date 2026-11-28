# 01 — Deployment Decisions (Collected)

Date: 2026-11-28

| Decision | Resolution | Source |
|---|---|---|
| Vercel account | **Exists** — team `llanetageraldrudolph-2990s-projects`, project `pawesome`, logged in as GERALDRUDOLPH LLANETA | `vercel whoami` / `vercel link` |
| Railway account | **Exists** — project `pawesome` (`1308abb5-…`), services `pawesome` (backend) + MySQL 9, authenticated Railway CLI v4.42.0 | `railway status` |
| Domain | **Platform subdomains** (user decision: no custom domain) | User |
| Queue mode | **Database queue + worker** (user decision) | User |
| Git deployment | **Merge to `main` first** (user decision; executed — fast-forward `4e12e742..4a1d4b59`) | User |
| Brevo | `MAIL_MAILER=brevo`, `BREVO_API_KEY` set, `MAIL_FROM_ADDRESS` configured (verified sender per prior audit) | Railway env |
| Business timezone | `APP_TIMEZONE=Asia/Manila` (already set; consistent with PH business) | Railway env |

## Infrastructure discovered (pre-existing, verified live)

- **Backend:** Railway service `pawesome`, public domain `https://pawesome-production-c73a.up.railway.app`, root dir `/backend`, Dockerfile builder, `backend/railway.json` deploy config.
- **Database:** Railway MySQL 9 service, internal host `mysql.railway.internal:3306`, database `railway`, volume `mysql-volume` at `/var/lib/mysql`.
- **Storage:** Railway volume `pawesome-volume` (`3a99b6fa-…`) mounted at `/app/storage/app` on the backend service — the exact path required for uploads/PDFs.
- **Frontend:** Vercel project `pawesome`, production alias `https://pawesome-iota.vercel.app`, root `frontend/`, build `npm run build`, output `build/` (per `frontend/vercel.json`).

## Decisions taken during execution (documented, reversible)

1. **Composer patch bump** (`03bb8024`) — required because Railway gates deploys on the GitHub CI check suite and the `backend` job was failing at `composer audit` (9 Symfony advisories). Patch-level updates only; 1298/1298 tests pass.
2. **In-container queue worker** (`b6fc14d0`) — Railway CLI cannot create/mutate a second service's start command and the public API rejects the CLI token. The worker runs as a supervised `while true` loop inside the existing start command, identical in pattern to the already-running `schedule:work` loop. Functionally equivalent to a dedicated worker at capstone scale; can be split into a separate service later via the Railway dashboard if desired.
3. **`QUEUE_CONNECTION=database` + `DB_QUEUE_RETRY_AFTER=180`** set via `railway variables` — applies to the next deployment.

## Unresolved items

- `BREVO_WEBHOOK_SECRET` is **not set** — Brevo webhook authentication cannot be verified until the account owner adds it (see report 09).
- No custom domain — all URLs are `*.vercel.app` / `*.up.railway.app` (accepted per user decision).
