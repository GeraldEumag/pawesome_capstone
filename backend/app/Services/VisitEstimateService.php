<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\ServiceItemUsage;
use App\Models\User;
use App\Models\VisitEstimate;
use App\Support\VeterinaryStatus;
use Illuminate\Support\Facades\DB;

/**
 * Visit estimates: the vet drafts a cost estimate during consultation, the
 * customer (portal) or authorized staff (counter) approves it, and treatment
 * charges are gated on that approval. When projected charges exceed the
 * approved total by more than the configured threshold the estimate returns
 * to an approval-required state until it is re-approved.
 */
class VisitEstimateService
{
    /**
     * Create or replace the draft estimate lines for a visit. Only draft or
     * changes_requested estimates may be edited; editing an approved estimate
     * creates a new version that requires re-approval.
     */
    public static function saveDraft(Appointment $appointment, array $lines, ?string $notes, int $userId): VisitEstimate
    {
        return DB::transaction(function () use ($appointment, $lines, $notes, $userId) {
            $locked = Appointment::where('id', $appointment->id)->lockForUpdate()->firstOrFail();

            $estimate = VisitEstimate::where('appointment_id', $locked->id)->lockForUpdate()->first();
            $isRevision = $estimate && in_array($estimate->status, [
                VisitEstimate::STATUS_APPROVED,
                VisitEstimate::STATUS_PRESENTED,
                VisitEstimate::STATUS_REJECTED,
            ], true);

            if (!$estimate) {
                $estimate = VisitEstimate::create([
                    'appointment_id' => $locked->id,
                    'status' => VisitEstimate::STATUS_DRAFT,
                    'threshold_percent' => config('veterinary.estimate_reapproval_percent', 20),
                    'created_by' => $userId,
                ]);
            } elseif ($isRevision) {
                // Editing a presented/approved estimate bumps the version and
                // returns it to draft — it must be presented and approved again.
                $estimate->update([
                    'version' => $estimate->version + 1,
                    'status' => VisitEstimate::STATUS_DRAFT,
                    'approved_total' => null,
                    'approved_by_user_id' => null,
                    'approved_by_customer_id' => null,
                    'approved_at' => null,
                    'rejected_at' => null,
                    'channel' => null,
                ]);
            } elseif ($estimate->status !== VisitEstimate::STATUS_DRAFT
                && $estimate->status !== VisitEstimate::STATUS_CHANGES_REQUESTED) {
                throw new \RuntimeException('Estimate cannot be edited in its current state');
            }

            // Server-side line totals — client totals are never trusted.
            $estimate->lines()->delete();
            $subtotal = 0.0;
            foreach (array_values($lines) as $i => $line) {
                $qty = max(1, (int) ($line['quantity'] ?? 1));
                $unit = round((float) ($line['unit_price'] ?? 0), 2);
                $total = round($qty * $unit, 2);
                $subtotal += $total;
                $estimate->lines()->create([
                    'item_type' => $line['item_type'] ?? 'service',
                    'description' => trim((string) ($line['description'] ?? 'Item')),
                    'quantity' => $qty,
                    'unit_price' => $unit,
                    'line_total' => $total,
                    'sort_order' => $i,
                ]);
            }

            $estimate->update([
                'subtotal' => round($subtotal, 2),
                'notes' => $notes ?? $estimate->notes,
            ]);

            return $estimate->fresh('lines');
        });
    }

    /**
     * Mark the estimate presented to the customer (portal) or ready for
     * counter approval.
     */
    public static function present(Appointment $appointment, int $userId): VisitEstimate
    {
        return DB::transaction(function () use ($appointment, $userId) {
            $estimate = self::lockedEstimate($appointment);

            if (in_array($estimate->status, [VisitEstimate::STATUS_APPROVED, VisitEstimate::STATUS_PRESENTED], true)) {
                return $estimate; // idempotent
            }
            if ($estimate->status === VisitEstimate::STATUS_REJECTED) {
                throw new \RuntimeException('A rejected estimate must be revised before presenting again');
            }

            $estimate->update([
                'status' => VisitEstimate::STATUS_PRESENTED,
                'presented_at' => now(),
            ]);

            $appointment->loadMissing('customer.user');
            if ($appointment->customer?->user_id) {
                WorkflowNotifier::notifyUser(
                    (int) $appointment->customer->user_id,
                    'Estimate ready for review',
                    'A cost estimate for your visit is ready. Please review and approve it.',
                    'info',
                    'appointment',
                    $appointment->id
                );
            }

            return $estimate;
        });
    }

    /**
     * Approve the estimate. Channel is 'portal' when the customer approves
     * themselves, 'counter' when authorized staff records approval on behalf
     * of a walk-in customer.
     */
    public static function approve(Appointment $appointment, string $channel, ?User $user, ?Customer $customer): VisitEstimate
    {
        return DB::transaction(function () use ($appointment, $channel, $user, $customer) {
            $estimate = self::lockedEstimate($appointment);

            if ($estimate->status === VisitEstimate::STATUS_APPROVED) {
                return $estimate; // idempotent
            }
            if (!in_array($estimate->status, [
                VisitEstimate::STATUS_PRESENTED,
                VisitEstimate::STATUS_DRAFT,
                VisitEstimate::STATUS_CHANGES_REQUESTED,
            ], true)) {
                throw new \RuntimeException('Estimate cannot be approved in its current state');
            }
            if ($estimate->lines()->count() === 0) {
                throw new \RuntimeException('Cannot approve an estimate with no lines');
            }

            $estimate->update([
                'status' => VisitEstimate::STATUS_APPROVED,
                'approved_total' => $estimate->subtotal,
                'channel' => $channel,
                'approved_by_user_id' => $user?->id,
                'approved_by_customer_id' => $customer?->id,
                'approved_at' => now(),
                'rejected_at' => null,
            ]);

            WorkflowNotifier::notifyRole(
                'veterinary',
                'Estimate approved',
                "Visit #{$appointment->id} estimate was approved ({$channel}).",
                'success',
                'appointment',
                $appointment->id
            );

            return $estimate;
        });
    }

