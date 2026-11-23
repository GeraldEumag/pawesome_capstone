# Product Identification and Barcode Audit

## Findings

`inventory_items` is the canonical catalog and stock record. The existing schema and API support name, generic name, free-text brand, category, SKU, barcode, price/cost, supplier, unit label, status, stock, reorder level, expiry tracking, issue method, and sellability. The POS `sale_items.product_id` points to this inventory identity; there is no separately evidenced product/brand catalog in the inventory schema inspected.

| Area | Observed behavior | Status |
| --- | --- | --- |
| SKU | `InventoryService::createItem()` uses the established server-side SKU generator when the submitted SKU is blank; the model also has a legacy fallback. A unique database constraint protects persisted SKUs. The Add Product form previously blocked the server path by requiring manual SKU input; the form now states that blank SKU is auto-generated. | Backend generation verified by `InventoryTest` in the focused backend bundle; frontend contract updated. |
| Barcode input/scan | Product entry accepts a barcode and the form supports webcam scanning and duplicate lookup. Barcode values are trimmed/normalized and constrained by backend validation. | Implemented; hardware scanner accuracy not measured in this audit. |
| Barcode lookup | Authenticated `GET /api/products/barcode/{barcode}` is restricted to cashier, inventory, and admin roles. It returns only active, unarchived products and exposes sellability/stock for POS decisions. | Source and route authorization reviewed; no browser/hardware test in this run. |
| Barcode labels | `BarcodeGenerator` renders CODE128 labels and can save an existing SKU as the barcode. This is label rendering/printing and optional manual assignment, not automatic identifier assignment. | Implemented capability; automated barcode generation remains missing. |
| Barcode requiredness | The creation form defaults new products to sellable because it has no sellability control. Backend validation requires a barcode for a new sellable item. The form previously said the barcode could be left blank; it now marks the field required for new sellable products and has matching client validation. | UI/API contract aligned in source. |
| Brand | `brand` is persisted as free text. No reusable brand catalogue or “add/custom” workflow was found. | Partial; panel/business confirmation needed before schema/UI expansion. |
| Generic name/category | Generic name and category are represented and displayed. Category-to-expiry/issue-method defaults exist. | Supported by current schema/UI and historical audit; no new category policy introduced. |
| Non-sellable/service item setup | Backend supports `is_sellable` and service-consumable fields, but the inspected Add Product form does not expose an `is_sellable` control. | Partial UI capability; verify intended product setup workflow before adding a control. |

## Barcode policy boundary

The earlier final-defense checklist records automatic barcode generation as not done and calls for panel/client confirmation. No barcode standard, prefix, check digit, collision retry policy, or SKU-as-barcode rule was newly invented. Automatic barcode generation is therefore not implemented in this phase. Existing barcode uniqueness/lookup behavior remains authoritative.

## Changes and tests

- `AddProductModal.jsx` no longer requires manual SKU input and now communicates the existing server generator.
- New-product barcode label/helper text and pre-submit validation now match the existing sellable-item backend rule.
- `AddProductModal.test.jsx` verifies the displayed SKU/barcode contract. An earlier interaction test did not observe the expected validation message after clicking Next; that test was replaced with a copy/contract test. Interactive required-field behavior is therefore **NOT VERIFIED** by the final unit suite.
- Scanner and label-print hardware were not simulated.
- The focused backend bundle passed `InventoryTest`, including the existing empty-SKU generation case and duplicate-SKU rejection.
- New automatic barcode generation, scanner device behavior, label-print hardware, brand dropdown, and non-sellable UI setup: **NOT DONE / POLICY OR SCOPE DECISION REQUIRED**.
