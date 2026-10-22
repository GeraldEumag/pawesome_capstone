<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PaymentReferenceGuard
{
    private const REFERENCE_COLUMNS = [
        'payments' => ['reference_number', 'payment_reference'],
        'service_requests' => ['reference_number', 'payment_reference'],
        'boardings' => ['reference_number', 'payment_reference'],
        'groomings' => ['reference_number', 'payment_reference'],
        'appointments' => ['reference_number', 'payment_reference'],
        'medical_confinements' => ['reference_number', 'payment_reference'],
        'customer_orders' => ['reference_number', 'payment_reference'],
        'payment_settlements' => ['reference_number'],
        'service_billing_payment_requests' => ['payment_reference', 'reference_number'],
    ];

    public static function withUniqueReference(string $reference, array $exclude, callable $onDuplicate, callable $callback): mixed
    {
        $normalized = mb_strtoupper(trim($reference), 'UTF-8');
        $lockName = 'payref:' . substr(hash('sha256', $normalized), 0, 57);
        $connection = DB::connection();

        if ($connection->getDriverName() !== 'mysql') {
            return response()->json(['message' => 'Payment reference checks require the configured MySQL database.'], 503);
        }

        $lock = $connection->selectOne('SELECT GET_LOCK(?, 10) AS acquired', [$lockName]);
        if ((int) ($lock->acquired ?? 0) !== 1) {
            return response()->json(['message' => 'Payment reference is being processed. Please retry shortly.'], 503);
        }

        try {
            return self::exists($normalized, $exclude)
                ? $onDuplicate()
                : $callback();
        } finally {
            $connection->selectOne('SELECT RELEASE_LOCK(?) AS released', [$lockName]);
        }
    }

    private static function exists(string $reference, array $exclude): bool
    {
        foreach (self::REFERENCE_COLUMNS as $table => $columns) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            foreach ($columns as $column) {
                if (!Schema::hasColumn($table, $column)) {
                    continue;
                }

                $query = DB::table($table)
                    ->whereNotNull($column)
                    ->whereRaw("UPPER(TRIM({$column})) = ?", [$reference]);

                $ids = $exclude['ids'][$table] ?? [];
                if ($ids) {
                    $query->whereNotIn('id', $ids);
                }

                $serviceRequestId = $exclude['service_request_id'] ?? null;
                if ($serviceRequestId && Schema::hasColumn($table, 'service_request_id')) {
                    $query->where(function ($related) use ($serviceRequestId) {
                        $related->whereNull('service_request_id')
                            ->orWhere('service_request_id', '!=', $serviceRequestId);
                    });
                }

                $settlements = $table === 'payment_settlements' ? ($exclude['settlements'] ?? []) : [];
                if ($settlements && Schema::hasColumn($table, 'settleable_type') && Schema::hasColumn($table, 'settleable_id')) {
                    $query->whereNot(function ($related) use ($settlements) {
                        foreach ($settlements as $index => $settlement) {
                            $method = $index === 0 ? 'where' : 'orWhere';
                            $related->{$method}(function ($pair) use ($settlement) {
                                $pair->where('settleable_type', $settlement['type'])
                                    ->where('settleable_id', $settlement['id']);
                            });
                        }
                    });
                }

                if ($query->exists()) {
                    return true;
                }
            }
        }

        return false;
    }
}
