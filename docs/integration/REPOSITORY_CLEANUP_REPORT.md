# Repository Cleanup Inventory and Plan

Snapshot date: 2026-10-21
Repository root: `C:\xampp\htdocs\Pawesome_Capstone`

## Cleanup status

**No files were deleted, moved, ignored, staged, or cleaned.** The repository is intentionally dirty with reconciled but uncommitted work. A clean `git status` is not the objective; preservation is.

At inventory time, the worktree had 48 tracked paths modified, 19 untracked files, and no staged or unmerged paths. This report and `RECONCILIATION_INVENTORY.md` are new documentation files, so they add two untracked paths. No cleanup command was run.

## Classification

| Classification | Files / paths | Disposition |
|---|---|---|
| Required project source | `backend/app/Services/PaymentReferenceGuard.php` | Retain as the local payment-reference guard; do not hide with `.gitignore`. |
| Required automated tests/fixtures | Tracked backend and frontend E2E tests; `frontend/e2e/revision-b-confirmed-flows.spec.js` | Retain. The untracked E2E spec is updated and matches the isolated tested version; its prior version is in the verified backup. |
| Required technical documentation | `docs/PAWESOME_REVISION_AUDIT.md`, 10 files under `docs/user-manual/`, and six evaluator guide files under `documentation/` | Retain. They are intentional manuals, audit evidence, and evaluator deliverables, not disposable untracked output. |
| Generated dependencies/build output | `backend/vendor`, `frontend/node_modules`, `frontend/build` | Ignored/generated and not part of the proposed source change set. Preserve for now; no deletion is authorized. |
| Test output | `frontend/test-results` | Tracked by `origin/main`; no local diff. Do not delete merely because the path resembles generated output. |
| Local environment | `backend/.env` | Exists, ignored, and hash-matches the backup. Do not stage or disclose its contents. |
| Potentially sensitive application data | Ignored `backend/storage/app` | 328 files / 41,000,507 bytes; path/hash-identical to backup. Contains images and PDFs that may be private uploads or test evidence. Retain and do not stage, inspect contents, move, or delete without separate authorization. |
| External investigation artifacts | Retained reconciliation patch, stash, external PHPUnit probe/config, migration log, build output and browser evidence | Outside the repository. Preserve until the reconciliation and payroll incident are formally closed; do not delete during cleanup. |
| Historical report needing correction | Isolated `docs/GIT_SYNC_AND_REGRESSION_REPORT.md` | Not in the original worktree. It predates discovery that the payroll migration command targeted `pawesome_payroll_race_test_20261020`; do not copy or present it as current without a clearly marked correction. |
| Unknown ownership/data | Any files or values under `backend/storage/app` and settings in the affected race-test database | Keep preserved. No content or secret values were inspected. |

## Proposed cleanup actions

- **No removals are proposed now.**
- **No `.gitignore` changes are proposed.** Existing rules already exclude `.env`, vendor, node_modules, build output, and `backend/storage/app/*`. Do not add broader rules to conceal meaningful source or documentation.
- If generated build/dependency directories are removed in a future cleanup, first verify they are reproducible and obtain approval for the removal. They are not needed to make the current Git state intelligible.
- Do not delete or rewrite the stash, patch, 24 unreachable commit objects, manuals, evaluator guides, audit evidence, or storage files.
- Do not perform any database cleanup or restoration as part of repository cleanup.

## Security and ownership notes

- `backend/.env` is ignored and matches the verified backup; contents were not read or reproduced.
- The storage directory may contain private payment proofs, pet photos, or other uploads. Hash equality to the backup does not establish whether each file is synthetic or real; handle as potentially sensitive.
- No secret scanner was run in this inventory phase. No credentials, tokens, keys, or customer record contents were printed.
- The `pawesome_payroll_race_test_20261020` migration-target incident remains unresolved. It is a database-safety issue, not a cleanup candidate; preserve the current schema and seek a separate recovery decision.

## Review gate

No cleanup is pending execution from this report. Any future delete, move, `.gitignore` change, database action, staging, commit, push, or deployment requires separate review and authorization.
