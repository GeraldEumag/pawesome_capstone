# Phase 9 — Staging Readiness and Release Blocker Closure Report

Date: 2026-10-11 · Mode: audit + local verification only · **NO PUSH OR DEPLOY WAS PERFORMED.**

## 1. Executive decision

**STAGING READY WITH EXPLICIT LIMITATIONS.** The merged code is verified and reproducible locally; deployment config is correctly externalized and staging-ready. The limitation: no deployed-environment or business-owner evidence exists yet — all six blockers remain open and are owner-gated, not code-gated. Production remains **NO-GO**.

## 2. Verified commit and repository state

| Fact | Value |
|---|---|
| Branch / HEAD | `main` @ `77993b7` — merge commit, parents `3863516` + `20c8991` |
| `origin/main` | `3863516` — unchanged, merge is local-only (ahead 5) |
| Merged tree vs candidate | identical (`diff release/revision-b-rc1..main` empty) |
| Working tree | regenerated `browser-evidence/*`, `.last-run.json`; `revision-b-verification.spec.js` modified (post-merge fixture IDs — test-only); untracked `PHASE*.md` reports |
| Preservation | `backup/revision-b-20261011` @ `6ed92f8`; `Pawesome_Recovery/phase3-20261011/` hash-verified; excluded WIP intact |

## 3. Six-blocker register (from PHASE8 §6 — authoritative, unchanged names/statuses)

| # | Blocker | Owner | Evidence to close | Status | Blocks |
|---|---|---|---|---|---|
| 1 | VAT 12% inclusive applicability + receipt presentation | Business | Written confirmation vs `ReceiptBreakdown` (`total × 12/112`, round-2) | **OPEN** | Production |
| 2 | Deployed Vercel↔Railway integration | DevOps | Staging runtime evidence per §5 | **NOT VERIFIED** | Production |
| 3 | Real e-wallet payment numbers | Business | Approved numbers replace `PaymentUploadModal.jsx:171` `0917 123 4567` | **OPEN** | Production |
| 4 | Persistent Railway storage | DevOps | Volume/S3 at `storage/app`; upload survives redeploy; proofs private | **NOT VERIFIED** | Production |
| 5 | Queue worker + scheduler | DevOps | `queue:work --queue=emails,default` + scheduler running; failed-job monitoring (or documented `sync` for demo) | **NOT VERIFIED** | Production |
| 6 | Staging registration→email-verification E2E | DevOps/Backend | Test account: verify email delivered (provider event = delivered), link validates, `email_verified_at` set | **NOT VERIFIED** | Production |

No blockers were closed this phase — none can be closed without owner action or staging access. **No blocker is marked resolved on configuration alone.**

## 4. Business-decision trace (Phase 3)

**VAT:** `ReceiptBreakdown` treats all prices as VAT-**inclusive** at 12% (`vat = round(total × 12/112, 2)`), exposed on every receipt endpoint (`service_request`, `customer_order`, `appointment`, POS `breakdown`); POS uses persisted `tax_amount`/`subtotal` as authoritative. Frontend renders backend values only; omits the line when absent. Rounding: 2-decimal `round()` on each component. Refunds are excluded from `amount_paid` and listed separately; `balance_due = max(0, total − paid)`. Tests: `ReceiptBreakdownTest` (151 lines, deterministic) + mailable security tests. **Implementation verified; legal/commercial applicability is NOT verified — business/accountant decision required.**

**E-wallets:** accepted methods `gcash`, `maya` (lowercase contract); customer endpoints require method + reference + proof file; cashier verifies manually — there is **no gateway callback/webhook**; settlement is created only by cashier verification (server-side, idempotent). Single payment-destination display: `0917 123 4567` in `PaymentUploadModal.jsx` — placeholder, owner must supply real numbers. **Sandbox test:** submit proof on staging → cashier verify → receipt shows settlement; no real charges exist anywhere in the flow.

## 5. Staging environment verification

Evidence levels used: **CONFIGURED** (file/env exists) · **CONNECTIVITY VERIFIED** (runtime reachable) · **END-TO-END VERIFIED** (workflow proven).

| Check | Level | Evidence / gap |
|---|---|---|
| `vercel.json` SPA+headers, `VITE_API_BASE_URL` env | CONFIGURED | File + `.env.example`; deployed value unknown |
| `railway.json` migrate/health/start; `/api/health` route | CONFIGURED | Route exists `routes/api.php:69`; live response NOT VERIFIED |
| CORS/Sanctum env-driven origin lists | CONFIGURED | `config/cors.php`, `sanctum.php`; deployed values unknown |
| DB connectivity + migrations | NOT VERIFIED | Local `migrate:status` clean only |
| Upload persistence across redeploy | NOT VERIFIED | Needs volume + runtime proof |
| Queue/scheduler operation | NOT VERIFIED | `QUEUE_CONNECTION=sync` default locally |
| Mail delivery + verification links | NOT VERIFIED | `MAIL_MAILER=brevo` documented; no provider evidence locally |
| Secure cookies/HTTPS/redirects | NOT VERIFIED | Needs deployed URLs |
| Log inspection | NOT VERIFIED | Needs Railway log access |

