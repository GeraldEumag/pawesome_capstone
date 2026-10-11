# Pawesome — Phase 11: Staging Deployment, Blocker Closure, and Release Gate

## Role

Act as a coordinated senior engineering team: Tech Lead/Release Manager, Laravel Backend Engineer, React Frontend Engineer, QA Automation and Playwright Engineer, DevOps/SRE Engineer, Security Engineer, and Payment/Email Integration Engineer.

## Verified baseline (treat as reported — re-verify before use)

- Local `main` @ `6543daf` — **8 commits ahead of `origin/main`**; nothing pushed or deployed.
- Merge lineage: `93ae6c0` (classmate base) → `0faae49` (merge, `-X theirs`) → `767714b` (reconciliation) → `6543daf` (vet-cancel P1 fix + E2E alignment).
- Post-merge verification evidence:
  - Backend: **505 passed / 0 failed / 2,443 assertions** (`php artisan test` on MySQL `pawesome_test`)
  - Frontend build: **exit 0**, 2,164 modules
  - Browser E2E (live dev stack, Chromium): **19 passed / 0 failed** — revision spec 8/8, cross-role workflow, cashier deep-link, boarding-billing, phase4 payments, cashier-inventory workflow, live-pos
- Defect fixed this phase: `VetAppointments_PinkGlass.jsx` `selection`/`reason` `ReferenceError` — restored `showCancellationReasonPrompt` (P1, proven fixed by passing vet-cancellation E2E).
- Classmate's deliberate hardening now verified: `pet_id` required server-side (no guest free-text booking), server-authoritative price ignores manipulated client `price`.
- Reports on disk: `PHASE10_EXECUTION_PROMPT.md`, `PHASE10_STAGING_EXECUTION_REPORT.md`, `PHASE_10_E2E_RELEASE_READINESS_REPORT.md`, plus Phase 6–9 documents.
- Known flakes: mobile-360 `/admin/reports` cold-compile timeout (Vite dev server — must be re-verified on the built deployment); boarding-billing and phase4 first-attempt timing flakes (pass on retry).

## Non-negotiable safety rules

- **Do not push to `origin/main` or deploy to production** without a separate explicit authorization naming the target environment. Staging work requires explicit naming of the staging target.
- Do not modify Vercel/Railway/DNS/email/payment-provider settings without authorization for that specific change.
- No production data changes, no real customer emails, no real payment transactions. Test accounts only.
- Do not fabricate VAT rules, account numbers, credentials, env values, owner approvals, or test results.
- Never invent GCash/Maya numbers or store identity details.
- Do not expose secrets in output or committed files. Redact in all reports. Never put mail/payment credentials in frontend code or `VITE_*` vars.
- Do not discard or overwrite uncommitted work, including the untracked `PHASE*.md` documents.
- Never mark a blocker resolved on configuration alone — **runtime evidence only**.
- If an action could incur cost, alter shared/prod data, deploy, or contact real customers: STOP and request approval.

## Phase 0 — Required reading (before any action)

Read, in order: this prompt, the six-blocker register (`PHASE10_STAGING_EXECUTION_REPORT.md` §4), `PHASE_10_E2E_RELEASE_READINESS_REPORT.md`, `PHASE9_STAGING_READINESS_REPORT.md` §3/§6/§9, and `docs/DEPLOYMENT.md`. Do not assume repository or blocker state matches prior summaries — verify.

## Phase 1 — Baseline freeze (read-only)

1. `git status --short --branch` — confirm `main` @ `6543daf`, 8 ahead, working tree contains only regenerated `test-results` markers and untracked `PHASE*.md` reports.
2. Verify commits `0faae49`, `767714b`, `6543daf` and backup branches exist.
3. Re-confirm backend suite and frontend build on the frozen tree **only if** the working tree differs from `6543daf`; otherwise cite the Phase 10 evidence. **Do not refactor anything** — unrelated changes invalidate the baseline.
4. If any discrepancy appears, document it and STOP.

## Per-blocker reporting format

Every blocker action — whether it closes, fails, or stalls — must be reported in this structure:

- **Initial status and evidence**
- **Required decision, configuration, or implementation**
- **Actions performed and files/env changed**
- **Exact verification procedure and observed results**
- **Verdict: VERIFIED / FAILED / BLOCKED** (with acceptance criterion cited)
- **Remaining risks and the next required action + owner**

Configuration present, a build passing, or a provider `accepted` response never counts as VERIFIED when the criterion requires proof of actual delivery, persistence, or an owner decision.

## Phase 2 — Business-decision track (no environment required)

These two blockers are **decisions, not code**. They can close today.

### B1 — VAT (business approval)

Present to the business owner:

- Implementation: 12% **inclusive** VAT via `ReceiptBreakdown` — `vat = total × 12/112`, 2-decimal rounding, refunds excluded, `balance_due` clamped.
- Sample receipt: ₱1,800.00 gross → net ₱1,607.14 + VAT ₱192.86; partial ₱500 paid → balance ₱1,300.00, VAT still ₱192.86.
- Record the owner's decision verbatim.
- **If approved:** add deterministic feature tests pinning the approved amounts; B1 → VERIFIED.
- **If changed:** implement only the confirmed change inside `ReceiptBreakdown` (single authoritative path), update receipt presentation, add tests. Never reintroduce frontend VAT computation.
- **If no decision:** B1 stays OPEN — do not guess.

### B3 — E-wallet numbers (business approval)

