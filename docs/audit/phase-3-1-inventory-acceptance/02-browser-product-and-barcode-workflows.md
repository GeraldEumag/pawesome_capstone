# Browser Product and Barcode Workflows

## Result

**PARTIAL PASS.** The browser workflow passed after a confirmed presentation defect was fixed. Barcode format policy and hardware scanning remain out of scope.

## Environment and evidence

- Browser: Playwright Chromium.
- Frontend: `http://127.0.0.1:3001`.
- API: `http://127.0.0.1:8001/api`.
- Database: `pawesome_phase3_1_browser_audit`.
- Role: inventory.
- Test: `frontend/e2e/phase3-1-product-barcode.spec.js` — 1 passed.
- Playwright output: `frontend/test-results/phase3-1-product-final/`.

## Workflow

- Opened Inventory > Products > Add New Product.
- Entered a unique product name and category, left SKU blank, and attempted Next with barcode blank.
- The first run showed the barcode field in an error style and prevented progression, but the actual validation text was not rendered. No product POST was sent. This reproduced a UI defect.
- Updated `AddProductModal.jsx` to render its existing `errors.barcode` message. No barcode policy or server behavior changed.
- Reran the browser test: the validation message appeared, the user could not proceed without a barcode, and no create request was sent.
- Entered a unique barcode and left SKU blank; creation returned HTTP 201.
- The persisted product had a server-generated SKU (`ACC-MQT82611`), matching barcode, and zero initial stock. It appeared after refresh, and authenticated barcode lookup returned the same product.
- All observed API origins were `127.0.0.1:8001`.

## Not covered

- Duplicate SKU, duplicate barcode, and the complete invalid-field matrix were not exercised in this browser run.
- The form still has no sellability control. The API's existing requirement for barcodes on new sellable products remains authoritative.
- Physical scanner/printer hardware and automatic barcode generation were not tested or introduced.
