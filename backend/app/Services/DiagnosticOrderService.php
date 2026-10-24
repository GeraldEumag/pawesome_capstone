<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\DiagnosticOrder;
use App\Models\DiagnosticResult;
use App\Models\ActivityLog;
use App\Support\VeterinaryStatus;
use Illuminate\Support\Facades\DB;

/**
 * Diagnostic orders: ordered → collected → resulted → reviewed (or
 * cancelled). While any order is open the appointment parks in
 * awaiting_results; once every open order is reviewed the appointment
 * returns to in_consultation.
 */
class DiagnosticOrderService
{
    public static function create(Appointment $appointment, array $data, int $userId): DiagnosticOrder
    {
        return DB::transaction(function () use ($appointment, $data, $userId) {
            $locked = Appointment::where('id', $appointment->id)->lockForUpdate()->firstOrFail();
            if (!in_array($locked->status, VeterinaryStatus::STARTED, true)) {
                throw new \RuntimeException('Diagnostic orders can only be placed during an active consultation');
            }

            $order = DiagnosticOrder::create([
                'appointment_id' => $locked->id,
                'code' => self::nextCode(),
                'order_type' => $data['order_type'] ?? 'lab',
                'name' => $data['name'],
                'priority' => $data['priority'] ?? 'routine',
                'status' => DiagnosticOrder::STATUS_ORDERED,
                'notes' => $data['notes'] ?? null,
                'ordered_by' => $userId,
                'ordered_at' => now(),
            ]);

            // Optional: an order can carry a charge onto the visit invoice.
            if (!empty($data['charge_price']) && (float) $data['charge_price'] > 0) {
                ServiceBillingService::addBillingItem([
                    'service_type' => \App\Models\ServiceItemUsage::SERVICE_VETERINARY,
                    'service_id' => $locked->id,
                    'item_type' => \App\Models\ServiceItemUsage::ITEM_ADD_ON_SERVICE,
                    'description' => 'Diagnostic: ' . $order->name,
                    'quantity' => 1,
                    'unit_price' => (float) $data['charge_price'],
                    'pet_id' => $locked->pet_id,
                ]);
            }

            // Park the visit in awaiting_results while orders are open.
            if ($locked->status === 'in_consultation') {
                $locked->update(['status' => 'awaiting_results']);
            }

            WorkflowNotifier::notifyRole('vet_tech', 'Diagnostic order placed',
                "{$order->name} ordered for visit #{$locked->id}.", 'info', 'appointment', $locked->id);

            return $order;
        });
    }

    public static function collect(DiagnosticOrder $order, int $userId): DiagnosticOrder
    {
        return self::transition($order, DiagnosticOrder::STATUS_ORDERED, DiagnosticOrder::STATUS_COLLECTED, [
            'collected_by' => $userId,
            'collected_at' => now(),
        ]);
    }

    public static function result(DiagnosticOrder $order, array $data, int $userId): DiagnosticOrder
    {
        return DB::transaction(function () use ($order, $data, $userId) {
            $locked = DiagnosticOrder::where('id', $order->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === DiagnosticOrder::STATUS_RESULTED) {
                return $locked; // idempotent
            }
            if (!in_array($locked->status, [DiagnosticOrder::STATUS_ORDERED, DiagnosticOrder::STATUS_COLLECTED], true)) {
                throw new \RuntimeException("Cannot add a result to a {$locked->status} order");
            }

            DiagnosticResult::create([
                'diagnostic_order_id' => $locked->id,
                'findings' => $data['findings'] ?? null,
                'attachment_path' => $data['attachment_path'] ?? null,
                'is_abnormal' => (bool) ($data['is_abnormal'] ?? false),
                'resulted_by' => $userId,
            ]);

            $locked->update([
                'status' => DiagnosticOrder::STATUS_RESULTED,
                'resulted_by' => $userId,
                'resulted_at' => now(),
            ]);

            if ($locked->ordered_by) {
                WorkflowNotifier::notifyUser(
                    (int) $locked->ordered_by,
                    'Diagnostic result ready',
                    "Results for {$locked->name} are ready for review.",
                    'info',
                    'diagnostic_order',
                    $locked->id
                );
            }

            return $locked->fresh('results');
        });
    }

