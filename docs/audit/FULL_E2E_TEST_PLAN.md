# Full E2E Test Plan — 2026-11-08

Status: **Execution partial.** The approved implementation plan remains in the Devin plan file; this is the audit's scenario/coverage contract.

## Test standard

A fully verified workflow requires actual UI submission, correct request, backend authentication/authorization/validation, trusted business logic, DB invariants, correct response/rendering, next-role visibility and negative access checks. API-created state plus dashboard navigation is only partial browser E2E evidence.

## Scenario matrix

| Workflow | Current evidence | Remaining browser proof |
| --- | --- | --- |
| Customer product checkout | Backend disabled-410 contract | No active purchase workflow is applicable without separate reactivation approval. |
| Veterinary | Backend clinical/billing/ownership suites; hybrid customer/receptionist/vet/manager browser chain | UI booking, clinical/consent/diagnostic actions and full cashier settlement/completion trace. |
| Grooming | Backend approval/scheduling/payment/cancel/inventory cases | Full UI request through payment, completion and reports. |
| Boarding | Backend room/capacity/channel/care/cancellation cases | Full UI booking, payment, check-in/care/check-out and add-on ledger trace. |
| POS | Backend pricing/atomicity/replay cases and true two-server same-key race | Actual UI cart, checkout, receipt and next-role inventory/report verification. |
| Inventory | Backend batches/adjustments/audits/stock tests | UI stock/batch/expiry/monthly audit actions and DB/log reconciliation. |
| Manager/admin | Backend reporting/HR/accounts suites; role smoke | UI report exports reconciled to fixture ledger, settings and account lifecycle. |
| Composite/vet-tech | Backend role cases and browser smoke | Full allowed/forbidden operational UI actions. |
| Communications/storage | Backend outbox/preferences/private-file/failure cases | Browser uploads/links and separately approved provider delivery. |
| Payroll/kiosk/chatbot/scanner | Backend suites | Actual enabled browser workflows, device/provider limits and failure modes. |

## Isolation and evidence

Use separate disposable DBs and roots, explicit API/base URLs and one browser worker initially. Inspect specs before execution: some legacy specs ignore API env overrides, use remote URLs, overwrite historical artifacts or infer DB success from API responses. Do not run the entire legacy browser directory blindly.

Record unique case IDs, attempts, screenshots, request/response outcomes, DB assertions, console/request failures and limitations. Expected navigation aborts may be separately classified; other network failures and any 4xx/5xx in positive workflows must remain visible. No fake delivery/payment success, disabled throttles or empty-array error masking.

Performance/race scenarios are bounded and independent-process; a sequential double-submit test is not concurrency evidence. Remote deployment, live email, printers/scanners and destructive restore checks require appropriate approval/access.
