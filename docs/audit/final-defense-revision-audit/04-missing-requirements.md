# Not Done Requirements

Audit date: 2026-11-23. This report is the `NOT DONE` subset of `01-master-compliance-report.md`; titles/statuses match the master.

| ID | Requirement | Evidence |
|---|---|---|
| MS-09 | Verify/complete all citations and bibliography details | `PAPER_updated-2.pdf`, References section: Rajkumar et al. (2024) has a literal “[Complete title, publisher, and link of this source]” placeholder. |
| MS-20 | Chapter III contains only wireframes; move actual screenshots/discussion to Ch. IV | `PAPER_updated-2.pdf`, Chapter III pp. 45–90 contains actual interface figure titles and explanatory discussion (e.g. Figures 17–21). |
| MS-21 | Replace Appendix 4 Gantt chart | `PAPER_updated-2.pdf`, Time and Place p. 10 still points to Gantt chart; Appendix 4 remains “Gantt Chart,” p. 134. |
| ACC-02 | Allow actual booking before registration when applicable | `ServiceBookingModal.jsx:60-65` requires signed-in, verified customer; service/boarding POST routes are authenticated. Draft persistence is not guest booking. |
| X-05 | Automatically generate barcodes | `InventoryService.php:980-1008,1050-1065` validates a supplied barcode and requires it for sellable products; no automatic generator found. UI offers entry/scanning, not generation. |
| X-08 | Warranty-aware return workflow | `StockReturnsPage.jsx` and inventory return service support inspection/restock decisions, but no warranty field/rule was found in frontend, backend, or migrations. |

**Count:** 6. The vaccination-card removal phrase in CAP-B is not a missing requirement: the user explicitly directed that the existing workflow remain, and PET-02 is DONE.
