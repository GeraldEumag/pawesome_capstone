# 01 — Deployment Configuration Validation

## Backend (`backend/Dockerfile`, `railway.json`, `composer.json`)

| Item | Verified |
| --- | --- |
| PHP version | `php:8.2-cli-bookworm`; composer requires `^8.2` ✓ |
| Multi-stage build | Node 20 assets build (`backend/package.json` → `public/build`) → PHP runtime ✓ |
| Extensions installed | `pdo_mysql mbstring bcmath intl zip curl opcache pcntl` |
| Extensions required by code | All present except **`gd`** and **`fileinfo`/`dom`** — `dom`/`fileinfo`/`xml` ship in php:8.2-cli base image; `gd` is the only true gap |
| Composer | prod install `--no-dev --optimize-autoloader`, deferred discovery then `dump-autoload` post-copy; `bootstrap/cache` + `storage/framework/*` pre-created writable |
| Start command (`railway.json`) | `config:cache && storage:link && (schedule:work loop &) && artisan serve --port=$PORT` |
| Pre-deploy | `php artisan migrate --force` |
| Healthcheck | `/api/health` → `{"status":"ok"}` (route verified, HTTP 200 locally) |
| Restart policy | ON_FAILURE, max 5 |
| Writable dirs | `storage/`, `bootstrap/cache` chmod a+rw; volume mount at `storage/app` required for uploads |
| Queue worker | **Not in start command** — separate service needed for `database` queue (see report 07) |
| EXPOSE | 8080 (Railway injects `$PORT`) |

### GD determination — TESTED, not assumed

Local PHP 8.2 has **no gd and no intl**. Executed the real code path:

```
app(PayslipPdfService::class)->render([...]) → "PDF bytes: 316056"
```

The payslip PDF (Dompdf 3.1.6 + data-URI JPEG logo,
`isRemoteEnabled=false`) **renders successfully without GD** — Dompdf's
CPDF backend embeds JPEG natively; GD is only needed for raster
operations (resampling, PNG alpha edge cases) the app doesn't use.
Receipts are client-side jsPDF — unaffected.

**Conclusion: GD is NOT required for current production workflows.**
Recommendation (optional, low-risk): add `gd` to
`docker-php-ext-install` anyway for future-proofing — it is a one-word
Dockerfile change; do it at next image rebuild, not a release blocker.
`intl` IS in the Dockerfile already.

## Frontend (`package.json`, `vite.config.js`)

| Item | Verified |
| --- | --- |
| Build command | `npm run build` → Vite → `build/` |
| Output dir | `build/` (`vite.config.js` `outDir`) — matches DEPLOYMENT.md/Vercel expectation |
| API base URL | `VITE_API_BASE_URL` env, baked at build; `.env.example` placeholder; no secrets in `VITE_*` |
| Localhost refs | Only dev `.env` (gitignored) + vite dev proxy — not in production build |
| Vercel config | No `vercel.json`; dashboard settings required: Root=`frontend/`, Build=`npm run build`, Output=`build/` |
| Package manager | `package-lock.json` → `npm ci` on Vercel |

## CI (`/.github/workflows/ci.yml`)

Backend job (PHPUnit on MySQL 8 + composer audit) and frontend job
(npm ci + audit + build) verified. No deploy job — deploys are
provider-driven per runbook.

## Discrepancy noted vs prior report

`DB_QUEUE_RETRY_AFTER` (not `QUEUE_RETRY_AFTER`) is the correct env var;
default **150s** already exceeds the 120s `ProcessReceiptScan` timeout.
See report 03/07 — REL-05 downgraded to informational.

**Status: PASS** — configuration is deployable as-is; gd optional.
