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

    /**
     * Record a clinical list/index view. One entry per request — the row
     * count and active filters go to metadata, never record contents, so the
     * trail captures the access without duplicating medical data.
     */
    public static function recordListView(?User $user, string $listType, array $metadata = []): void
    {
        if (!$user) {
            return;
        }

        ActivityLog::log($user->id, 'clinical_record_viewed', "Viewed {$listType} list", [
            'category' => 'clinical_access',
            'reference_type' => $listType,
            'metadata' => $metadata,
        ]);
    }
}
