<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\MedicalRecord;
use App\Models\User;
use App\Support\VeterinaryStatus;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

class VisitStartService
{
    /**
     * Idempotent consultation start. The visit row is locked so concurrent
     * starts serialize: the first one moves the visit into consultation and
     * creates the draft record; repeats return the existing state unchanged.
     *
     * @return array{appointment: Appointment, record: MedicalRecord, started: bool}
     */
    public static function start(int $appointmentId, User $actor, ?string $notes = null): array
    {
        return DB::transaction(function () use ($appointmentId, $actor, $notes) {
            $appointment = Appointment::with(['customer', 'pet'])->whereKey($appointmentId)->lockForUpdate()->firstOrFail();

            if ($appointment->veterinarian_id
                && (int) $appointment->veterinarian_id !== (int) $actor->id
                && !$actor->hasRoleAccess('admin')) {
                throw new HttpResponseException(response()->json(['error' => 'This consultation is assigned to another veterinarian'], 403));
            }

            $started = in_array($appointment->status, VeterinaryStatus::STARTABLE, true);
            if (!$started && !in_array($appointment->status, VeterinaryStatus::STARTED, true)) {
                throw new HttpResponseException(response()->json([
                    'message' => 'Only scheduled or checked-in appointments can be started',
                    'error' => 'Only scheduled consultations can be started',
                    'current_status' => $appointment->status,
                ], 422));
            }

            $update = ['veterinarian_id' => $appointment->veterinarian_id ?: $actor->id];
            if ($started) {
                $update['status'] = Appointment::STATUS_IN_CONSULTATION;
                $update['started_at'] = now();
                // A walk-in or emergency visit may skip the front-desk check-in.
                $update['checked_in_at'] = $appointment->checked_in_at ?: now();
                if ($notes !== null && $notes !== '') {
                    $update['notes'] = $appointment->notes . "\n[Started]: " . $notes;
                }
            }
            $appointment->update($update);

            $record = MedicalRecord::firstOrCreate(
                ['appointment_id' => $appointment->id, 'pet_id' => $appointment->pet_id],
                [
                    'veterinarian_id' => $appointment->veterinarian_id,
                    'visit_date' => now(),
                    'chief_complaint' => $appointment->notes,
                    'status' => MedicalRecord::STATUS_DRAFT,
                ]
            );

            return ['appointment' => $appointment->fresh(['customer', 'pet', 'service', 'veterinarian']), 'record' => $record, 'started' => $started];
        });
    }
}
