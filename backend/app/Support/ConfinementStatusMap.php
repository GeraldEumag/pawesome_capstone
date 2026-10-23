<?php

namespace App\Support;

/**
 * Canonical medical-confinement status vocabulary for Phase D, plus the
 * legacy → new mapping used by the migration and the model's saving hook
 * (so stray legacy writes can't reintroduce retired statuses).
 */
class ConfinementStatusMap
{
    /** Canonical lifecycle. */
    public const VALID = [
        'recommended',
        'consented',
        'bed_assigned',
        'admitted',
        'under_care',
        'ready_for_discharge',
        'discharged',
        'cancelled',
        'transferred',
        'deceased',
    ];

    /** Legacy → canonical. Unmapped values pass through. */
    public const LEGACY_FORWARD = [
        'approved_for_admission' => 'bed_assigned',
        'under_observation' => 'under_care',
        'under_treatment' => 'under_care',
        'completed' => 'discharged',
    ];

    /** Canonical → legacy (rollback). */
    public const LEGACY_REVERSE = [
        'bed_assigned' => 'approved_for_admission',
        'discharged' => 'completed',
    ];

    /** Statuses where the pet is still physically in care / blocks visit closure. */
    public const OPEN = [
        'recommended',
        'consented',
        'bed_assigned',
        'admitted',
        'under_care',
        'ready_for_discharge',
    ];

    /** Legacy values that also mean "open" (pre-migration rows). */
    public const LEGACY_OPEN = [
        'approved_for_admission',
        'under_observation',
        'under_treatment',
    ];

    public const CARE_LEVELS = ['observation', 'treatment', 'critical'];

    /** Legacy statuses that imply a care level on migration. */
    public const LEGACY_CARE_LEVEL = [
        'under_observation' => 'observation',
        'under_treatment' => 'treatment',
    ];

    public static function forward(string $status): string
    {
        return self::LEGACY_FORWARD[$status] ?? $status;
    }

    public static function isOpen(string $status): bool
    {
        return in_array($status, self::OPEN, true)
            || in_array($status, self::LEGACY_OPEN, true);
    }
}
