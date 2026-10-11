<?php

namespace App\Support;

use App\Models\PaymentSettlement;

/**
 * Authoritative receipt figures shared by every receipt endpoint.
 *
 * Prices in this system are VAT-inclusive (12%): the VAT amount is extracted
 * from the gross total, never added on top. Frontends must render these
 * values as-is rather than recomputing totals client-side.
 *
 * Tax note: the 12% VAT-inclusive treatment is the approved business
 * assumption — confirm actual tax applicability with the business/accountant.
 */
final class ReceiptBreakdown
{
    public const VAT_RATE = 0.12;

    /**
     * Build the financial block for a receipt.
     *
     * @param iterable $payments Payment rows (arrays or models) with at least
     *                           `amount`; method/reference/receipt/paid_at
     *                           are carried through when present.
     * @param iterable $refunds  Voided/refunded settlement rows.
     */
    public static function build(float $grossTotal, iterable $payments = [], float $discount = 0, iterable $refunds = []): array
    {
        $total = round($grossTotal, 2);
        $discount = round(max(0, $discount), 2);

        $paymentList = collect($payments)->map(fn ($p) => [
            'method' => data_get($p, 'method') ?? data_get($p, 'payment_method'),
            'amount' => round((float) (data_get($p, 'amount') ?? 0), 2),
            'reference_number' => data_get($p, 'reference_number'),
            'receipt_number' => data_get($p, 'receipt_number'),
            'paid_at' => data_get($p, 'paid_at'),
            'status' => data_get($p, 'status') ?? PaymentSettlement::STATUS_PAID,
        ])->values()->all();

        $refundList = collect($refunds)->map(fn ($r) => [
            'amount' => round((float) (data_get($r, 'amount') ?? 0), 2),
            'status' => data_get($r, 'status'),
            'reason' => data_get($r, 'reason') ?? data_get($r, 'void_reason'),
            'receipt_number' => data_get($r, 'receipt_number'),
            'voided_at' => data_get($r, 'voided_at'),
        ])->values()->all();

        $amountPaid = round(collect($paymentList)->sum('amount'), 2);
        $amountRefunded = round(collect($refundList)->sum('amount'), 2);
        $vatAmount = round(($total * self::VAT_RATE) / (1 + self::VAT_RATE), 2);

        return [
            'currency' => 'PHP',
            'vat_inclusive' => true,
            'vat_rate' => self::VAT_RATE,
            'net_amount' => round($total - $vatAmount, 2),
            'vat_amount' => $vatAmount,
            'discount' => $discount,
            'total' => $total,
            'payments' => $paymentList,
            'amount_paid' => $amountPaid,
            'refunds' => $refundList,
            'amount_refunded' => $amountRefunded,
            'balance_due' => round(max(0, $total - $amountPaid), 2),
        ];
    }

    /**
     * Load the payment-settlement ledger for an entity and build the
     * breakdown. When the ledger is empty but the caller knows the record was
     * paid (legacy rows predating settlements), $fallbackPayment synthesizes
     * a single entry from the persisted record fields so the receipt still
     * reflects the payment instead of showing a false full balance.
     */
    public static function forSettleable(
        string $settleableType,
        int $settleableId,
        float $grossTotal,
        float $discount = 0,
        ?array $fallbackPayment = null
    ): array {
        $settlements = PaymentSettlement::where('settleable_type', $settleableType)
            ->where('settleable_id', $settleableId)
            ->orderBy('paid_at')
            ->get();

        $paid = $settlements->where('status', PaymentSettlement::STATUS_PAID)->values();
        $reversed = $settlements->whereIn('status', [
            PaymentSettlement::STATUS_VOIDED,
            PaymentSettlement::STATUS_REFUNDED,
        ])->values();

        if ($paid->isEmpty() && $reversed->isEmpty() && $fallbackPayment !== null) {
            $paid = collect([$fallbackPayment]);
        }

        return self::build($grossTotal, $paid, $discount, $reversed);
    }
}
