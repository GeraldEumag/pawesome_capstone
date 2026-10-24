<?php

namespace App\Support;

use App\Services\ServiceCatalog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Authoritative amount for a payable row: persisted total → itemized bill →
 * catalog price for its service bucket. Shared by the cashier queue and the
 * receipt-scanner amount validation so a payable never resolves to ₱0.
 */
class PayableAmountResolver
{
    /**
     * Resolve the amount due for a payable type/id pair as used by the
     * cashier queue and receipt validation.
     */
    public static function resolve(string $payableType, int $payableId): float
    {
        return match ($payableType) {
            'service_request' => self::serviceRequestAmount($payableId),
            'service_billing_payment' => (float) (DB::table('service_billing_payment_requests')->where('id', $payableId)->value('amount_due') ?? 0),
            'medical_confinement' => self::confinementAmount($payableId),
            'boarding' => self::boardingAmount($payableId),
            'grooming' => self::tableAmount('groomings', 'grooming', $payableId),
            'appointment' => self::appointmentAmount($payableId),
            default => 0.0,
        };
    }

    private static function confinementAmount(int $id): float
    {
        $row = DB::table('medical_confinements')->where('id', $id)->first();
        if (!$row) {
            return 0.0;
        }

        return (float) ($row->final_amount ?? $row->estimated_cost ?? 0);
    }

    private static function boardingAmount(int $id): float
    {
        $row = DB::table('boardings')->where('id', $id)->first();
        if (!$row) {
            return 0.0;
        }

        $fallback = (float) ($row->total_amount ?? 0);
        if ($fallback <= 0 && is_numeric($row->rate_per_day ?? null)) {
            $fallback = (float) $row->rate_per_day * max(1, (int) ($row->number_of_days ?? 1));
        }

        return self::queueAmount('boarding', $id, null, 'hotel', $fallback);
    }

    private static function appointmentAmount(int $id): float
    {
        $row = DB::table('appointments')->where('id', $id)->first();
        if (!$row) {
            return 0.0;
        }

        $serviceName = $row->service_id
            ? DB::table('services')->where('id', $row->service_id)->value('name')
            : null;
        $servicePrice = $row->service_id
            ? (float) (DB::table('services')->where('id', $row->service_id)->value('price') ?? 0)
            : 0.0;

        return self::queueAmount('veterinary', $id, $serviceName, 'vet', (float) ($row->total_amount ?? $row->balance_due ?? $row->price ?? $servicePrice));
    }

    private static function tableAmount(string $table, string $serviceType, int $id): float
    {
        $row = DB::table($table)->where('id', $id)->first();
        if (!$row) {
            return 0.0;
        }

        return self::queueAmount($serviceType, $id, $row->service ?? null, $serviceType, (float) ($row->total_amount ?? $row->amount ?? $row->base_amount ?? $row->balance_due ?? 0));
    }

    /**
     * Amount for a service_request. The SR itself may carry no price — the
     * authoritative total lives on the linked grooming/boarding/appointment
     * record created at approval, in its itemized bill, or in the catalog.
     */
    private static function serviceRequestAmount(int $id): float
    {
        $sr = DB::table('service_requests')->where('id', $id)->first();
        if (!$sr) {
            return 0.0;
        }

        foreach (['total_amount', 'price', 'service_price'] as $column) {
            $value = $sr->{$column} ?? null;
            if (is_numeric($value) && (float) $value > 0) {
                return (float) $value;
            }
        }

        $bucket = ServiceCatalog::bucketFor($sr->request_type ?? $sr->service_type ?? null);

        [$table, $serviceType] = match ($bucket) {
            'grooming' => ['groomings', 'grooming'],
            'hotel' => ['boardings', 'boarding'],
            'vet' => ['appointments', 'veterinary'],
            default => [null, null],
        };

        if ($table && Schema::hasColumn($table, 'service_request_id')) {
            $linked = DB::table($table)->where('service_request_id', $id)->first();
            if ($linked) {
                $fallback = (float) ($linked->total_amount ?? $linked->amount ?? $linked->price ?? 0);
                $amount = self::queueAmount(
                    $serviceType,
                    (int) $linked->id,
                    $sr->service_name ?? $linked->service ?? null,
                    $bucket,
                    $fallback
                );
                if ($amount > 0) {
                    return $amount;
                }
            }
        }

        $amount = ServiceCatalog::priceFor($sr->service_name ?? null, $bucket);

        // Preserve the legacy estimate floor for request types with no
        // catalog representation at all — never surface ₱0.
        return $amount > 0 ? $amount : 500.0;
    }

    private static function queueAmount(string $serviceType, int $serviceId, ?string $serviceName, string $bucket, float $fallback): float
    {
        if ($fallback > 0) {
            return $fallback;
        }

        $billed = (float) DB::table('service_item_usages')
            ->where('service_type', $serviceType)
            ->where('service_id', $serviceId)
            ->where('is_billable', true)
            ->sum('total_price');

        if ($billed > 0) {
            return $billed;
        }

        return ServiceCatalog::priceFor($serviceName, $bucket);
    }
}
