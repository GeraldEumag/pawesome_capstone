# Database and Workflow Findings

- **Audit date:** 2026-11-23
**Database safety:** No database was queried or changed. The local `.env` identifies `pawesome`, which is not an approved isolated audit target. The `mysql` client was unavailable.

## Source-level data model and links

| Workflow | Source evidence | Static finding | Live DB status |
|---|---|---|---|
| Account/customer/pet | `AuthController.php`, `User.php`, `Customer.php`, `Pet.php`, users/customers/pets migrations | Customer account registration and linked customer/pet flows are represented in models/controllers. | UNVERIFIED; no current foreign-key or orphan query. |
| Appointment/boarding/grooming | `service_requests` migrations; `2026_06_04_*_add_service_request_id_to_*`; booking controllers | Shared service request IDs link canonical workflow rows; controllers map status and customer/pet information. | UNVERIFIED; no write/read reconciliation run. |
| Room reservations | `BoardingRoom.php`, `BoardingRoomReservation.php`, room migrations; `BoardingRoomService.php` | Species-specific `allowed_species`, availability, row locking, and reservation records are represented. | UNVERIFIED in live environment; incompatible direct request was not sent. |
| Vaccination card | `BoardingController.php`; routes in `api.php`; migrations `2026_05_25_143405_add_vaccination_card_verified_at_to_boardings.php` and `2026_05_25_143800_add_vaccination_card_to_boardings.php` | Upload and verification state are connected to boarding and remain intentional. Customer UI requires upload for hotel booking; receptionist verification is available. | Code/migration evidence only in this audit. Historical tests are not fresh evidence. |
| Payments/receipts | `PaymentSettlement`, receipt models/services; payment/scanner migrations | Settlement ledger and receipt scanner tables support method/reference, extraction, validation, correction, and verification records. `ReceiptBreakdown` treats gross totals as VAT-inclusive. | UNVERIFIED; no live settlement, duplicate-reference, or receipt reconciliation. |
| Inventory | `InventoryItem`, `InventoryBatch`, `InventoryLog`, `InventoryService`; inventory migrations | SKU/barcode/brand/generic/price/cost/unit fields and batch/movement history exist. Stock-in/out/adjustment/return logic is separated and service usage records capture units. | UNVERIFIED; integer movement quantities do not demonstrate piece/pack/box conversion or actual current stock consistency. |
| Service usage | `2026_05_11_140000_create_service_item_usages_table.php` and billing/snapshot migrations | Foreign keys link pet, inventory item, batch, and actor; usage quantity/unit and billing/snapshot fields exist. | UNVERIFIED; no reconciliation against service transactions/current inventory. |

## Specific workflow observations

1. **Species compatibility:** the frontend sends selected pet species for availability, the backend filters compatible rooms, and reservation assignment rechecks `allowed_species`. This is strong source evidence, but direct API rejection across customer/receptionist roles remains untested in this audit.
2. **Payment proof:** upload/scanning is not equivalent to approval. The code routes proof through extraction/validation and requires cashier confirmation. Accuracy remains unverified until the labelled corpus is executed against an isolated environment.
3. **Stock correctness:** distinct stock-in and stock-out handlers, movement logs, batches, returns, and service-use links are present. Unit labels exist, but movement quantity is integer-based; exact pack/box conversions and warranty processing are not evidenced.
4. **Receipt values:** the backend breakdown exposes `vat_inclusive=true`, `net_amount`, `vat_amount`, and `total`. POS and receipt components show the net/VAT components, but grand-total labeling should be checked because “TOTAL” alone does not say VAT is included.
5. **Vaccination-card policy:** the checklist contains wording about removing unnecessary vaccination-card uploads. The user's explicit instruction supersedes removal: retain the accepted workflow and do not report it as a gap.
6. **Database readiness:** historical audit reports describe schema/FK checks, but current database target/contents were not established during this pass. No production/deployment claim follows from migrations or historical local tests.

## Evidence required for dynamic acceptance

- Run the targeted feature suites only after confirming that PHPUnit points at a disposable test DB and that its storage is isolated.
- Run customer and receptionist incompatible dog/cat assignment requests against a verified audit DB, recording status/body and confirming no reservation row is created.
- Exercise stock-in, stock-out, return, service usage, and POS sale with before/after stock/log/batch reconciliation on isolated data.
- Verify payment upload, duplicate-reference rejection, cashier approval/rejection reason, settlement, receipt VAT values, and no automatic approval with stubbed providers.
- Query foreign-key and orphan integrity only against a confirmed audit database. Do not use the `pawesome` dev database for mutation tests.
