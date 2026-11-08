# Pawesome — Deployment Handoff Package (Phase 14)

> **Status:** Local engineering verification COMPLETE. External production verification BLOCKED pending environment access.
> **Production verdict (unchanged): NOT APPROVED for unrestricted production use.**

This package hands the remaining production-readiness work to whoever has access to
**Railway, Vercel, MySQL 8, S3 (or the Railway persistent volume), and Brevo.**
Everything locally verifiable is done and evidenced; the remaining items require the
live environment — do not simulate or mock them.

---

## 1. What is already proven (do not re-verify)

| Gate | Result | Evidence root |
|---|---|---|
| All 6 native workflows (boarding, inventory, vet, reports, HR/payroll, diagnostics) | PASS | `browser-evidence/system-security-audit-20261108/phase12-*` |
| Route/verb authorization — 722 routes, 654 role-restricted, 784 probes | **PASS — 0 violations** | `phase13-authorization/route-authorization-matrix-evidence.json`, `phase13-route-authorization-map.json` |
| Non-FK `_id` integrity — 54 columns | **PASS — 0 orphans** | `phase13-authorization/p0-nonfk-and-mysql8-evidence.json` |
| MySQL 8 strict-mode simulation — full suite under `ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,...` | **916 passed / 1 skipped / 1 unrelated fail** | `phase13-authorization/p0-mysql8-strict-simulation.json` |
| Mail — Brevo SMTP provider integration | **109 real `provider_status=accepted` sends** | `phase13-authorization/p1-storage-mail-queue-evidence.json` |
| Storage — local upload/replace/private-auth | **PASS (local)** | `browser-evidence/storage-hardening/` |
| `xlsx` advisory | **RISK ACCEPTED** (write-only usage, unreachable CVEs — NOT patched) | `phase13-authorization/p2-xlsx-advisory-decision.json` |
| Deployment config — `railway.json`, `vercel.json`, 13 scheduled commands, `route:cache`, `migrate --force` on fresh DB | **VERIFIED** | `phase13-authorization/p1-deployment-verification.json` |
| Local API performance | **All ≤1.1s** | `phase13-authorization/p1-performance-review.json` |

**Preserved decisions:**
- The `xlsx` finding is **risk-accepted, not patched** — both CVEs need `XLSX.read`, which is never called. Any future spreadsheet *import* feature must not use `xlsx.read` without a pinned fixed build.
- The **P2 index finding stays open**: `payments.created_at`, `service_requests.{created_at,status,payment_status}`, `sales.status`, `appointments.created_at` are unindexed on hot paths. Do not add indexes blindly — design composite indexes for the actual `WHERE`/`ORDER BY`/join patterns first.
- One backend test (`ReceptionistCheckInGateTest › scheduling preserves a submitted payment proof`) fails locally in **both** sql modes — investigate as a standalone defect, unrelated to strict mode.

---

## 2. Phase 14 — External verification checklist (in order)

Each item names the proof required and the artifact to file.

### 14.1 Access
- [ ] Railway project + MySQL service access; Vercel project; Brevo account; S3 bucket (or Railway volume mount confirmed at `storage/app`).
- **Evidence:** access confirmed (no secrets committed).

### 14.2 Environment configuration
- [ ] `APP_URL`, `FRONTEND_URL`, `APP_DEBUG=false`, prod `APP_KEY`.
- [ ] `DB_*` → Railway MySQL; `MAIL_MAILER=brevo` + `BREVO_API_KEY` (+`BREVO_DOMAIN` if regional); `MAIL_FROM_ADDRESS` = Brevo-verified sender; `FILESYSTEM_DISK`/`PRIVATE_STORAGE_ROOT`/`PUBLIC_STORAGE_ROOT` → S3 or mounted volume; `QUEUE_CONNECTION` → redis/database worker (not `sync`); `TRUSTED_PROXIES` set.
- **Evidence:** config snapshot with secrets redacted.

### 14.3 Backend + MySQL 8
- [ ] Deploy; `preDeployCommand` (`migrate --force`) succeeds.
- [ ] **Confirm actual MySQL 8:** `SELECT VERSION();` and `SELECT @@GLOBAL.sql_mode;` on the Railway DB → expect `8.0.x` + `ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,...`.
- [ ] Run the **full backend suite on MySQL 8** (CI `mysql:8.0` job must pass — this is the authoritative parity gate; the local MariaDB strict-simulation only approximates it).
- **Evidence:** version/mode output, green CI log, suite result.

### 14.4 Frontend (Vercel)
- [ ] `VITE_API_BASE_URL` → Railway API; HTTPS loads; SPA rewrites work; `/api/health` reachable cross-origin (CORS).
- **Evidence:** live URL, health response, browser screenshot.

### 14.5 S3, Brevo, queue
- [ ] **S3/volume:** upload a file, redeploy, confirm the file survives; private-file URL denies wrong roles.
- [ ] **Brevo:** send a real transactional email → confirm `delivered_at` populates via webhook (inbox delivery, distinct from provider-`accepted`); force a failure → bounce/failure handling + `failure_class` recorded.
- [ ] **Queue:** `queue:work` process actually running (not `sync`); dispatch a job → asynchronous execution; force a failure → retry/backoff → `failed_jobs` row → recover.
- **Evidence:** post-redeploy file persistence, `delivered_at`/`provider_status` on a real send, `jobs`/`failed_jobs` rows, worker process listing.

### 14.6 Production smoke tests
- [ ] One real cross-role workflow end-to-end on the deployed app (login → book → approve → pay → report), browser + API + DB evidence.
- **Evidence:** screenshot + API trace + DB row.

### 14.7 Final readiness review
- [ ] Sign-off report updating `docs/audit/FINAL_CAPSTONE_READINESS_REPORT.md` and `run.json` only when every live gate has evidence.

---

## 3. Constraints

- Do **not** change the production verdict until every external gate has live evidence.
- Do **not** weaken the PASS results or the `xlsx` risk-acceptance language.
- Do **not** mark any external item complete from config alone or from mocks.
- Keep `queued ≠ sent ≠ provider-accepted ≠ delivered` and `local storage ≠ persistent S3` distinctions.

---

## 4. Reference

- Deployment runbook: `docs/DEPLOYMENT.md`
- Readiness report: `docs/audit/FINAL_CAPSTONE_READINESS_REPORT.md`
- Tracker: `docs/audit/SYSTEM_AUDIT_TRACKER.md`
- Evidence root: `browser-evidence/system-security-audit-20261108/`
