# Test Results

Statuses: PASS, FAIL, BLOCKED, NOT RUN.

| Check | Result | Evidence / reason |
|---|---|---|
| Frontend unit suite | PASS | `npm run test:unit`: 73 tests passed across 13 files, including X-15 labels and authoritative POS receipt parsing. |
| Frontend production build | PASS | `npm run build` transformed 2391 modules and completed. Existing dynamic/static import and >500 kB chunk warnings remain. |
| PHP syntax | PASS | `php -l` passed for modified controllers, middleware, routes, base test case and new feature tests. |
| Diff whitespace check | PASS | `git diff --check` passed. |
| Disposable test target | PASS | Created `pawesome_phase2_test` only after confirming it did not exist. Effective config: `APP_ENV=testing`, `DB_CONNECTION=mysql`, host `127.0.0.1`, port `3306`, database `pawesome_phase2_test`. Connected identity: server `Pascua`, MariaDB `10.4.32`; initial table count was zero. Existing `pawesome` and `pawesome_test` schemas were not targeted. |
| POS, historical receipt, atomicity, authorization, customer-order descope | PASS | Command: `php artisan test --compact --filter='PosFinancialIntegrityTest|CustomerHistoricalReceiptIntegrityTest|TransactionAtomicityTest|AuthorizationMatrixTest|CustomerOrderingDescopeTest'`; **48 passed (271 assertions), 51.94s**. |
| Concurrent last-stock sale | PASS | Command: `php artisan test --compact --filter=PosConcurrentStockTest`; **1 passed (10 assertions), 59.94s**. Two separate requests raced on one unit: one succeeded, one received 422; one sale/payment/item persisted and stock reached zero. |
| Payment outbox, receipt scanner and X-15 email | PASS / NOT RUN | Command: `php artisan test --compact --filter='PaymentReceiptOutboxTest|ReceiptScannerTest|EmailMailableSecurityTest'`; **39 passed (152 assertions), 1 skipped, 85.53s**. The skipped image-downscale test requires GD. |
| External payment provider | NOT RUN | No provider was called. |
| Physical printer output | NOT RUN | Not required to validate financial persistence; X-15 labels remain in source. |

Final focused backend totals: **88 PASS, 1 NOT RUN, 0 FAIL** (433 assertions); the NOT RUN case is the GD-dependent image-downscale test.

The targeted backend suites used explicit environment overrides for every command. The default non-test Laravel bootstrap was observed as `APP_ENV=local`, database `pawesome`; no tests were run with that default.

Relevant passing test names include:

- `PosFinancialIntegrityTest::test_product_price_name_totals_payment_and_receipt_are_server_authoritative`
- `PosFinancialIntegrityTest::test_active_service_uses_database_price_and_name`
- `PosFinancialIntegrityTest::test_inactive_service_cannot_be_sold_through_direct_api`
- `PosFinancialIntegrityTest::test_invalid_product_identifier_is_rejected_before_writes`
- `PosFinancialIntegrityTest::test_zero_negative_and_excess_quantities_are_rejected_without_writes`
- `PosFinancialIntegrityTest::test_duplicate_product_lines_cannot_oversell_and_rollback_atomically`
- `PosFinancialIntegrityTest::test_cash_underpayment_rolls_back_stock_and_financial_records`
- `PosFinancialIntegrityTest::test_pos_requires_an_idempotency_key_and_replays_retries_once`
- `PosFinancialIntegrityTest::test_same_idempotency_key_with_changed_payload_is_rejected`
- `CustomerHistoricalReceiptIntegrityTest::test_paid_historical_order_receipt_uses_persisted_total_for_breakdown`
- `AuthorizationMatrixTest::test_pos_checkout_and_void_are_cashier_only`
- `AuthorizationMatrixTest::test_payment_verification_is_cashier_only`
- `TransactionAtomicityTest::test_pos_checkout_late_failure_rolls_back_everything`
- `TransactionAtomicityTest::test_pos_double_void_cannot_double_restore_stock`
- `PaymentReceiptOutboxTest::test_proof_submission_records_and_delivers_confirmation`
- `PaymentReceiptOutboxTest::test_service_request_verify_delivers_receipt_via_outbox`
- `ReceiptScannerTest::test_cashier_confirm_pays_and_writes_unique_reference`
- `ReceiptScannerTest::test_cashier_confirm_rejects_duplicate_reference`
- `PosConcurrentStockTest::test_two_concurrent_pos_requests_cannot_sell_the_last_unit_twice`

The only NOT RUN test is `ReceiptScannerTest::test_openrouter_reader_downscales_images_when_gd_available`; GD is unavailable and the test explicitly skips its image-downscale path.

Superseded attempts are recorded for transparency: (1) the first combined invocation returned **51 passed, 33 failed, 1 skipped (269 assertions), 181.80s** because the initial `DatabaseMigrations` concurrency test rolled back tables before later suites; the concurrency test was changed and rerun independently. (2) An intermediate command set `SESSION_DRIVER=sync` and returned **15 passed, 20 failed, 1 skipped (40 assertions), 115.36s** because that session driver is unsupported; it was rerun with `array`. (3) Before updating a stale email VAT-subtraction assertion to X-15 wording, the email/receipt run returned **34 passed, 1 failed, 1 skipped (117 assertions), 56.21s**; the corrected final rerun passed. All attempts used only `pawesome_phase2_test`.

The project uses PDO `mysql`, but the available local server is MariaDB 10.4.32, not MySQL 8. MySQL 8 CI remains unverified. All final focused suites passed except the one GD-dependent NOT RUN test.
