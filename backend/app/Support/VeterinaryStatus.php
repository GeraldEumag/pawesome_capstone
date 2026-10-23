<?php

namespace App\Support;

/**
 * Single source for veterinary status groupings. Dashboard cards, the queue,
 * history and the start/cancel guards all read from here so they cannot drift.
 */
final class VeterinaryStatus
{
    /** Non-terminal visit statuses shown on the vet queue and dashboard. */
    public const QUEUE = [
        'scheduled',
        'checked_in',
        'in_consultation',
        'in_treatment',
        'awaiting_results',
        'clinical_complete',
        'checkout',
    ];

    /** Intake states from which a veterinarian may start the consultation. */
    public const STARTABLE = ['scheduled', 'checked_in'];

    /** Visits that may be checked in at the front desk. */
    public const INTAKE_ELIGIBLE = ['requested', 'scheduled'];

    /** Visits in the intake pipeline (patient on-site, waiting for the vet). */
    public const INTAKE = ['checked_in'];

    /** Consultation has begun; clinical work may be recorded. */
    public const STARTED = ['in_consultation', 'in_treatment', 'awaiting_results'];

    /** Clinical work is done; the visit awaits checkout or is closed. */
    public const POST_CLINICAL = ['clinical_complete', 'checkout', 'completed'];

    /** Once clinical work has begun, only a manager or admin may cancel. */
    public const CANCEL_RESTRICTED = [
        'in_consultation',
        'in_treatment',
        'awaiting_results',
        'clinical_complete',
        'checkout',
    ];

    /** Receptionist may still assign or reassign the veterinarian. */
    public const ASSIGNABLE = ['requested', 'scheduled', 'checked_in'];

    /**
     * Confinement states that keep a visit from auto-completing. Phase D
     * renamed the lifecycle — new + legacy values are both listed so stale
     * rows can never wedge a visit open.
     */
    public const CONFINEMENT_OPEN = [
        'recommended',
        'consented',
        'bed_assigned',
        'admitted',
        'under_care',
        'ready_for_discharge',
        // legacy (pre-Phase-D rows)
        'approved_for_admission',
        'under_observation',
        'under_treatment',
    ];
}
