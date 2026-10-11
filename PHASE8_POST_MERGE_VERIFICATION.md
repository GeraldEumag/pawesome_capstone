# Phase 8 — Post-Merge Verification and Release-Gate Audit

Date: 2026-10-11 · Scope: merged `main` @ `77993b7` · No push, no deploy, no settings changes.

## 1. Executive summary

The local merge is clean, reproducible, and fully re-verified post-merge on `main` itself. The merged tree is byte-identical to the reviewed candidate (`git diff release/revision-b-rc1..main` → empty). `origin/main` is untouched — the merge is local only. Decision: **GO FOR STAGING SIGN-OFF** — local checks pass; the remaining work is authorized staging validation and business approvals. Production remains **NO-GO** on six registered blockers.

## 2. Repository and merge evidence

| Fact | Verified value |
|---|---|
| Branch / HEAD | `main` @ `77993b7177281f291b3978d1b1604de63a7037aa` |
| Commit type | Merge commit — parents `3863516` (old main) + `20c8991` (candidate head) |
| Local vs remote | `origin/main` still `3863516`; local `main` ahead 5 — **not pushed** |
| Merged tree vs candidate | `git diff release/revision-b-rc1..main` → **empty** (identical) |
| Working tree | Only regenerated `browser-evidence/*`, `.last-run.json`, untracked `PHASE*.md` reports |
| Preservation | `backup/revision-b-20261011` @ `6ed92f8` + `Pawesome_Recovery/phase3-20261011/` (hash-verified); excluded WIP recoverable (`AuthController.php.wip`, `EmailAuthFlowTest.php.wip`, `attendance.js.wip`) |
| Spec fixture update | `revision-b-verification.spec.js` reseeded to new fixture IDs (SR195/B49, APPT58/SR196) — uncommitted working-tree change, test-only |

## 3. Change-scope audit (56 files vs `3863516`, +1,865/−720)

Reviewed subsystem-by-subsystem in Phase 6/7.1 — no new findings post-merge:

- **Booking/pet/payment contracts** — guest free-text vs authenticated pet selector; foreign-pet 422; cash removed from customer proof endpoints (POS cash preserved)
- **Walk-in pricing** — room rate + service prices authoritative from DB; unknown services 422
- **Boarding check-in** — `lockForUpdate`, gates inside transaction, SR propagation, duplicate rejection; SR endpoint delegates to linked boarding (ID-collision fix)
- **Vet cancellation** — 7 predefined codes, `other` requires explanation, propagates to linked SR
- **Tracker** — terminal statuses visible 7 days with badge
- **Receipts/VAT** — `ReceiptBreakdown` centralized; settlement ledger idempotent; frontend renders backend values, never recomputes
- **Mobile sidebar** — backdrop z-index 999→1390 (pre-existing defect, fixed)
- No migrations, no deploy-config, no env, no secrets in the diff.

## 4. Tests executed on merged `main`

| Command | Result |
|---|---|
| `php artisan test` (MySQL `pawesome_test`) | **502 passed / 0 failed / 2,434 assertions, exit 0** (139.3s) |
| `npm run build` | **exit 0**, 2,162 modules, 30.5s |
| `revision-b-verification.spec.js` (8 tests, reseeded fixtures) | **8/8 PASS** — check-in POST hit boarding id 49 (never SR 195); duplicate → 409/422; vet cancel propagated to SR196 |
| `cross-role-main-workflow.spec.js` | **1 passed** first attempt (2.5m) |
| `mobile-portrait-audit.spec.js` ×4 projects | **119/120 passed; 1 flaky** — mobile-360 `/admin/reports` 30s timeout under load, passed retry at 6.3s (environmental) |
| Combined Playwright run | **128 passed, 0 failed, 1 flaky, exit 0** (12.5m) |
| `php artisan migrate:status` | all applied, none pending |
| Secrets scan | clean |

Not run this phase: the other 5 responsive-audit specs and remaining E2E files — the identical candidate tree passed the full 153-test matrix earlier this session; post-merge subset covers all revision-critical + cross-role + mobile paths.

## 5. Defects discovered

None new. Flaky mobile-360 admin/reports timeout is environmental (Windows socket/load), same class documented in `AGENTS.md`.

## 6. Release-blocker register (unchanged — needs authorized owners)

| # | Blocker | Evidence required to close | Status | Blocks deploy |
|---|---|---|---|---|
| 1 | VAT 12% inclusive applicability | Business/accountant written confirmation + receipt presentation sign-off | **OPEN** | Yes |
| 2 | Deployed Vercel↔Railway integration | Staging: health 200, login + CORS preflight, proof upload, email dispatch observed | **NOT VERIFIED** | Yes |
| 3 | Real e-wallet numbers | Approved GCash/Maya numbers replace `PaymentUploadModal.jsx:171` placeholder | **OPEN** | Yes |
| 4 | Persistent Railway storage | Volume/`storage/app` survives redeploy; private proofs stay private | **NOT VERIFIED** | Yes |
| 5 | Queue worker + scheduler | `queue:work --queue=emails,default` + scheduler processing, or documented `sync` for demo | **NOT VERIFIED** | Yes (business prod) |
| 6 | Staging registration→email-verification E2E | Test account receives + clicks verify link; `email_verified_at` set; provider event = delivered | **NOT VERIFIED** | Yes |

## 7. Data migration and rollback

- Candidate adds **no migrations**; merge/revert is code-only. Pre-existing additive `service_requests.pet_type` migration is applied and unchanged.
- Railway `migrate --force` on deploy is additive-only for this release — safe, but snapshot the DB volume first on existing data.
- Rollback: `git revert -m 1 77993b7` locally (or redeploy previous Vercel/Railway revisions remotely).

## 8. Decision

**GO FOR STAGING SIGN-OFF.** Local verification is clean and reproducible on merged `main`; remaining checks are staging-only and business-owned. **PRODUCTION: NO-GO** until all six blockers are evidenced.

## 9. Next actions (dependency order)

1. **Business:** confirm VAT treatment + real GCash/Maya numbers + store phone/receipt details.
2. **DevOps:** provision Railway volume + queue/scheduler; set Vercel `VITE_API_BASE_URL` and Railway `CORS_ALLOWED_ORIGINS`/`SANCTUM_STATEFUL_DOMAINS`/`FRONTEND_URL`.
3. **Owner:** authorize `git push origin main` — deploy trigger.
4. **Staging:** execute `PHASE7_RELEASE_READINESS_REPORT.md` §5 checklist incl. registration→email-verification E2E.
5. **Owner:** production go/no-go on staging evidence.

**Exact next command requiring your authorization:** `git push origin main` — do not run until blockers 1–2 owners confirm readiness and staging access exists.
