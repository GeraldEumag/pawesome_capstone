<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\User;

class ClinicalAccessLogger
{
    /**
     * Record that staff viewed patient data they are not assigned to. Assigned
     * clinicians are not logged, so the trail shows cross-vet access only.
     */
    public static function record(?User $user, string $subjectType, int $subjectId, bool $assigned, array $metadata = []): void
    {
        if (!$user || $assigned) {
            return;
        }

        ActivityLog::log($user->id, 'clinical_record_viewed', "Viewed {$subjectType} #{$subjectId} without assignment", [
            'category' => 'clinical_access',
            'reference_type' => $subjectType,
            'reference_id' => $subjectId,
            'metadata' => $metadata,
        ]);
    }
}
