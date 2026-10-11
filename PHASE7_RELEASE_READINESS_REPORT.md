# Phase 7 — Release Readiness and Staging Verification Report

Date: 2026-10-11 · Scope: `release/revision-b-rc1` vs `main` · Mode: review + local verification only — no merge, push, or deployment performed.

## 1. Executive summary

The candidate is reproducible and locally verified. All claimed results were re-confirmed this session on the candidate code. The known flaky test was root-caused (fixture picked times outside 10:00–18:00 shop hours ~1/7 of runs) and fixed deterministically in `20c8991`. Vercel↔Railway **deployed** integration cannot be verified from this environment and remains **NOT VERIFIED** — exact manual steps are provided in §5. VAT applicability remains an open business decision and a **release blocker for production**, not for merge review.

## 2. Verified commit and branch state

| Ref | Commit | Status |
|---|---|---|
| `main` | `38635168414460e217bab97d825e47367db5d42a` | Unchanged — verified |
| `backup/revision-b-20261011` | `6ed92f860a4d47333feafd16d63a83d137264204` | Preserved |
| `release/revision-b-rc1` | `20c8991754dc2b49aa9ed7e0a7f543cb717a20fe` | HEAD — 3 commits over snapshot |
| ├ `d95ba7e` | Implementation + Phase 2 verification fixes | |
| ├ `7e5c02c` | Test-only: fixture-resilient check-in spec | |
| └ `20c8991` | Test-only: deterministic shop-hours fixture | |

Working tree: regenerated `browser-evidence/*` + `test-results/.last-run.json`; untracked `PHASE6_FINAL_RELEASE_REVIEW.md` and this report. Recovery dir `Pawesome_Recovery/phase3-20261011/` intact (patch SHA-256 verified earlier).

Candidate diff remains 55 app/test files (+1,862/−719) plus the two test-only spec commits — no migrations, manifests, env files, or deploy config changed.

## 3. Commands and test evidence

| Check | Command | Commit | Result |
|---|---|---|---|
| Backend suite | `DB_*→pawesome_test php artisan test` | `7e5c02c` | 502 passed / 0 failed / 2,434 assertions, exit 0 (95.5s). Re-run reproducible; Δ504→502 = 2 excluded `EmailAuthFlowTest` WIP tests |
| Frontend build | `npm run build` | `20c8991` | exit 0, 2,162 modules, 24.8s |
| Revision spec | `npx playwright test e2e/revision-b-verification.spec.js` | `7e5c02c` | 8/8 PASS (check-in re-run confirmed POST→boarding id, duplicate→409/422) |
| E2E matrix | 11 spec files incl. 4 mobile/tablet projects | `7e5c02c` | 153 passed, 0 failed, 1 flaky, exit 0 (9.4m) |
| Flaky root-cause + fix | `cross-role-main-workflow.spec.js` re-run | `20c8991` | **1 passed, first attempt (2.4m)** |
| Migration status | `php artisan migrate:status` (dev DB) | — | All ran; no pending |
| Secrets scan | regex over full candidate diff | `20c8991` | Clean — no secrets/env leakage |
| Deployed Vercel↔Railway | n/a — no access from this environment | — | **NOT VERIFIED** (see §5) |

## 4. Browser/E2E coverage and gaps

Covered on the candidate: guest/authenticated booking contracts, foreign-pet rejection, e-wallet-only customer payments (+ cash API rejection), receptionist check-in ID integrity + duplicate rejection, vet cancellation reason workflow + SR propagation, tracker terminal-status visibility, receipt VAT breakdown, cashier verify/reject/deep-link/POS flows, boarding billing end-to-end, cross-role customer→receptionist→vet→manager, responsive audits for all roles, mobile portrait 360/390/412/768.

Gaps (documented, non-blocking): partial-payment/multi-settlement/discount/refund UI permutations (feature-level only); negative check-in paths in browser (feature-level covered); refresh-persistence sweeps; the deployed-environment matrix in §5.

## 5. Staging checklist — audited config + manual steps required

