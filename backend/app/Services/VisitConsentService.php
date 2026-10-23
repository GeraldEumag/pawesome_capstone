<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\MedicalConfinement;
use App\Models\User;
use App\Models\VisitConsent;
use App\Models\ActivityLog;
use Illuminate\Support\Facades\DB;

/**
 * Signed treatment consents. A consent links polymorphically to an
 * appointment or a medical confinement and records who signed, on which
 * channel (portal vs counter), and when.
 */
class VisitConsentService
{
    /**
     * Whether a signed (non-revoked) consent of the given type exists for the
     * subject. Appointments flagged emergency bypass the requirement.
     */
    public static function hasSigned(string $type, string $consentableType, int $consentableId): bool
    {
        return VisitConsent::where('consentable_type', $consentableType)
            ->where('consentable_id', $consentableId)
            ->where('type', $type)
            ->where('status', VisitConsent::STATUS_SIGNED)
            ->exists();
    }

    /**
     * Whether a confinement may be admitted: requires a signed 'confinement'
     * consent linked to the confinement or its appointment, unless the visit
     * was flagged emergency.
     */
    public static function canAdmitConfinement(MedicalConfinement $confinement): bool
    {
        $appointment = $confinement->consultation_id
            ? Appointment::find($confinement->consultation_id)
            : null;

        if ($appointment?->emergency) {
            return true;
        }

        if (self::hasSigned(VisitConsent::TYPE_CONFINEMENT, 'medical_confinement', $confinement->id)) {
            return true;
        }

        return $appointment
            && self::hasSigned(VisitConsent::TYPE_CONFINEMENT, 'appointment', $appointment->id);
    }

    public static function record(array $data, ?User $signer): VisitConsent
    {
        return DB::transaction(function () use ($data, $signer) {
            return VisitConsent::create([
                'consentable_type' => $data['consentable_type'],
                'consentable_id' => (int) $data['consentable_id'],
                'type' => $data['type'],
                'title' => $data['title'],
                'body' => $data['body'] ?? null,
                'signer_name' => $data['signer_name'],
                'signer_relationship' => $data['signer_relationship'] ?? 'owner',
                'channel' => $data['channel'] ?? 'counter',
                'signed_by_user_id' => $signer?->id,
                'signed_at' => now(),
                'status' => VisitConsent::STATUS_SIGNED,
            ]);
        });
    }

    public static function revoke(VisitConsent $consent, int $userId, string $reason): VisitConsent
    {
        return DB::transaction(function () use ($consent, $userId, $reason) {
            $locked = VisitConsent::where('id', $consent->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === VisitConsent::STATUS_REVOKED) {
                return $locked;
            }
            $locked->update([
                'status' => VisitConsent::STATUS_REVOKED,
                'revoked_at' => now(),
                'revoked_by' => $userId,
                'revoke_reason' => $reason,
            ]);

            ActivityLog::log($userId, 'consent_revoked', "Consent #{$locked->id} ({$locked->type}) revoked", [
                'category' => 'medical',
                'reference_type' => 'visit_consent',
                'reference_id' => $locked->id,
            ]);

            return $locked;
        });
    }
}
