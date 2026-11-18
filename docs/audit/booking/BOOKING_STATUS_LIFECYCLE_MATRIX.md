# Booking Status Lifecycle Matrix

Booking status is separate from payment status; uploading proof sets payment to `pending`, not `paid`.

| Workflow | Expected progression | Invalid-transition evidence |
| --- | --- | --- |
| Veterinary | pending/requested → scheduled/approved → checked_in → in_consultation → treatment/clinical completion → checkout/completed | scheduled→completed returned 422; bogus status returned 422 |
| Boarding | pending → approved/scheduled → in_care/checked_in → ready_for_pickup → completed/checked_out | unpaid/date-mismatched check-in rejected; duplicate check-in rejected |
| Grooming | pending → approved → in_progress → completed; pending may be rejected/cancelled | cancelled→approved and cancelled→in_progress reproduced as 200 before fix; now 422 |
| Payment | unpaid → pending proof → paid or rejected → resubmitted/settled | repeat verify returned 422; proof upload alone remained pending |

Legacy values in database enums and varchar columns are retained and documented in `BOOKING_DATABASE_RELATIONSHIP_AUDIT.md`; no status values were removed or invented.
