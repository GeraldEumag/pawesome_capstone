# Final Workflow Acceptance Matrix

**Verdict:** NO-GO for final acceptance. Browser coverage exists for all six channel/workflow combinations, but the receptionist walk-in cases do not yet complete all required operational handoffs in the browser.

| Workflow | Browser evidence | API / database evidence | Status |
| --- | --- | --- | --- |
| Veterinary Online | Native customer-to-veterinary lifecycle passed in `phase12-veterinary-workflow.spec.js`; booking, clinical completion, role denial and concurrency were exercised. | Appointment, assignment and status checks are included in the browser evidence; PHPUnit includes veterinary workflow and authorization coverage. | PASS for exercised lifecycle; full payment/tracking matrix not demonstrated in this run. |
| Veterinary Walk-in | `phase12-walk-in-workflows.spec.js` created the booking through receptionist UI and verified customer-board/cashier visibility. | Appointment and linked request persistence were checked; approval was exercised through the existing endpoint. | PARTIAL: no browser-completed veterinary clinical/payment handoff. |
| Hotel Online | Earlier native lifecycle passed, but the final selected-suite rerun failed after cashier payment: the receptionist Today/ON GOING table showed 0 rows and check-in could not be started. | Audit DB row #88 was `scheduled` / `paid`, with room reservation #48 `scheduled`, check-in 2026-11-19. | BLOCKED: current browser rerun failed at the receptionist queue/check-in handoff. |
| Hotel Walk-in | Native receptionist creation and cross-role visibility passed after approval synchronization was fixed. | Regression test and audit DB verified `service_requests`, `boardings` and `boarding_room_reservations` all become approved. | PARTIAL: payment/room occupancy lifecycle is not fully browser-driven. |
| Grooming Online | Native customer request/payment UI workflow passed in `phase12-native-ui-workflows.spec.js`. | Service request and linked grooming record are covered by feature tests and persistence checks. | PARTIAL: browser did not complete grooming execution, pickup and final payment handoff. |
| Grooming Walk-in | Native receptionist creation and cross-role visibility passed in `phase12-walk-in-workflows.spec.js`. | Service request/grooming persistence and status synchronization have PHPUnit coverage. | PARTIAL: browser did not complete cashier settlement and grooming completion/pickup. |

## Evidence

- Browser evidence root: `browser-evidence/system-security-audit-20261108/phase12/`
- Boarding evidence: `browser-evidence/system-security-audit-20261108/phase12-boarding/`
- Veterinary evidence: `browser-evidence/system-security-audit-20261108/phase12-veterinary/`
- Walk-in evidence: `browser-evidence/system-security-audit-20261108/phase12-walk-in/`
- Final selected-suite failure: `browser-evidence/system-security-audit-20261108/phase12/selected-regression-final-rerun.json`
- The walk-in browser tests use the real UI for creation; API calls are supporting evidence for staff processing and are not equivalent to a complete browser workflow.

## Blocking acceptance gap

Do not claim all six workflows accepted. First resolve the reproducible hotel check-in tab discrepancy. Then extend the native walk-in tests to complete their remaining role handoffs in the browser, including veterinary execution, hotel payment/occupancy and grooming payment/completion/pickup. Preserve existing gates and verify resulting rows in the isolated database.