    public static function review(DiagnosticOrder $order, int $userId): DiagnosticOrder
    {
        $reviewed = self::transition($order, DiagnosticOrder::STATUS_RESULTED, DiagnosticOrder::STATUS_REVIEWED, [
            'reviewed_by' => $userId,
            'reviewed_at' => now(),
        ]);

        // Return the visit to consultation once no open orders remain.
        $appointment = Appointment::where('id', $reviewed->appointment_id)->lockForUpdate()->first();
        if ($appointment && $appointment->status === 'awaiting_results') {
            $stillOpen = DiagnosticOrder::where('appointment_id', $appointment->id)
                ->whereIn('status', DiagnosticOrder::OPEN_STATUSES)
                ->exists();
            if (!$stillOpen) {
                $appointment->update(['status' => 'in_consultation']);
            }
        }

        return $reviewed;
    }

    public static function cancel(DiagnosticOrder $order, int $userId, ?string $reason): DiagnosticOrder
    {
        return DB::transaction(function () use ($order, $userId, $reason) {
            $locked = DiagnosticOrder::where('id', $order->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === DiagnosticOrder::STATUS_CANCELLED) {
                return $locked;
            }
            if ($locked->status === DiagnosticOrder::STATUS_REVIEWED) {
                throw new \RuntimeException('A reviewed order cannot be cancelled');
            }
            $locked->update([
                'status' => DiagnosticOrder::STATUS_CANCELLED,
                'cancelled_by' => $userId,
                'cancelled_at' => now(),
                'cancel_reason' => $reason,
            ]);

            // Reverse the unpaid invoice charge created at order time — a
            // cancelled diagnostic must not stay billable. Paid lines are
            // left for the cashier's adjustment workflow.
            $usage = \App\Models\ServiceItemUsage::where('appointment_id', $locked->appointment_id)
                ->where('description', 'Diagnostic: ' . $locked->name)
                ->where('is_billable', true)
                ->where('is_paid', false)
                ->orderByDesc('id')
                ->first();
            if ($usage) {
                $usage->update([
                    'is_billable' => false,
                    'notes' => trim(($usage->notes ? $usage->notes . ' ' : '') . '[charge voided — order cancelled]'),
                ]);
                ServiceBillingService::syncServicePaymentState(
                    \App\Models\ServiceItemUsage::SERVICE_VETERINARY,
                    $locked->appointment_id
                );
            }

            ActivityLog::log($userId, 'diagnostic_order_cancelled', "Diagnostic order {$locked->code} cancelled", [
                'category' => 'medical',
                'reference_type' => 'diagnostic_order',
                'reference_id' => $locked->id,
            ]);

            return $locked;
        });
    }

    private static function transition(DiagnosticOrder $order, string $from, string $to, array $stamps): DiagnosticOrder
    {
        return DB::transaction(function () use ($order, $from, $to, $stamps) {
            $locked = DiagnosticOrder::where('id', $order->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === $to) {
                return $locked; // idempotent retry
            }
            if ($locked->status !== $from) {
                throw new \RuntimeException("Cannot move a {$locked->status} order to {$to}");
            }
            $locked->update(array_merge(['status' => $to], $stamps));

            return $locked->fresh('results');
        });
    }

    private static function nextCode(): string
    {
        $year = now()->format('Y');
        $max = DiagnosticOrder::where('code', 'like', "DX-{$year}-%")
            ->lockForUpdate()
            ->max('code');
        $seq = $max ? ((int) substr($max, -5)) + 1 : 1;

        return sprintf('DX-%s-%05d', $year, $seq);
    }
}
