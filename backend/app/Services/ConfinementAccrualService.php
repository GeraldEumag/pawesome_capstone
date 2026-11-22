<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\MedicalConfinement;
use App\Models\ServiceItemUsage;
use App\Support\ConfinementStatusMap;
use Illuminate\Support\Facades\DB;

/**
 * Daily inpatient charge accrual. Each day a confined pet occupies a bed,
 * the confinement's daily_rate is billed onto the linked visit's running
 * invoice (interim invoice — the same visit_invoice the cashier settles).
 * Accrual rows are system-generated inside the visit's transaction, so they
 * bypass the staff billing gate; the confinement consent + estimate cover
 * the financial authorization.
 */
class ConfinementAccrualService
{
    private const IN_CARE_STATUSES = [
        'admitted',
        'under_care',
        'ready_for_discharge',
        // legacy (pre-Phase-D rows)
        'under_observation',
        'under_treatment',
    ];

    /**
     * Accrue due daily charges for all open confinements. Returns per-
     * confinement results. Idempotent per day via last_accrual_at.
     */
    public static function accrueAll(): array
    {
        $results = [];
        // ready_for_discharge pets still occupy the bed, so they keep accruing
        // until release() runs its final catch-up accrual.
        $open = MedicalConfinement::whereIn('status', self::IN_CARE_STATUSES)
            ->whereNotNull('consultation_id')
            ->get();

        foreach ($open as $confinement) {
            // Isolate failures — one bad row must not starve accrual for the
            // rest of the ward.
            try {
                $results[$confinement->id] = self::accrue($confinement);
            } catch (\Throwable $e) {
                $results[$confinement->id] = ['accrued_days' => 0, 'amount' => 0.0, 'error' => $e->getMessage()];
            }
        }

        return $results;
    }

    /**
     * Accrue the open confinements linked to one visit. Called lazily from
     * billing reads so a running bill always reflects elapsed inpatient
     * days without waiting for the daily scheduler. Re-entrancy-guarded:
     * accrue() ends in syncServicePaymentState(), which calls back here.
     */
    public static function accrueOpenForAppointment(Appointment $appointment): void
    {
        static $depth = 0;
        if ($depth > 0) {
            return;
        }
        $depth++;
        try {
            $open = MedicalConfinement::where('consultation_id', $appointment->id)
                ->whereIn('status', self::IN_CARE_STATUSES)
                ->get();
            foreach ($open as $confinement) {
                try {
                    self::accrue($confinement);
                } catch (\Throwable $e) {
                    // Isolate failures — one bad confinement must not break
                    // the billing read that triggered this accrual.
                }
            }
        } finally {
            $depth--;
        }
    }

    /**
     * Accrue one confinement. Adds one usage row per billable calendar day
     * since the last billed date; zero when nothing is due. The first
     * accrual after admission bills the admission day itself — a same-day
     * stay still owes one day of care.
     */
    public static function accrue(MedicalConfinement $confinement): array
    {
        return DB::transaction(function () use ($confinement) {
            $locked = MedicalConfinement::where('id', $confinement->id)->lockForUpdate()->firstOrFail();
            // ready_for_discharge is included so release()'s final catch-up
            // accrual actually bills the trailing days before discharge.
            if (!in_array(ConfinementStatusMap::forward((string) $locked->status), ['admitted', 'under_care', 'ready_for_discharge'], true)) {
                return ['accrued_days' => 0, 'amount' => 0.0];
            }

            $rate = (float) ($locked->daily_rate
                ?? $locked->wardBed?->daily_rate
                ?? $locked->room?->daily_rate
                ?? 0);
            if ($rate <= 0 || !$locked->consultation_id) {
                return ['accrued_days' => 0, 'amount' => 0.0];
            }

            $anchor = $locked->last_accrual_at ?? $locked->admitted_at ?? $locked->created_at;
            // With no prior accrual the stay bills from the admission date;
            // afterwards each run bills the new calendar days since then.
            $firstBillable = $locked->last_accrual_at
                ? $locked->last_accrual_at->copy()->startOfDay()->addDay()
                : $anchor->copy()->startOfDay();
            $daysDue = (int) $firstBillable->diffInDays(now()->startOfDay()) + 1;
            if ($daysDue <= 0) {
                return ['accrued_days' => 0, 'amount' => 0.0];
            }

            $appointment = Appointment::find($locked->consultation_id);
            if (!$appointment) {
                return ['accrued_days' => 0, 'amount' => 0.0];
            }

            $total = 0.0;
            for ($day = 0; $day < $daysDue; $day++) {
                $dayDate = $firstBillable->copy()->addDays($day)->toDateString();
                ServiceItemUsage::create([
                    'service_type' => ServiceItemUsage::SERVICE_VETERINARY,
                    'service_id' => $appointment->id,
                    'appointment_id' => $appointment->id,
                    'pet_id' => $appointment->pet_id,
                    'customer_id' => $appointment->customer_id,
                    'customer_email' => $appointment->customer?->email,
                    'quantity_used' => 1,
                    'unit' => 'day',
                    'usage_type' => 'inpatient_accrual',
                    'used_by' => null,
                    'role' => 'system',
                    'notes' => "Confinement #{$locked->id} daily care — {$dayDate}",
                    'item_type' => ServiceItemUsage::ITEM_MANUAL_CHARGE,
                    'description' => "Inpatient daily care ({$dayDate})",
                    'unit_price' => $rate,
                    'total_price' => $rate,
                    'charge_amount' => $rate,
                    'is_billable' => true,
                    'is_paid' => false,
                    'pet_name_snapshot' => $locked->pet_name,
                    'service_name_snapshot' => $appointment->service?->name,
                ]);
                $total += $rate;
            }

            $locked->update(['last_accrual_at' => now()]);
            ServiceBillingService::syncServicePaymentState(ServiceItemUsage::SERVICE_VETERINARY, $appointment->id);

            return ['accrued_days' => $daysDue, 'amount' => round($total, 2)];
        });
    }
}
