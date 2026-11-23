# Partially Done Requirements

Audit date: 2026-11-23. This report is the `PARTIALLY DONE` subset of `01-master-compliance-report.md`; titles/statuses match the master.

| ID | Requirement | Remaining evidence/gap |
|---|---|---|
| MS-01 | Problem-led introduction with supporting information/statistics | Clear progression/citations, but no statistics in the introduction. |
| MS-02 | Merge overlapping monitoring issues and add another problem | Current text has distinct topics, but no prior draft exists to verify the requested change. |
| MS-03 | Objectives limited to major system features | Feature alignment is reasonable; evaluation/implementation objectives remain. |
| MS-05 | Chatbot scope and online-payment inclusion/exclusion | Manuscript excludes gateway integration, but Laravel exposes a customer online-payment submission route (`backend/routes/api.php:339`); reconcile the actual workflow with the claim. |
| MS-06 | Pet-care knowledge in framework/diagram | Explanation is mostly generic MIS/web/database/ISO knowledge; figure not visually checked. |
| MS-07 | Alphabetical technical definition list | `Veterinary Services` appears after `Web-Based System`. |
| MS-08 | Recent and well-synthesized Chapter II sources | Organization/synthesis exist, but source recency/reliability remains mixed. |
| MS-10 | Research design, place/time, and participants | Details exist; respondent data conflict with MS-11. |
| MS-11 | Reassessed respondent breakdown with rationale | Table totals 48; summary says 43; category distribution lacks substantive justification. |
| MS-12 | Appropriate statistical analysis | Statistics are named, but formulas/labels are malformed and totals/means conflict. |
| MS-14 | Expanded method phases with appendices | Phases are narrated; supporting artifacts are not mapped phase-by-phase. |
| UX-02 | Night view or enhanced facility display | Gallery exists; no night view or fresh visual evidence. |
| UX-03 | Landing-page presentation/content | Dynamic landing components exist; browser acceptance not freshly checked. |
| UX-05 | Visually emphasize important buttons | CTAs exist; hierarchy not freshly browser-verified. |
| FAQ-02 | Relevant chatbot assistance | FAQ/rule/AI paths exist; live content/quality was not assessed in this run. |
| BKG-02 | Improved booking form | Rich forms and validation exist; all role flows were not dynamically checked. |
| PAY-01 | Payment method management | Accepted methods are used/displayed; full staff-facing management lifecycle was not evidenced. |
| PAY-04 | Uploaded proof is verified before approval | Private upload, scanning, validation, and cashier confirmation exist; accuracy/runtime not proven here. |
| REC-02 | Receptionist coordination across appointments/records/walk-ins | Linked controller flows exist; no fresh cross-role run. |
| DB-01 | Consistent service records across modules | Linking migrations exist; live database reconciliation blocked. |
| DB-02 | Users and related records linked correctly | Model/migration links exist; current DB constraints not queried. |
| INV-02 | Inventory follows transactions/medicine usage | Service/log code exists; no current data reconciliation. |
| PET-01 | Only necessary pet/medical data collected | Required rules exist; accepted field-necessity policy was not supplied. |
| X-01 | Per-field required rules rather than blanket “fill all” | Validators exist in sampled forms; full form-by-form validation was not completed. |
| X-02 | Cat/dog compatibility across dashboards and direct API | Filters/server rules exist; incompatible direct API rejection not freshly tested. |
| X-03 | SKU/brand dropdown/autogeneration and custom fallback | SKU auto-generation exists; brand remains free-text. |
| X-04 | Units such as piece/pack/box across movements | Item/usage unit fields exist; conversion and per-movement unit semantics are absent/unproven. |
| X-06 | Consistent base/retail price display | `price`/`cost` fields exist; base-price meaning and panel parity not verified. |
| X-11 | Complete item details/history | Details, batches, and logs exist; end-to-end accuracy not checked. |
| X-12 | POS item images | Product tile renders `product.image`; runtime delivery not checked. |
| X-15 | VAT explicitly shown as included | Server treats prices as VAT-inclusive; receipt totals lack consistent “VAT included” labeling. |
| X-16 | Logo on every generated PDF | Receipt/formal PDF utilities embed the logo when available; fallback may omit it. |

**Count:** 32. See master for exact priority and source path references.