- Collect the approved **GCash** and **Maya** numbers from the owner.
- Replace the placeholder in `frontend/src/components/customers/PaymentUploadModal.jsx` (and anywhere store payment details render — check `storeInfo.js`/`receiptPrinter.js` for consistency).
- Verify modal + receipt render the approved values in the browser. Never invent numbers.
- If numbers unavailable, B3 stays OPEN.

### Store identity (adjacent, while owner is engaged)

Confirm the business name/address/contact shown on receipts and the landing page are the approved values — the E2E suite asserts chatbot FAQ contact info, so changes must be coordinated.

## Phase 3 — DevOps/staging track

Requires authorized staging access on **Vercel (frontend) + Railway (Laravel API + MySQL)**. Hostinger is out of scope.

### B2 — Deployed connectivity

1. Vercel: set `VITE_API_BASE_URL` to the exact Railway API origin (`https://<railway-domain>/api`).
2. Railway: set `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `SANCTUM_STATEFUL_DOMAINS` to the exact Vercel origin(s).
3. Verify with runtime evidence:
   - `GET /api/health` on the deployed API → 200.
   - Browser login on the deployed frontend → Sanctum token issued.
   - CORS preflight clean on a real cross-origin POST (no console errors).
   - A payment-proof upload round-trips through the deployed stack.
   - No secrets in deploy logs or client bundle (`VITE_*` contains no keys).

### B4 — Persistent storage

1. Mount a Railway volume at `storage/app`, or configure `PRIVATE_STORAGE_ROOT`/`PUBLIC_STORAGE_ROOT` to external object storage. The demo may use local disks with the volume; business production expects S3-compatible buckets.
2. Runtime evidence: upload a file → redeploy/restart → file still retrievable.
3. Verify private payment proofs are **not** publicly reachable (unauthenticated URL fetch → 401/403).

### B5 — Queue/scheduler

1. Run `php artisan queue:work --queue=emails,default` as a Railway service/process, plus a scheduler daemon for `email-deliveries:dispatch` (every minute) and `email-deliveries:reconcile` (every 10 min) — or document `QUEUE_CONNECTION=sync` as accepted demo scope with the owner.
2. Runtime evidence: trigger one outbox job → processed; confirm a deliberately failed job lands in `failed_jobs`.

### B6 — Email verification delivery

1. Configure Brevo: `MAIL_MAILER=brevo`, `BREVO_API_KEY`, verified `MAIL_FROM_ADDRESS` (`BREVO_DOMAIN` only if regional endpoint).
2. Register a controlled test account on staging → outbox intent created → dispatch → verify the provider event reaches `delivered` (not merely `accepted`).
3. Click the real verify link → `email_verified_at` set in the staging DB.
4. Test resend and expired/invalid link → generic non-enumerating rejection.

## Phase 4 — Staging E2E matrix + deployed-browser regression

1. Execute the **16-scenario matrix** (`PHASE9_STAGING_READINESS_REPORT.md` §6) on the deployed stack. For each: preconditions, steps, expected, observed, evidence path, PASS/FAIL/BLOCKED. Record API response **and** DB state **and** browser outcome. Do not fabricate unrun results — mark NOT RUN.
2. Re-run the revision-critical flows against staging: booking contracts, pet ownership, e-wallet-only + cash 422, check-in linked-ID integrity + duplicate rejection, vet cancellation reason codes, tracker terminal states, VAT receipt breakdown.
3. **Mobile/responsive on the built deployment:** verify at 360/390/412/768 widths. Specifically re-check mobile-360 `/admin/reports` — record whether the cold-compile timeout reproduces under the built bundle (expected gone; local cause was Vite dev-server compilation).
4. Confirm the full customer→receptionist→cashier payment workflow on staging with a test account, including a real GCash/Maya proof upload against the mounted storage.

## Phase 5 — Release evidence package and gate

Assemble:

- Frozen baseline: commit SHA, test results, build, E2E totals.
- Blocker register with per-item evidence links and owner sign-offs (B1, B3 verbatim decisions).
- Staging matrix results + deployed screenshots.
- Migration status on staging DB (`php artisan migrate:status`).
- **Production env-hardening check** (verify, do not assume): `APP_DEBUG=false` (429 throttled responses currently leak exception traces in debug mode), production `APP_KEY`, production DB credentials, no demo seed accounts in a business database.
- Rollback instructions: redeploy previous Vercel build + Railway image; no destructive DB steps needed (additive `cancellation_reason` migration only).
- Known limitations: unreproduced flakes, untested areas, sync-queue demo caveat if applicable.

Write `PHASE11_STAGING_BLOCKER_CLOSURE_REPORT.md`: executive decision — **STAGING VERIFIED / STAGING PARTIALLY VERIFIED / STAGING FAILED** — plus blocker register, matrix results, defects ranked by severity, business decisions recorded, residual risks, rollback readiness, and GO/NO-GO for production.

**Production GO requires all six blockers VERIFIED with runtime evidence + owner sign-offs documented.**

## Phase 1 execution gate (explicit)

Phase 1 performs repository inspection only. Do not create or edit files, modify source, install dependencies, run migrations against staging/prod, change provider configuration, or execute deployment commands during Phase 1. If any baseline, merge, report, or integrity discrepancy is found, document the evidence and STOP. Continue only after Phase 1 passes and the operator explicitly authorizes continuation.

## Final response requirements

- State exactly which blockers moved to VERIFIED, with evidence.
- List every file/config/env changed and where (repo vs Vercel vs Railway).
- State whether any push/deploy occurred and to what environment.
- If production cannot yet be GO, list the exact remaining evidence and the owner who must provide it.
- Do not push to `origin/main` or deploy production without a separate explicit authorization naming the target environment.
