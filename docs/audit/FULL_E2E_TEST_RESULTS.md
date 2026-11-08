# Full E2E Test Results — 2026-11-08

Status: **Partial browser coverage; no full-system UI sign-off.** See the tracker for final attempt counts; never add overlapping retries as distinct scenarios.

## Controlled environment

Frontend :3001; isolated APIs :8001 and :8002; `pawesome_e2e_audit`; array mailer; isolated private/public storage. Chromium, one worker, no automatic retries. No remote deployment or real provider operation was exercised.

## Evidence

- **Final reviewed run: 12 passed / 0 failed / 0 skipped**, `browser-reviewed-junit.xml`: nine role entry points, hybrid main chain, keyed POS race and actual browser tech check-in.
- Independent read-only SQL confirmed appointment #6 checked_in by user #8 and assigned to vet #7; screenshot/workflow JSON are under `playwright-reviewed/vet-tech-intake-audit-vet--db32e-t-without-clinical-controls-chromium/`.
- `phase11-after-limiter-junit.xml`: expanded state-changing suite passed. Its evidence JSON reports 9 PASS / 1 PARTIAL workflow, one browser-submitted veterinary flow, zero 429s, six transient billing `ERR_FAILED` console entries and expected 422 probe attempts.
- `browser-final-junit.xml`: hybrid cross-role chain, nine role entry points and POS race. This strict attempt exposed a real vet-tech 403; 10 passed / 1 failed. Do not report it as all green.
- `vet-tech-browser-junit.xml`: focused vet-tech smoke passed after the approved correction.
- `vet-tech-intake-junit.xml`: actual browser check-in workflow, outcome tracked separately.
- `concurrency-baseline-valid.xml`: expected failure before the idempotency correction; two same-key sales.
- `concurrency-fixed.xml`: same race passed after correction.
- `playwright-final/**/concurrency-evidence.json`: response/stock evidence, no tokens.
- Timestamped `browser-evidence/cross-role-main-workflow/*/` folders contain screenshots and hybrid workflow JSON.

All paths above are beneath `../../browser-evidence/system-security-audit-20261108/` unless otherwise stated. Historical tracked screenshots/results were restored with explicit user approval after the old spec overwrote its fixed output paths. Future cross-role runs use timestamped directories.

## Important limitations

The main cross-role spec creates/mutates business state through API helpers and observes role pages. Its DB IDs come from responses unless independently checked. It does **not** prove a customer clicked a booking form through to full cash/clinical completion. Hotel/boarding was not exercised by this spec despite rooms now being seeded; its old no-room wording must not become a justification for skipping active functionality.

Dashboard smoke is not complete role workflow coverage. Full grooming, boarding, cashier settlement UI, report export reconciliation, inventory audit, payroll/attendance and integrations remain incomplete as browser traces. Every positive-workflow HTTP >=400 and non-navigation request failure is retained rather than broadly suppressed.
