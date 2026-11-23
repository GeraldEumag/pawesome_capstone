# Test Results

- **Audit date:** 2026-11-23
**Test policy:** Non-mutating checks only. No application code or tests were changed. Backend/database and browser mutation tests were not run because an isolated audit target could not be verified.

| Check | Result | Exact command / evidence | Notes |
|---|---|---|---|
| Frontend unit tests | PASS | From `frontend/`: `npm run test:unit` | Vitest 5.0.5; 11 files passed, 66 tests passed; duration 53.76s. No test failures. |
| Frontend production build | PASS with warnings | From `frontend/`: `npm run build -- --outDir C:/Users/ACER/AppData/Local/Temp/pawesome-final-audit-build-1795430411-1400` | Vite transformed 2,389 modules and completed in 54.28s. Warnings: output directory outside project, mixed static/dynamic imports, and main chunk 3,706.22 kB (>500 kB). Output was directed to a new temp directory, not the repository. |
| PHP syntax checks | PASS | From `backend/`: `php -l app/Services/InventoryService.php`; `php -l app/Services/BoardingRoomService.php`; `php -l app/Http/Controllers/BoardingController.php`; `php -l app/Http/Controllers/BoardingRoomController.php`; `php -l app/Http/Controllers/Api/ServiceRequestController.php`; `php -l app/Http/Controllers/Api/ServiceCatalogController.php`; `php -l app/Services/PaymentVerificationService.php`; `php -l app/Support/ReceiptBreakdown.php`; `php -l app/Services/Receipts/ReceiptService.php`; `php -l routes/api.php` | All ten reported “No syntax errors detected.” |
| Backend PHPUnit/feature suite | BLOCKED — NOT RUN | `backend/vendor/bin/phpunit` is absent in this environment; `mysql` executable is unavailable. Read-only inspection found `.env` configured for the non-audit `pawesome` database. | Did not invoke Artisan/PHPUnit and did not connect to or mutate any database. `phpunit.xml`/CI isolation claims and historical reports are not fresh test evidence for this pass. |
| Playwright/API workflows | BLOCKED — NOT RUN | No verified isolated API + database + storage target was available for mutation-based browser/API tests. | This includes direct incompatible cat/dog assignment, payment approval/rejection, boarding/vaccination lifecycle, stock movements, and POS-to-stock reconciliation. |
| Receipt extraction accuracy | NOT RUN | `php artisan receipts:evaluate` is documented in `docs/RECEIPT_SCANNER.md`; no labelled fixture run was performed. | No OCR/vision provider was called. No reference-detection/amount accuracy percentage is claimed. |
| Manuscript figure rendering | BLOCKED — NOT RUN | `pdftotext -layout` succeeded; `pdftoppm`, `pdftocairo`, `mutool`, ImageMagick `magick`, and Ghostscript `gs` were unavailable. | Figures were identified from captions/contents only. Diagram visual correctness/readability remains UNVERIFIED. |
| Live database schema/data verification | BLOCKED — NOT RUN | `mysql` client unavailable; local `.env` database is `pawesome`, not a verified audit target. | No `SELECT`, write, reset, migrate, or seed operation was run. |

## Historical evidence (not fresh for this audit)

Existing reports include backend/E2E runs from 2026-11-17/18, including `docs/audit/FINAL_INTEGRATION_TEST_RESULTS.md`, `SYSTEM_FINAL_E2E_RESULTS.md`, and module reports. Those provide useful prior history only; they do not establish current behavior at this audit baseline. Some historical E2E reports themselves note harness/fixture failures and distinguish isolated audit databases. The current status matrix therefore does not convert historical results into fresh `PASS` claims.

## Test verdict

Frontend code passes the current unit suite and builds. Backend behavior, current DB state, visual diagrams, guest booking, cross-role integrations, and scan accuracy are not freshly verified. There were no test-driven code changes.
