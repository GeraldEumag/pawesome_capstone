<?php

namespace App\Services;

use App\Models\Grooming;
use App\Models\ServiceRequest;
use Illuminate\Support\Facades\DB;

class GroomingStatusSynchronizer
{
    /**
     * Persist request and execution status changes as one unit.
     *
     * The service request is written first deliberately; the transaction must
     * roll it back if the linked grooming write fails.
     *
     * @return array{
     *     request: ?ServiceRequest,
     *     grooming: ?Grooming,
     *     error: ?array{message:string,current_status:string,requested_status:string}
     * }
     */
    public function synchronize(
        ?ServiceRequest $serviceRequest,
        ?Grooming $grooming,
        array $requestChanges,
        array $groomingChanges
    ): array {
        if (!$serviceRequest && !$grooming) {
            throw new \InvalidArgumentException('A service request or grooming record is required.');
        }

        return DB::transaction(function () use ($serviceRequest, $grooming, $requestChanges, $groomingChanges): array {
            $lockedRequest = $serviceRequest
                ? ServiceRequest::query()->whereKey($serviceRequest->getKey())->lockForUpdate()->firstOrFail()
                : null;
            $lockedGrooming = $grooming
                ? Grooming::query()->whereKey($grooming->getKey())->lockForUpdate()->firstOrFail()
                : null;

            $targetStatus = $requestChanges['status'] ?? $groomingChanges['status'] ?? null;
            if ($targetStatus !== null && array_key_exists($targetStatus, Grooming::STATUS_TRANSITIONS)
                && $lockedRequest && $lockedRequest->status !== $targetStatus
                && !Grooming::allowsTransition((string) $lockedRequest->status, $targetStatus)) {
                return [
                    'request' => $lockedRequest,
                    'grooming' => $lockedGrooming,
                    'error' => [
                        'message' => 'Invalid grooming booking status transition.',
                        'current_status' => (string) $lockedRequest->status,
                        'requested_status' => $targetStatus,
                    ],
                ];
            }
            if ($targetStatus !== null && $lockedGrooming && $lockedGrooming->status !== $targetStatus
                && !$lockedGrooming->canTransitionTo($targetStatus)) {
                return [
                    'request' => $lockedRequest,
                    'grooming' => $lockedGrooming,
                    'error' => [
                        'message' => 'Invalid grooming status transition.',
                        'current_status' => $lockedGrooming->status,
                        'requested_status' => $targetStatus,
                    ],
                ];
            }

            if ($lockedRequest && $requestChanges !== []) {
                $lockedRequest->fill($requestChanges);
                $lockedRequest->save();
            }

            if ($lockedGrooming && $groomingChanges !== []) {
                $lockedGrooming->fill($groomingChanges);
                $lockedGrooming->save();
            }

            return ['request' => $lockedRequest, 'grooming' => $lockedGrooming, 'error' => null];
        });
    }
}
