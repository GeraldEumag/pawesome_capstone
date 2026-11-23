# Phase 3.2 — Report 09: Defect Fixes and Evidence Register

## Defects fixed in Phase 3.2

**No application-code defects were reproduced in Phase 3.2.** The inventory implementation verified clean under the exercised matrix. Only test-harness changes were made:

| ID | Type | Change | File |
|---|---|---|---|
| T-01 | Test harness | Generalized hardcoded API-origin assertion (`http://127.0.0.1:8001`) to the configured `E2E_API_URL` origin so the Phase 3.1 product/barcode spec runs on any isolated audit stack | `frontend/e2e/phase3-1-product-barcode.spec.js` |
| T-02 | Test harness | New Phase 3.2 acceptance spec (6 tests) covering return retry idempotency, POS UI checkout, adjustment boundary, product validation, search/low-stock/reports | `frontend/e2e/phase32-acceptance.spec.js` (new) |

No changes to: POS pricing/VAT, receipt labels, customer checkout (HTTP 410 preserved), vaccination-card flow, role policies, migrations, or any Phase 1–3.1 artifact.

## Evidence register

| Artifact | Path |
|---|---|
| Audit root | `docs/audit/phase-3-2-final-inventory-acceptance/` |
| Baseline/safety | `01-phase-3-2-baseline-and-safety-report.md` |
| MySQL 8 | `02-mysql8-compatibility-and-database-test-report.md` |
| Return retry | `03-browser-return-retry-and-idempotency-report.md` |
| POS workflow | `04-pos-cart-and-payment-workflow-report.md` |
| Service UI | `05-service-inventory-ui-integration-report.md` |
| Adjustment/validation | `06-stock-adjustment-and-product-validation-report.md` |
| Alerts/reports/recon | `07-inventory-alerts-reports-and-reconciliation-report.md` |
| Regression/security | `08-full-backend-frontend-and-security-regression-report.md` |
| This report | `09-defect-fixes-and-evidence-register.md` |
| Final verdict | `10-phase-3-2-final-acceptance-report.md` |
| Screenshots | `evidence/p32-return-form-filled.png`, `p32-return-retry-success.png`, `p32-return-4xx-rejected.png`, `p32-return-second-success.png`, `p32-pos-cart.png`, `p32-pos-receipt.png`, `p32-adjust-form.png`, `p32-adjust-success.png`, `p32-pos-low-stock.png`, `p32-inventory-reports.png` |
| Cashier journey JSON | `evidence/cashier-inventory-workflow/cashier-inventory-workflow-results.json` |
| Phase 3.2 spec | `frontend/e2e/phase32-acceptance.spec.js` |

## Secrets/PII

No passwords, tokens, or personal data appear in evidence; idempotency keys are per-run UUIDs (non-sensitive); all fixtures synthetic (`P32-*`, `E2ESM-*`).
