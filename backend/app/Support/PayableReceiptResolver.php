<?php

namespace App\Support;

use App\Models\ReceiptValidation;
use Illuminate\Support\Facades\DB;

/**
 * Resolves the latest scanned payment_receipt for each payable row in the
 * cashier queue. Appointment rows carry no proof columns — their receipt is
 * attached to the linked service_request, resolved via service_request_id.
 */
class PayableReceiptResolver
{
    /**
     * Queue row types that store their proof on the linked service_request.
     */
    private const LINKED_VIA_SERVICE_REQUEST = ['appointment'];

    /**
     * @param  array<int, array{type:string, id:int, linked_sr_id:?int}>  $payables
     * @return array<string, array> map of "{type}-{id}" → receipt summary (null-safe)
     */
    public static function summariesFor(array $payables): array
    {
        $pairs = [];
        foreach ($payables as $p) {
            $type = $p['type'] ?? null;
            $id = (int) ($p['id'] ?? 0);
            if (!$type || !$id) {
                continue;
            }

            // Appointments expose their proof via the originating service_request.
            if (in_array($type, self::LINKED_VIA_SERVICE_REQUEST, true) && ($p['linked_sr_id'] ?? null)) {
                $pairs[] = ['service_request', (int) $p['linked_sr_id']];
            }
            $pairs[] = [$type, $id];
        }

        if (empty($pairs)) {
            return [];
        }

        $query = DB::table('payment_receipts')->select('id', 'payable_type', 'payable_id', 'status', 'provider', 'submitted_reference', 'created_at');
        $query->where(function ($outer) use ($pairs) {
            foreach ($pairs as $pair) {
                $outer->orWhere(fn ($q) => $q->where('payable_type', $pair[0])->where('payable_id', $pair[1]));
            }
        });
        $receipts = $query->orderByDesc('id')->get();

        // Latest receipt per payable key.
        $latestByKey = [];
        $receiptIds = [];
        foreach ($receipts as $receipt) {
            $key = "{$receipt->payable_type}-{$receipt->payable_id}";
            if (!isset($latestByKey[$key])) {
                $latestByKey[$key] = $receipt;
                $receiptIds[] = $receipt->id;
            }
        }

        if (empty($receiptIds)) {
            return [];
        }

        $extractions = DB::table('receipt_extractions')
            ->whereIn('receipt_id', $receiptIds)
            ->orderByDesc('id')
            ->get()
            ->groupBy('receipt_id')
            ->map(fn ($rows) => $rows->first());

        $validations = ReceiptValidation::whereIn('receipt_id', $receiptIds)
            ->get()
            ->groupBy('receipt_id');

        $summaries = [];
        foreach ($latestByKey as $key => $receipt) {
            $extraction = $extractions->get($receipt->id);
            $rules = $validations->get($receipt->id) ?? collect();

            $overall = 'green';
            if ($rules->contains('result', ReceiptValidation::RESULT_BLOCK)) {
                $overall = 'red';
            } elseif ($rules->contains('result', ReceiptValidation::RESULT_WARNING)) {
                $overall = 'amber';
            }

            $summaries[$key] = [
                'receipt_id' => $receipt->id,
                'status' => $receipt->status,
                'provider' => $receipt->provider ?? $extraction?->provider,
                'extracted_reference' => $extraction?->reference_normalized ?? $extraction?->reference_raw,
                'reader' => $extraction?->reader,
                'overall' => $rules->isEmpty() ? null : $overall,
                'warnings' => $rules->where('result', ReceiptValidation::RESULT_WARNING)->count(),
                'blocks' => $rules->where('result', ReceiptValidation::RESULT_BLOCK)->count(),
            ];
        }

        // Re-key appointment rows to their service_request summary.
        $result = [];
        foreach ($payables as $p) {
            $type = $p['type'] ?? null;
            $id = (int) ($p['id'] ?? 0);
            if (!$type || !$id) {
                continue;
            }
            $key = "{$type}-{$id}";
            if (isset($summaries[$key])) {
                $result[$key] = $summaries[$key];
            } elseif (in_array($type, self::LINKED_VIA_SERVICE_REQUEST, true) && ($p['linked_sr_id'] ?? null)) {
                $srKey = 'service_request-' . (int) $p['linked_sr_id'];
                if (isset($summaries[$srKey])) {
                    $result[$key] = $summaries[$srKey];
                }
            }
        }

        return $result;
    }
}
