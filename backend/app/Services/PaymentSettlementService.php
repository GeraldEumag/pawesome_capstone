<?php

namespace App\Services;

use App\Models\PaymentSettlement;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;

/**
 * Single writer for the service-side settlement ledger.
 *
 * Every settlement event (cashier verify, items-marked-paid batch) records one
 * immutable header row plus normalized line items, inside the caller's existing
 * transaction. Callers do not open their own transaction around this method —
 * it must join the enclosing business transaction so a settlement can never
 * outlive the payment state it records.
 *
 * Idempotency: the idempotency_key unique constraint collapses retried calls
 * (e.g. a verify retried after a network hiccup) into a single ledger row.
 * Distinct settlement events must carry distinct keys.
 */
class PaymentSettlementService
{
    /**
     * Record a settlement. Returns the settlement row — the pre-existing row
     * when the idempotency key was already recorded.
     *
     * @param array $data Header fields: settleable_type, settleable_id, amount,
     *                    idempotency_key (required); customer_id, user_id,
     *                    payment_method, reference_number, receipt_number,
     *                    verified_by, verified_at, paid_at, currency (optional).
     * @param array $items Line items: description, quantity, unit_price,
     *                     total_price, service_item_usage_id (optional).
     */
    public static function record(array $data, array $items = []): ?PaymentSettlement
    {
        $key = $data['idempotency_key'] ?? null;
        if (empty($key)) {
            throw new \InvalidArgumentException('payment_settlements.idempotency_key is required');
        }

        $existing = PaymentSettlement::where('idempotency_key', $key)->first();
        if ($existing) {
            return $existing;
        }

        try {
            $settlement = PaymentSettlement::create($data);
        } catch (QueryException $e) {
            // Unique-key race: another writer committed the same idempotency
            // key first. Return that row rather than failing the payment.
            if (!self::isDuplicateKey($e)) {
                throw $e;
            }
            $settlement = PaymentSettlement::where('idempotency_key', $key)->first();
            if (!$settlement) {
                throw $e;
            }
            return $settlement;
        }

        foreach ($items as $item) {
            $settlement->items()->create([
                'service_item_usage_id' => $item['service_item_usage_id'] ?? null,
                'description' => $item['description'],
                'quantity' => $item['quantity'] ?? 1,
                'unit_price' => $item['unit_price'],
                'total_price' => $item['total_price'],
            ]);
        }

        return $settlement;
    }

    /**
     * Void a settlement — append-only correction path; the row is never
     * deleted or rewritten, only transitioned to a terminal correction status.
     */
    public static function void(PaymentSettlement $settlement, int $voidedBy, string $reason): PaymentSettlement
    {
        // Refresh so DB-side defaults (e.g. status='paid') are visible before
        // the guard — a freshly created in-memory model does not carry them.
        $settlement->refresh();

        if ($settlement->status !== PaymentSettlement::STATUS_PAID) {
            return $settlement;
        }

        $settlement->update([
            'status' => PaymentSettlement::STATUS_VOIDED,
            'voided_at' => now(),
            'voided_by' => $voidedBy,
            'void_reason' => $reason,
        ]);

        return $settlement;
    }

    private static function isDuplicateKey(QueryException $e): bool
    {
        // MySQL 1062 / SQLSTATE 23000.
        return ($e->errorInfo[1] ?? null) === 1062
            || ($e->errorInfo[0] ?? null) === '23000';
    }
}
