# Phase 6 Leave Policy Decision Matrix

Status: **BLOCKED — no approved policy found for the cases below.** Current
behavior is not evidence of business approval. No leave policy was changed in
this phase.

| Case | Decision needed | Current implementation risk/status |
|---|---|---|
| Holiday inside leave range | Is it excluded from charged leave days and paid by holiday rules? | Leave request day-count and payroll holiday interaction are not fully aligned/verified. |
| Rest day inside leave range | Is it excluded from charged leave days? | No approved rule documented; verify before changing day counts. |
| Cross-year request | Which year's balance, accrual, and carryover apply? | Request spans are accepted by date range; year-specific balance treatment is unresolved. |
| Insufficient balance | Reject request, allow unpaid conversion, or permit negative balance? | No approved conversion/negative-balance rule; do not infer from current validation. |
| Half-day overlaps | Which half (AM/PM), and how are overlapping requests resolved? | Fractional `days_counted` exists, but overlap semantics are not fully represented. |
| Multiple leave types on one date | Which request takes precedence, or should overlap be rejected? | New overlapping pending/approved requests are blocked; legacy overlaps can remain and payroll precedence is implementation-specific. |
| Cancellation after attendance generation | Should generated leave attendance be removed/reverted, and who authorizes it? | Cancellation reconciles applicable attendance but has no approved historical/payroll policy; finalized payroll must remain unchanged. |

Obtain written business-owner decisions before extending behavior. Preserve
current records and use an explicit authorized correction process for any
historical remediation.