**Exact manual steps:** `PHASE7_RELEASE_READINESS_REPORT.md` §5 (7 steps) — unchanged and still required.

## 6. Staging E2E test matrix (planned — none executed; no staging access)

Dependency order; expected results reference verified local behavior. All **NOT RUN** on staging.

| # | Scenario | Expected (from local evidence) | Status |
|---|---|---|---|
| 1 | Register new account | Verification email intent created; user unverified | NOT RUN |
| 2 | Verify email via link | `email_verified_at` set; token consumed | NOT RUN |
| 3 | Expired/reused/invalid links | Generic rejection; no enumeration | NOT RUN |
| 4 | Login; unverified customer booking POST | Login OK; booking blocked by `verified` middleware | NOT RUN |
| 5 | Role-based route/API authorization | 403/redirect per role matrix | NOT RUN |
| 6 | Booking + foreign-pet rejection | 422 on other's `pet_id` | NOT RUN |
| 7 | Receptionist check-in + duplicate | Boarding id POST; `in_care`; dup → 409/422 | NOT RUN |
| 8 | Vet cancel/reject propagation | Appointment + linked SR consistent | NOT RUN |
| 9 | Inventory/add-on deduction | Stock + batch counters consistent | NOT RUN |
| 10 | VAT receipt on paid record | `breakdown.vat_amount` = 12% inclusive | NOT RUN |
| 11 | Payment verify + settlement idempotency | Single settlement; duplicate verify no-op | NOT RUN |
| 12 | Email delivery | Provider event `sent`→`delivered` | NOT RUN |
| 13 | Upload survives redeploy | File retrievable post-restart | NOT RUN |
| 14 | Queue/scheduler | `email_deliveries` rows processed | NOT RUN |
| 15 | Responsive 360/390/412/768 | No overflow; nav functional | NOT RUN |
| 16 | mobile-360 `/admin/reports` regression | Passes on staging build | NOT RUN |

## 7. Flaky-test investigation — mobile-360 `admin /admin/reports`

- **Evidence:** matrix run → 30s timeout, retry 6.3s. Isolated re-run this phase → **same pattern: 30.2s timeout, retry 6.2s**. Same commit, viewport, fixtures, environment in both.
- **Root cause:** the timeout fires during `page.goto`/`waitForApp` (error context shows page mid-render). `/admin/reports` loads the heaviest lazy chunks (AdminReports ~15.9KB + shared admin bundle); the **first** request compiles them on the Vite dev server (>30s); retries hit the warmed transform cache (~6s).
- **Classification:** **environmental/synchronization — dev-server cold-compile latency.** Reproduced in isolation at workers=1, so not concurrency starvation. Not an app defect; production serves prebuilt bundles where this path doesn't exist.
- **Recommendation (not applied — no assertion changes made):** pre-warm the route before the mobile project, or give this single test a larger timeout if it recurs in CI.

## 8. Required business-owner decisions

1. VAT treatment + receipt presentation sign-off (12% inclusive implemented — confirm or correct).
2. Real GCash + Maya account numbers for `PaymentUploadModal.jsx`.
3. Receipt store identity: confirm `Pawesome Retreat Inc.` / address / `pawesomeretreat24@gmail.com` / phone placeholder `(02) 8XXX-XXXX` in `storeInfo.js`.

## 9. Required DevOps actions

1. Vercel env: `VITE_API_BASE_URL` → Railway API origin.
2. Railway env: `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `SANCTUM_STATEFUL_DOMAINS`, `APP_DEBUG=false`, prod `APP_KEY`/`DB_*`.
3. Persistent volume at `storage/app` (or `PRIVATE_/PUBLIC_STORAGE_ROOT` object storage).
4. `queue:work --queue=emails,default` + scheduler daemon (or documented `sync` for demo).
5. Brevo `MAIL_MAILER` + verified `MAIL_FROM_ADDRESS`; verify a real registration→verify flow.
6. DB volume snapshot before first `migrate --force` on existing data.

## 10. Residual risks, dependencies, rollback

- Risks: placeholder wallet numbers visible to customers until owner supplies real ones; unverified mail path could silently fail (log mailer locally ≠ provider delivery).
- Rollback: `git revert -m 1 77993b7` locally; remote = redeploy previous Vercel/Railway revisions; DB untouched (no new migrations).
- Files changed this phase: `PHASE9_STAGING_READINESS_REPORT.md` (new) only.

## 11. Recommended next action

**DevOps provisions staging per §9, then executes the §6 matrix with business owner present for §8 decisions.** Approval required: staging access + `git push origin main` authorization — separate owner sign-off. Production remains **NO-GO**.