    public static function reject(Appointment $appointment, ?User $user, ?Customer $customer): VisitEstimate
    {
        return DB::transaction(function () use ($appointment, $user, $customer) {
            $estimate = self::lockedEstimate($appointment);

            if ($estimate->status === VisitEstimate::STATUS_REJECTED) {
                return $estimate;
            }
            if ($estimate->status === VisitEstimate::STATUS_APPROVED) {
                throw new \RuntimeException('An approved estimate cannot be rejected; revise it instead');
            }

            $estimate->update([
                'status' => VisitEstimate::STATUS_REJECTED,
                'rejected_at' => now(),
                'approved_by_user_id' => $user?->id,
                'approved_by_customer_id' => $customer?->id,
            ]);

            return $estimate;
        });
    }

    /**
     * Re-evaluate the threshold after invoice totals change. If projected
     * charges exceed approved_total * (1 + threshold), move the estimate to
     * changes_requested so further treatment charges are blocked until the
     * customer re-approves.
     */
    public static function evaluateThreshold(Appointment $appointment): ?VisitEstimate
    {
        $estimate = VisitEstimate::where('appointment_id', $appointment->id)->first();
        if (!$estimate || $estimate->status !== VisitEstimate::STATUS_APPROVED || !$estimate->approved_total) {
            return $estimate;
        }

        $projected = (float) ServiceItemUsage::where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
            ->where('service_id', $appointment->id)
            ->billable()
            ->sum('total_price');
        $discounts = (float) ServiceItemUsage::where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
            ->where('service_id', $appointment->id)
            ->where('item_type', ServiceItemUsage::ITEM_DISCOUNT)
            ->sum('total_price');
        $projected -= $discounts;

        $ceiling = (float) $estimate->approved_total * (1 + (float) $estimate->threshold_percent / 100);

        if ($projected > $ceiling) {
            $estimate->update(['status' => VisitEstimate::STATUS_CHANGES_REQUESTED]);

            $appointment->loadMissing('customer.user');
            if ($appointment->customer?->user_id) {
                WorkflowNotifier::notifyUser(
                    (int) $appointment->customer->user_id,
                    'Updated estimate needs your approval',
                    'Projected charges for the visit exceeded the approved estimate. Please review the updated estimate.',
                    'warning',
                    'appointment',
                    $appointment->id
                );
            }
        }

        return $estimate;
    }

    /**
     * Sync the current invoice line set into the estimate when it is in
     * changes_requested, so the customer re-approves against real projected
     * charges rather than the vet's original draft.
     */
    public static function refreshLinesFromCharges(VisitEstimate $estimate): VisitEstimate
    {
        $usages = ServiceItemUsage::where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
            ->where('service_id', $estimate->appointment_id)
            ->orderBy('created_at')
            ->get();

        $estimate->lines()->delete();
        $subtotal = 0.0;
        foreach ($usages->values() as $i => $usage) {
            $isDiscount = $usage->item_type === ServiceItemUsage::ITEM_DISCOUNT;
            $lineTotal = (float) $usage->total_price * ($isDiscount ? -1 : 1);
            $subtotal += $lineTotal;
            $estimate->lines()->create([
                'item_type' => $usage->item_type,
                'description' => ($isDiscount ? 'Less: ' : '') . ($usage->description ?: 'Charge'),
                'quantity' => max(1, (int) ($usage->quantity_used ?? 1)),
                'unit_price' => (float) $usage->unit_price,
                'line_total' => $lineTotal,
                'sort_order' => $i,
            ]);
        }
        $estimate->update(['subtotal' => round($subtotal, 2)]);

        return $estimate->fresh('lines');
    }

    private static function lockedEstimate(Appointment $appointment): VisitEstimate
    {
        $estimate = VisitEstimate::where('appointment_id', $appointment->id)->lockForUpdate()->first();
        if (!$estimate) {
            throw new \RuntimeException('No estimate exists for this visit');
        }

        return $estimate;
    }

    /**
     * Serialize an estimate for API responses.
     */
    public static function serialize(?VisitEstimate $estimate): ?array
    {
        if (!$estimate) {
            return null;
        }
        $estimate->loadMissing('lines', 'approvedByUser:id,name', 'approvedByCustomer:id,name');

        return [
            'id' => $estimate->id,
            'appointment_id' => $estimate->appointment_id,
            'version' => $estimate->version,
            'status' => $estimate->status,
            'subtotal' => (float) $estimate->subtotal,
            'approved_total' => $estimate->approved_total !== null ? (float) $estimate->approved_total : null,
            'threshold_percent' => (float) $estimate->threshold_percent,
            'channel' => $estimate->channel,
            'presented_at' => $estimate->presented_at,
            'approved_at' => $estimate->approved_at,
            'notes' => $estimate->notes,
            'lines' => $estimate->lines->map(fn ($l) => [
                'id' => $l->id,
                'item_type' => $l->item_type,
                'description' => $l->description,
                'quantity' => $l->quantity,
                'unit_price' => (float) $l->unit_price,
                'line_total' => (float) $l->line_total,
            ])->values()->all(),
        ];
    }
}
