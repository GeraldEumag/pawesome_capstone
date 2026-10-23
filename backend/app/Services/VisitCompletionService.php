<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Appointment;
use App\Models\MedicalConfinement;
use App\Models\MedicalRecord;
use App\Models\ServiceItemUsage;
use App\Support\VeterinaryStatus;

class VisitCompletionService
{
    /**
     * Closes a visit automatically once clinical work is finalized, no
     * confinement is still open, and the invoice is settled. The veterinarian
     * never closes a visit. Call from inside the caller's transaction; the
     * visit row is locked so the check and the status change are atomic.
     */
    public static function tryComplete(int $appointmentId): bool
    {
        $appointment = Appointment::with('customer')->whereKey($appointmentId)->lockForUpdate()->first();
        if (!$appointment || !in_array($appointment->status, [Appointment::STATUS_CLINICAL_COMPLETE, Appointment::STATUS_CHECKOUT], true)) {
            return false;
        }

        if (!$appointment->medicalRecords()->where('status', MedicalRecord::STATUS_FINALIZED)->exists()) {
            return false;
        }

        if (MedicalConfinement::where('consultation_id', $appointment->id)
            ->whereIn('status', VeterinaryStatus::CONFINEMENT_OPEN)
            ->exists()) {
            return false;
        }

        $billing = ServiceBillingService::canCompleteService(ServiceItemUsage::SERVICE_VETERINARY, (int) $appointment->id);
        if (!$billing['can_complete'] || strtolower((string) $appointment->payment_status) !== 'paid') {
            // Clinical work is done and nothing is still confined, so the
            // visit belongs at checkout where the cashier can see it.
            if ($appointment->status === Appointment::STATUS_CLINICAL_COMPLETE) {
                $appointment->update([
                    'status' => Appointment::STATUS_CHECKOUT,
                    'checked_out_at' => $appointment->checked_out_at ?: now(),
                    'checked_out_by' => $appointment->checked_out_by ?: auth()->id(),
                ]);
            }

            return false;
        }

        $appointment->update(['status' => Appointment::STATUS_COMPLETED, 'completed_at' => now()]);

        ActivityLog::log(auth()->id(), 'appointment_completed', "Visit #{$appointment->id} completed automatically", [
            'category' => 'veterinary',
            'reference_type' => 'appointment',
            'reference_id' => $appointment->id,
        ]);

        WorkflowNotifier::notifyUser($appointment->customer?->user_id, 'Visit completed', 'Your pet visit is complete. Thank you for visiting.', 'success', 'appointment', $appointment->id);

        return true;
    }
}
