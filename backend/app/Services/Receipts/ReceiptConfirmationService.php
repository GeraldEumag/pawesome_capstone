<?php

namespace App\Services\Receipts;

use App\Jobs\ProcessReceiptScan;
use App\Models\PaymentReceipt;
use App\Models\ReceiptCorrection;
use App\Models\ReceiptValidation;
use App\Services\PaymentVerificationService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Cashier actions on a scanned receipt. Confirm runs inside the existing
 * payment-verification transaction and inserts into payment_references —
 * the unique(provider, reference_normalized) key is the final safeguard when
 * two cashiers confirm the same reference at once.
 */
class ReceiptConfirmationService
{
    /**
     * payable_type → PaymentVerificationService type string (same values,
     * but keep the map explicit so a typo can't route to the wrong table).
     */
    private const VERIFY_TYPES = [
        'service_request' => 'service_request',
        'boarding' => 'boarding',
        'grooming' => 'grooming',
        'appointment' => 'appointment',
        'medical_confinement' => 'medical_confinement',
        'service_billing_payment' => 'service_billing_payment',
    ];

    public function confirm(PaymentReceipt $receipt, Request $request): array
    {
        $blocks = ReceiptValidation::where('receipt_id', $receipt->id)
            ->where('result', ReceiptValidation::RESULT_BLOCK)
            ->pluck('detail')
            ->filter()
            ->values();

        if ($blocks->isNotEmpty()) {
            return [
                'success' => false,
                'message' => 'This receipt has blocking issues and cannot be confirmed: ' . $blocks->implode(' '),
                'status' => 422,
            ];
        }

        $verifyType = self::VERIFY_TYPES[$receipt->payable_type] ?? null;
        if (!$verifyType) {
            return ['success' => false, 'message' => 'Unsupported receipt payable type.', 'status' => 422];
        }

        try {
            return DB::transaction(function () use ($receipt, $request, $verifyType) {
                $result = (new PaymentVerificationService())->verify($verifyType, (int) $receipt->payable_id, $request);
                if (($result['success'] ?? false) !== true) {
                    return $result;
                }

                $confirmedReference = trim((string) $request->input('reference_number', ''));
                $latest = $receipt->extractions()->orderByDesc('id')->first();

                // Persist the unique reference — duplicate insert rolls back the
                // whole verify transaction.
                if ($confirmedReference !== '') {
                    $provider = $this->providerFor($receipt);
                    DB::table('payment_references')->insert([
                        'provider' => $provider,
                        'reference_normalized' => mb_strtoupper(preg_replace('/[\s\-]+/', '', $confirmedReference) ?? '', 'UTF-8'),
                        'payable_type' => $receipt->payable_type,
                        'payable_id' => $receipt->payable_id,
                        'receipt_id' => $receipt->id,
                        'confirmed_by' => Auth::id(),
                        'confirmed_at' => now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    // Cashier edits feed the accuracy report.
                    if ($latest && $latest->reference_normalized
                        && $latest->reference_normalized !== mb_strtoupper(preg_replace('/[\s\-]+/', '', $confirmedReference) ?? '', 'UTF-8')) {
                        ReceiptCorrection::create([
                            'receipt_id' => $receipt->id,
                            'field' => 'reference_number',
                            'old_value' => $latest->reference_normalized,
                            'new_value' => $confirmedReference,
                            'corrected_by' => Auth::id(),
                        ]);
                    }
                }

                $receipt->update(['status' => PaymentReceipt::STATUS_CONFIRMED]);

                return $result;
            });
        } catch (UniqueConstraintViolationException $e) {
            return [
                'success' => false,
                'message' => 'This reference number is already confirmed on another payment.',
                'status' => 422,
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'message' => 'Payment confirmation failed: ' . $e->getMessage(),
                'status' => 500,
            ];
        }
    }

    public function reject(PaymentReceipt $receipt, Request $request): array
    {
        $verifyType = self::VERIFY_TYPES[$receipt->payable_type] ?? null;
        if (!$verifyType) {
            return ['success' => false, 'message' => 'Unsupported receipt payable type.', 'status' => 422];
        }

        $result = (new PaymentVerificationService())->reject($verifyType, (int) $receipt->payable_id, $request);

        if (($result['success'] ?? false) === true) {
            $receipt->update([
                'status' => PaymentReceipt::STATUS_REJECTED,
                'reject_reason' => $request->input('rejection_reason'),
            ]);
        }

        return $result;
    }

    public function reread(PaymentReceipt $receipt): array
    {
        if (in_array($receipt->status, [PaymentReceipt::STATUS_CONFIRMED, PaymentReceipt::STATUS_REJECTED], true)) {
            return ['success' => false, 'message' => 'Only an unconfirmed receipt can be re-read.', 'status' => 422];
        }

        $receipt->update(['status' => PaymentReceipt::STATUS_UPLOADED]);
        ReceiptService::dispatchScan($receipt->id);

        return ['success' => true, 'message' => 'Receipt re-read queued.'];
    }

    /**
     * The wallet provider this payment was collected through — the payable's
     * recorded method wins over the reader's guess.
     */
    private function providerFor(PaymentReceipt $receipt): string
    {
        $table = ReceiptService::PAYABLE_TABLES[$receipt->payable_type] ?? null;
        $method = $table && Schema::hasColumn($table, 'payment_method')
            ? strtolower((string) (DB::table($table)->where('id', $receipt->payable_id)->value('payment_method') ?? ''))
            : '';

        return match ($method) {
            'gcash' => 'gcash',
            'maya', 'paymaya' => 'maya',
            default => in_array($receipt->provider, ['gcash', 'maya'], true) ? $receipt->provider : 'unknown',
        };
    }
}