Config audit (files reviewed, all env-driven — no hardcoded prod values):

- `frontend/vercel.json`: Vite framework, SPA rewrites, immutable asset caching, nosniff/DENY/referrer headers — OK
- `backend/railway.json`: `migrate --force` pre-deploy, `config:cache` + `storage:link` + `serve`, healthcheck `/api/health` (route exists at `routes/api.php:69`), ON_FAILURE×5 — OK
- `backend/config/cors.php`: `CORS_ALLOWED_ORIGINS` env-driven; localhost-pattern fallback matches only `localhost|127.0.0.1` — deployed origins must be explicitly listed — OK
- `config/sanctum.php`: `SANCTUM_STATEFUL_DOMAINS` env-driven — OK
- Storage: `PRIVATE_STORAGE_DRIVER`/`PUBLIC_STORAGE_DRIVER` env-driven; proofs on private disk — OK
- Mail: `MAIL_MAILER=brevo` documented; `MAIL_MAILER=log` local — OK
- `backend/render.yaml`, `backend/Dockerfile`: legacy/inactive — not part of Railway path

Manual staging verification steps (require Vercel + Railway dashboard/CLI access — **NOT VERIFIED locally**):

1. Vercel project → set `VITE_API_BASE_URL=https://<railway-service>.up.railway.app/api`, redeploy.
2. Railway → set `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS=https://<vercel-domain>` (exact origin, no trailing slash); `SANCTUM_STATEFUL_DOMAINS=<vercel-domain>`; `APP_DEBUG=false`, prod `APP_KEY`, `DB_*`.
3. `GET https://<railway>/api/health` → 200.
4. Login from the Vercel frontend → token issued; CORS preflight succeeds (browser Network tab).
5. Upload a payment proof → lands on private disk/volume; receipt shows backend `breakdown.vat_amount`.
6. Trigger one notification email (e.g., booking submitted) → `email_deliveries` row → dispatched; verify `MAIL_MAILER`/queue config; check `storage/logs` for errors.
7. Snapshot the Railway MySQL volume before first `migrate --force` on existing data.

## 6. Outstanding blockers

| # | Blocker | Severity | Owner |
|---|---|---|---|
| 1 | VAT 12% inclusive applicability — business/accountant confirmation | **Production blocker** | Business |
| 2 | Vercel↔Railway deployed integration (§5) — needs staging env access | **Production blocker** | DevOps |
| 3 | Real GCash/Maya account numbers in `PaymentUploadModal` (pre-existing placeholder) | High — before production | Business |
| 4 | Railway persistent volume for `storage/app` (uploads/proofs) — per AGENTS.md demo requirements | High — before production | DevOps |
| 5 | Queue worker + scheduler for `emails` queue (or documented `sync` for demo) | Medium | DevOps |

## 7. Backup and rollback assessment

- Snapshot branch `backup/revision-b-20261011` + recovery dir preserve all pre-merge state incl. excluded WIP (`AuthController` rollback work, `EmailAuthFlowTest` additions — separate review cycle).
- Candidate adds **no migrations** — merge/revert is code-only; no schema rollback needed.
- Railway rollback = redeploy previous service revision; Vercel rollback = redeploy previous deployment. DB untouched by this revision beyond pre-existing additive `pet_type` column (already on `main`).

## 8. Merge recommendation

**Recommended strategy:** standard merge commit `release/revision-b-rc1` → `main` (no squash — preserves reviewable commit trail; no force-push). Candidate diff is fully classified; unrelated WIP excluded and preserved.

Required approvals before merge: reviewer sign-off on `main..20c8991` diff + explicit merge authorization. **Merge itself is not a deploy gate** — production release additionally requires §6 items 1–4.

## 9. GO / NO-GO

- **Merge review: GO** — reproducible, classified, clean candidate; flaky test root-caused and fixed.
- **Merge execute: pending your explicit authorization.**
- **Production release: NO-GO** until VAT decision + staging checklist (§5) + blockers 1–4 resolved.
