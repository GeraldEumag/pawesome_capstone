<?php

return [
    /*
    | When projected visit charges exceed the approved estimate by more than
    | this percentage, the estimate re-enters an approval-required state and
    | further treatment charges are blocked until re-approval (or the visit
    | is flagged emergency).
    */
    'estimate_reapproval_percent' => (float) env('VET_ESTIMATE_REAPPROVAL_PCT', 20),

    /*
    | Discounts, waivers and write-offs at or above this amount require
    | manager approval before they are applied to a visit invoice.
    */
    'adjustment_approval_limit' => (float) env('VET_ADJUSTMENT_APPROVAL_LIMIT', 500),
];
