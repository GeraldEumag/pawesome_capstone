# Pawesome — Phase 10: Staging Execution and Blocker Closure

## Role

Act as a coordinated senior engineering team: Tech Lead/Release Manager, Laravel Backend Engineer, React Frontend Engineer, QA Automation Engineer, DevOps/SRE Engineer, Security Engineer, and Payment/Email Integration Engineer.

## Verified baseline (re-verify everything — treat as reported, not proven)

- Local `main` @ `77993b7` (merge commit, parents `3863516` + `20c8991`); `origin/main` @ `3863516` — merge is local only, never pushed.
- Post-merge local verification: backend 502/0/2,434 exit 0; build exit 0 (2,162 modules); revision spec 8/8; cross-role pass; Playwright 128/0/1 flaky.
- Reports on disk: `PHASE6_FINAL_RELEASE_REVIEW.md`, `PHASE7_RELEASE_READINESS_REPORT.md`, `PHASE7_1_FINAL_MERGE_REVIEW.md`, `PHASE8_POST_MERGE_VERIFICATION.md`, `PHASE9_STAGING_READINESS_REPORT.md`.
- Flaky note: mobile-360 `admin /admin/reports` — 30s first-attempt timeout → ~6s pass on retry. Root-caused as Vite dev-server cold-compile; staging must re-verify under the real runtime. **Do not modify the test.**
- Unrelated WIP (AuthController rollback + tests, `attendance.js`) deliberately excluded and preserved in `Pawesome_Recovery/phase3-20261011/`.

## Non-negotiable safety rules

- Phase 1 is read-only. Do not push, deploy, reset, clean, stash, amend, force-push, or alter `main`.
- Do not modify Vercel/Railway/DNS/email/payment-provider settings without explicit authorization for that specific change.
- No production data changes, no real customer emails, no real payment transactions.
- Do not fabricate VAT rules, account numbers, credentials, env values, owner approvals, or test results.
- Do not expose secrets in output or committed files. Redact in all reports.
- Do not discard or overwrite uncommitted work (incl. `revision-b-verification.spec.js` fixture updates and `PHASE*.md` files).
- Never mark a blocker resolved on configuration alone — runtime evidence only.
- If an action could incur cost, alter shared/prod data, deploy, or contact real customers: STOP and request approval.

## Phase 1 — Repository truth (read-only)

**Phase 1 execution gate:** Perform repository inspection only. Do not create or edit `PHASE10_EXECUTION_PROMPT.md`, modify source code, install dependencies, run migrations, change configuration, or execute deployment commands during this phase. First verify the repository state and preserve all existing work. If any baseline, merge, report, or recovery-integrity discrepancy is found, document the evidence and STOP. Continue to Phase 2 only after Phase 1 passes and the operator explicitly authorizes continuation.

Confirm branch/HEAD, merge commit + parents, `git status` (tracked mods, untracked), `origin/main` SHA, merged-tree-vs-candidate identity, and integrity of the five `PHASE*.md` reports + recovery dir. Report any discrepancy and STOP.

## Phase 2 — Blocker-by-blocker execution

Use the six-blocker register in `PHASE9_STAGING_READINESS_REPORT.md` §3 verbatim. For each, execute or document the gap:

**B1 — VAT (business).** Present `ReceiptBreakdown` implementation (12% inclusive, `total × 12/112`, 2-decimal rounding, refunds excluded, `balance_due` clamped) + a sample computed receipt to the business owner. Record their decision verbatim. If approved: add deterministic feature tests for their approved examples; if rejected/changed: implement only the confirmed change behind the same authoritative path. If no decision: stays OPEN.

**B2 — Vercel↔Railway (DevOps).** With authorized staging access: set `VITE_API_BASE_URL` (Vercel) and `FRONTEND_URL`/`CORS_ALLOWED_ORIGINS`/`SANCTUM_STATEFUL_DOMAINS` (Railway) to the exact deployed origins. Verify: `/api/health` → 200; browser login → token issued; CORS preflight clean; proof upload works; no secrets in logs. Record CONNECTIVITY VERIFIED or the exact failing step.

**B3 — E-wallet numbers (business).** Collect approved GCash + Maya numbers; replace the `PaymentUploadModal.jsx` placeholder; verify receipt + modal render the approved values. Never invent numbers.

**B4 — Persistent storage (DevOps).** Mount a Railway volume at `storage/app` or configure `PRIVATE_/PUBLIC_STORAGE_ROOT`. Verify an uploaded file survives a redeploy/restart and private proofs are not publicly reachable.

**B5 — Queue/scheduler (DevOps).** Run `php artisan queue:work --queue=emails,default` + scheduler daemon (or document `sync` for demo scope). Trigger one job; confirm processing and failed-job behavior.

**B6 — Email verification E2E (DevOps/Backend).** With Brevo configured (`MAIL_MAILER`, verified `MAIL_FROM_ADDRESS`): register a controlled test account; capture the verify link from the outbox/provider; click it; confirm `email_verified_at` set and provider event = delivered. Also test resend + expired/invalid link generic rejection.

## Phase 3 — Staging E2E matrix

Execute the 16-scenario matrix in `PHASE9_STAGING_READINESS_REPORT.md` §6 verbatim on the deployed staging stack. For each: preconditions, steps, expected, observed, evidence path, PASS/FAIL/BLOCKED. Record API responses AND database state AND browser-visible outcome. Use test accounts only. Do not fabricate unrun results — mark NOT RUN.

## Phase 4 — Regression re-check on staging

Re-run: revision spec paths (booking contracts, pet ownership, e-wallet-only + cash 422, check-in ID integrity + duplicate, vet cancellation, tracker terminal states, VAT receipt), responsive checks at 360/390/412/768, and specifically the mobile-360 `/admin/reports` audit — record whether the cold-start timeout reproduces under the built deployment.

## Phase 5 — Deliverable

Write `PHASE10_STAGING_EXECUTION_REPORT.md`: executive decision (STAGING VERIFIED / STAGING PARTIALLY VERIFIED / STAGING FAILED), blocker register with evidence links, E2E matrix results, defects ranked by severity, business decisions recorded, residual risks, rollback readiness, and GO/NO-GO for production. Production GO requires: all 6 blockers VERIFIED with evidence + owner sign-offs documented.

## Final response requirements

- State exactly which blockers moved to VERIFIED, with evidence.
- List every file/config changed.
- State whether any push/deploy occurred and to what environment.
- If production cannot yet be GO, list the exact remaining evidence and the owner who must provide it.
- Do not push to `origin/main` or deploy production without a separate explicit authorization naming the target environment.
