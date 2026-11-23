# Browser Mutation Isolation Report

## Result

**PASS for API/database targeting; file-storage isolation is not exercised.**

- Audit API: `http://127.0.0.1:8001/api`; audit frontend: `http://127.0.0.1:3001`.
- Browser/API mutation target: `pawesome_phase3_1_browser_audit`.
- Development DB exclusion: `pawesome`; the guard rejects a dev port, missing audit DB, non-audit name, or dev/test/system DB name.
- The mutation-safety decision table and live API write-probe passed **9 tests**. The probe wrote through the API and cross-checked the row via PDO in the audit database and its absence from the development DB. The temporary probe row was removed by the guard from the audit DB.
- Product-browser requests observed only API origin `127.0.0.1:8001`. Stock movement, POS, and service probes were also directed to this isolated API.
- API and frontend ran with audit-specific environment variables. No payment provider, upload, email provider, or production service was intentionally called.

## Evidence preservation incident

The Phase 12.3 and cashier POS specs write screenshots/JSON to repository-root historical evidence paths by default. These runs rewrote 11 Phase 12.3 artifacts and 6 cashier artifacts before those paths were recognized. The new run artifacts were copied to the Phase 3.1 evidence folder, and the previously clean tracked files were restored from `HEAD`; the tracked historical folders are clean again. Both specs now accept `E2E_EVIDENCE_DIR` so future runs can target isolated evidence output. This incident did not affect application or database records.

## Limitations

- No upload workflow ran, so a separate test-storage target was not exercised.
- No external payment/mail integration was invoked; provider isolation was not independently network-probed.
- The isolated audit DBs and fixtures are retained; they were not dropped.
