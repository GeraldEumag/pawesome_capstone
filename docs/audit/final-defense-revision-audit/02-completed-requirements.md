# Completed Requirements

Audit date: 2026-11-23. This report is the `DONE` subset of `01-master-compliance-report.md`; titles/statuses match the master. “Done” is source/manuscript evidence, not a claim of production deployment.

| ID | Requirement | Evidence |
|---|---|---|
| MS-04 | Purpose/description avoids researcher-centered wording | Manuscript pp. 6–7 |
| MS-13 | Agile/Incremental has a rationale and Waterfall comparison | Manuscript pp. 12–14, 26–27 |
| MS-15 | Development tools are discussed in Design | Manuscript pp. 27–28 |
| UX-01 | Preferred pink theme is implemented through shared tokens | `frontend/src/styles/theme.css:1-25` |
| FAQ-01 | FAQ/chatbot feature exists | `frontend/src/components/LandingChatbot.jsx`; `RoleAwareChatbot.jsx`; chatbot routes/services |
| SVC-01 | Dedicated service entry point exists | `frontend/src/routes/CustomerRoutes.jsx`; `ReceptionistRoutes.jsx` |
| SVC-02 | Separate Service Management panel exists | `ReceptionistManageServices.jsx`; `ServiceCatalogManager.jsx` |
| SVC-03 | Service catalog is organized/manageable | `ServiceCatalogManager.jsx`; `ServiceCatalogController.php` |
| ACC-01 | Account creation process has field validation and staged UI | `Register.jsx`; `AuthController.php::register` |
| ACC-03 | Role-appropriate access is enforced at API route groups | `backend/routes/api.php` (`auth.api`, `role:*` groups) |
| BKG-01 | Appointment/boarding tracking is present | `BookingTracker.jsx`; `CustomerBookingsBoard.jsx`; `Customer\BookingBoardController.php` |
| BKG-03 | Dedicated booking panel/modal exists | `ServiceBookingModal.jsx`; customer booking/service routes |
| PAY-02 | Reference validation/normalization is implemented | `ReceiptConfirmationService.php`; `payment_references` uniqueness; `docs/RECEIPT_SCANNER.md` |
| PAY-03 | Payment rejection reason is captured | `PaymentApprovals.jsx`; cashier/receptionist rejection controllers |
| REC-01 | Receptionist functions/permissions are role-scoped | `ReceptionistRoutes.jsx`; `backend/routes/api.php` |
| INV-01 | Medicine generic and brand names are stored/displayed | `InventoryItem.php`; generic-name/brand migrations; `UnifiedInventory.jsx` |
| PET-02 | Accepted vaccination-card upload/verification workflow is retained | `backend/routes/api.php`; `BoardingController.php`; `HotelForm.jsx` |
| X-07 | Stock-in, stock-out, and return are distinct workflows | `UnifiedInventory.jsx`; `InventoryService.php::recordStockIn/recordStockOut` |
| X-09 | Product-management quick actions appear above row actions | `UnifiedInventory.jsx` top-level Stock In/Out/Return buttons |
| X-10 | Stock filters include all/in-stock/low/out and metadata filters | `UnifiedInventory.jsx`; `Admin\InventoryController.php` |
| X-13 | Low-stock and expiry alerts exist | `InventoryItem.php`; `InventoryDashboard.jsx`; inventory dashboard API |

**Count:** 21. Current frontend tests/build and static PHP syntax results are reported separately in `07-test-results.md`.
