<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Phase B visit-status migration map. Converts the legacy appointment status
 * vocabulary to the patient-care workflow statuses and back, so the data
 * migration and its rollback share one definition.
 */
final class VisitStatusMap
{
    /**
     * Legacy status => new status, for rows without a finalized record.
     * needs_confinement is special-cased: it becomes clinical_complete when a
     * finalized record exists, otherwise in_consultation.
     */
    public const FORWARD = [
        'pending' => 'requested',
        'approved' => 'scheduled',
        'in_progress' => 'in_consultation',
        'treated' => 'clinical_complete',
        'awaiting_payment' => 'checkout',
        // unchanged: scheduled, in_consultation, completed, cancelled, rejected, no_show
    ];

    /** Map one legacy row to its new status. Null = no change needed. */
    public static function forward(string $status, bool $hasFinalizedRecord): ?string
    {
        if ($status === 'needs_confinement') {
            return $hasFinalizedRecord ? 'clinical_complete' : 'in_consultation';
        }

        return self::FORWARD[$status] ?? null;
    }

    /**
     * Rewrite legacy statuses in the appointments table. Uses query-builder
     * writes so the Eloquent saving hook does not interfere. Records each
     * changed row in $mapTable so down() can restore it exactly.
     *
     * @return array<string,int> per-legacy-status counts
     */
    public static function migrate(string $mapTable): array
    {
        $counts = [];

        $rows = DB::table('appointments')
            ->whereIn('status', array_merge(array_keys(self::FORWARD), ['needs_confinement']))
            ->get(['id', 'status']);

        foreach ($rows as $row) {
            $hasFinalized = $row->status !== 'needs_confinement'
                ? false
                : DB::table('medical_records')
                    ->where('appointment_id', $row->id)
                    ->where('status', 'finalized')
                    ->exists();

            $newStatus = self::forward($row->status, $hasFinalized);
            if ($newStatus === null || $newStatus === $row->status) {
                continue;
            }

            DB::table($mapTable)->insert([
                'appointment_id' => $row->id,
                'old_status' => $row->status,
                'old_confinement_recommended' => 0,
            ]);

            DB::table('appointments')->where('id', $row->id)->update([
                'status' => $newStatus,
                'confinement_recommended' => $row->status === 'needs_confinement' ? 1 : 0,
                'updated_at' => now(),
            ]);

            $counts[$row->status] = ($counts[$row->status] ?? 0) + 1;
        }

        return $counts;
    }

    /**
     * Restore statuses and the flag from the map table written by migrate().
     */
    public static function rollback(string $mapTable): int
    {
        $restored = 0;

        foreach (DB::table($mapTable)->get() as $row) {
            DB::table('appointments')->where('id', $row->appointment_id)->update([
                'status' => $row->old_status,
                'confinement_recommended' => (bool) $row->old_confinement_recommended,
                'updated_at' => now(),
            ]);
            $restored++;
        }

        return $restored;
    }
}
