// Mirrors backend App\Support\VeterinaryStatus. Keep the two lists in sync.

// Intake: patient is on-site but the vet has not started yet.
export const VET_INTAKE_STATUSES = ["checked_in"];

// Statuses from which a veterinarian may start the consultation.
export const VET_STARTABLE_STATUSES = ["scheduled", ...VET_INTAKE_STATUSES];

// Consultation has begun; clinical work may be recorded.
export const VET_STARTED_STATUSES = ["in_consultation", "in_treatment", "awaiting_results"];

// Clinical work done; the visit awaits checkout or is closed.
export const VET_POST_CLINICAL_STATUSES = ["clinical_complete", "checkout", "completed"];

// Once clinical work has begun, only a manager or admin may cancel.
export const VET_CANCEL_RESTRICTED_STATUSES = [
  ...VET_STARTED_STATUSES,
  "clinical_complete",
  "checkout",
];
