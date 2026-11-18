# Phase 6 Overtime Governance Decision Record

Status: **BLOCKED — no approved overtime governance policy was found in the
reviewed project documentation or schema.**

This document records the current implementation and a minimal architecture
proposal. It does not establish policy, change the existing calculation, or
authorize a migration.

## Current implementation

- `attendance.total_hours` and `attendance.overtime_hours` are calculated by
  `Attendance::calculateHours()`. Overtime is every recorded hour beyond the
  configured `CompanySchedule::overtimeThreshold()` (currently default 8).
- `PayrollComputationService::attendanceStats()` sums the attendance
  `overtime_hours` field and classifies those hours by workday/rest-day/holiday
  when a period is available. It then applies configured premium factors.
- Neither the attendance schema nor the payroll computation requires an
  approved overtime request before those hours enter payroll.
- `review_status` on an attendance row is not an overtime approval state; it
  does not distinguish requested, approved, or rejected payable hours.
- Payroll stores aggregate overtime hours/pay in its finalized row. There is
  no separate overtime request, approval, or immutable overtime audit record.
- Existing released payroll remains a stored snapshot. This phase does not
  recalculate or edit historical paid payroll.

## Policy decisions requiring the business owner

No answer below is approved. The proposed control direction is a decision
request, not active company policy.

| Question | Current system behavior | Financial impact | Security/control impact | Required implementation after decision | Status |
|---|---|---|---|---|---|
| 1. Is advance approval mandatory? | No request/approval state gates calculation or payment. | Extra hours enter preview and can increase gross/net. | No evidence of authorization before work. | Gate payable hours according to the signed rule; retain worked-hours evidence. | BLOCKED |
| 2. Which roles may request, and when? | No overtime request endpoint or requester role. | Requested and actual hours cannot be compared. | No requester attribution. | Add authenticated request actor/time/reason and allowed-role policy. | BLOCKED |
| 3. Which roles may approve/reject? | Payroll approval is separate; it does not represent per-attendance OT approval. | A payroll approver can release an aggregate containing unapproved OT. | No per-OT reviewer trail. | Add an explicit reviewer policy and authorization checks. | BLOCKED |
| 4. Can an employee approve their own overtime? | No OT reviewer exists; payroll maker-checker does not cover this decision. | Self-approved hours could affect pay without independent review. | Segregation-of-duties rule is undefined. | Enforce an approved self-review prohibition/exception with audit evidence. | BLOCKED |
| 5. Are emergency requests allowed? | No emergency marker or workflow. | Emergency work is indistinguishable from ordinary extra hours. | No exceptional-event evidence. | Add an emergency reason/evidence field only if policy defines it. | BLOCKED |
| 6. Can emergency OT be approved retrospectively? | No retrospective approval state exists. | Work may already be included in preview before any decision. | No time-bounded exception review. | Define eligibility, approver, deadline, and audit history before coding. | BLOCKED |
| 7. What happens when OT is rejected? | Attendance punches and calculated hours remain; payroll still consumes the calculated OT. | Current behavior may pay rejected/unreviewed OT; withholding worked-time pay may also create legal risk. | There is no reject state or reason. | Preserve worked-time evidence; separately implement the legally reviewed payable-hours treatment. | BLOCKED |
| 8. Are partial hours approvable? | Only the aggregate calculated hour value is used. | No representation of a partial approval or residual rejected hours. | No traceable approved quantity. | Store requested, approved, rejected quantities with invariant checks. | BLOCKED |
| 9. How is rest-day OT treated? | Classifies recorded OT on configured days off and applies the current code multiplier. | Changes gross, net, and remittance-relevant payroll totals. | No approval evidence by day type. | Confirm classification/base/rate and approved-hour source. | BLOCKED |
| 10. How are regular-holiday and special-day OT treated? | Current code classifies holidays and applies configured multipliers; constants are not policy approval. | Different tiers create materially different payable totals. | Calendar classification and authorization are not independently audited. | Approve holiday taxonomy, rate basis, and interaction with rest days first. | BLOCKED |
| 11. What evidence and history must be retained? | Punches, aggregate payroll, and payroll approval exist; no append-only OT decision history exists. | Later disputes cannot be reconciled to each approval/change. | Reviewer/time/reason and prior values are not recorded for OT. | Define retention and append-only actor/time/reason/old-new value history. | BLOCKED |
| 12. How do attendance corrections affect OT? | Approved correction recalculates attendance hours; draft payroll may be recomputed, while paid payroll is not retroactively changed. | A changed checkout can alter calculated OT and a draft payroll result. | No OT-specific reapproval or adjustment history. | Define invalidation/re-review behavior; preserve paid payroll and use an authorized adjustment process. | BLOCKED |

### Release gate proposal (not activated)

Until the business owner approves the policy, treat any payroll with calculated
overtime as **not safe to release without a separately authorized manual
decision**. This is a proposed operational hold, not a code change or an
approved payroll rule. I did not block payroll release in code because that
would change company compensation behavior without authorization. The current
system still carries a release risk.

## Minimal technical proposal (not implemented)

Keep the raw punches and `total_hours` as the immutable attendance evidence.
Keep a calculated-overtime value distinct from payable overtime. Once policy is
approved, add one authoritative overtime decision record per attendance day
(or the approved request granularity) containing:

- attendance/person/date reference;
- calculated hours at request/review time;
- requested hours and request reason/actor/time;
- state (`pending`, `approved`, `rejected`, with any emergency state only if
  policy defines it);
- approved payable hours (bounded by verified worked overtime);
- reviewer, review time, rejection reason, and append-only change history.

Add a database uniqueness rule for the chosen request granularity. Payroll
would consume only the approved payable hours for new draft/preview
calculations, classify them using the approved workday/rest-day/holiday policy,
and persist the decision snapshot with payroll. The approval and payroll
snapshot must be transactionally consistent. Historical paid payroll is never
recalculated.

## Verification approach while blocked

- Preserve and test the current calculated-hours and premium behavior as
  existing behavior, not as evidence of approval.
- Add no fake approval route, status, or passing workflow.
- Trace confirms the existing compute preview and generate paths both call
  `PayrollComputationService`; `Payroll::calculatePayroll()` uses the same
  service for linked payroll updates. The payroll row stores the calculated
  aggregate hours/premium amounts, approval stamps apply to the whole payroll,
  release marks it paid and creates a deduplicated payslip outbox intent, the
  payslip projects the saved payroll row, and remittance reads paid payroll
  contributions. Thus unapproved calculated OT can flow from preview to the
  saved payroll snapshot, release, payslip, and associated reporting without
  an OT-specific authorization checkpoint.
- Before enabling payable overtime governance, obtain written answers to all
  policy questions above and then implement the approved policy with duplicate,
  authorization, race, holiday-tier, preview/generation, and historical-lock
  tests.
