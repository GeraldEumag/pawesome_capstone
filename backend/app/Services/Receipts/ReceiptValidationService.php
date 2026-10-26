<?php

namespace App\Services\Receipts;

use App\Models\ClinicPaymentAccount;
use App\Models\PaymentReceipt;
use App\Models\ReceiptValidation;
use App\Models\ProviderConfig;
use App\Support\PayableAmountResolver;
use Illuminate\Support\Facades\DB;

/**
 * Runs the business validation rules for a scanned receipt and persists one
 * receipt_validations row per rule (pass|warning|block). The combined
 * outcome decides the cashier's green/amber/red treatment.
 */
class ReceiptValidationService
{
    private const TABLE_FOR_PAYABLE = [
        'service_request' => 'service_requests',
        'boarding' => 'boardings',
        'grooming' => 'groomings',
        'appointment' => 'appointments',
        'medical_confinement' => 'medical_confinements',
        'service_billing_payment' => 'service_billing_payment_requests',
    ];

    /**
     * @param  array  $extraction normalized extraction + 'reference_normalized'
     * @return array{overall: string, results: array<int, array>}
     */
    public function run(PaymentReceipt $receipt, array $extraction, ?ProviderConfig $config): array
    {
        $results = [];

        // 1. Receipt type — image must be a GCash/Maya payment receipt.
        $provider = $extraction['provider'] ?? 'unknown';
        $isReceipt = (bool) ($extraction['is_payment_receipt'] ?? false)
            && in_array($provider, ['gcash', 'maya'], true);
        $results[] = $this->rule(
            'receipt_type',
            $isReceipt,
            $isReceipt ? 'pass' : 'block',
            $isReceipt ? null : 'Not a GCash or Maya payment receipt — use manual entry.'
        );

        // 2. Reference pattern — normalized value matches provider pattern.
        $normalized = $extraction['reference_normalized'] ?? null;
        $matchesPattern = ReceiptNormalizer::matchesProviderPattern($normalized, $config);
        $results[] = $this->rule(
            'reference_pattern',
            $matchesPattern,
            $matchesPattern ? 'pass' : 'warning',
            $matchesPattern ? null : 'Extracted reference does not match the expected provider format — possible misread.'
        );

        // 3. Reference unique — not already confirmed on another payment.
        if ($normalized) {
            $confirmedElsewhere = DB::table('payment_references')
                ->where('provider', $provider)
                ->where('reference_normalized', $normalized)
                ->exists();
            $results[] = $this->rule(
                'reference_unique',
                !$confirmedElsewhere,
                $confirmedElsewhere ? 'block' : 'pass',
                $confirmedElsewhere ? 'This reference number is already confirmed on another payment.' : null
            );

            $pendingElsewhere = $this->pendingReferenceExists($normalized, $receipt);
            $results[] = $this->rule(
                'reference_pending_elsewhere',
                !$pendingElsewhere,
                $pendingElsewhere ? 'warning' : 'pass',
                $pendingElsewhere ? 'This reference was also submitted on another pending payment.' : null
            );
        }

        // 4. Image unique — sha256 already used on a confirmed payment.
        $shaConfirmed = DB::table('payment_receipts')
            ->where('sha256', $receipt->sha256)
            ->where('status', PaymentReceipt::STATUS_CONFIRMED)
            ->where('id', '!=', $receipt->id)
            ->exists();
        $results[] = $this->rule(
            'image_unique',
            !$shaConfirmed,
            $shaConfirmed ? 'block' : 'pass',
            $shaConfirmed ? 'This exact image was already used on a confirmed payment.' : null
        );

        // 5. Similar image — perceptual hash close to a previous image.
        $phash = $receipt->phash;
        if ($phash === null) {
            $results[] = $this->rule('similar_image', true, 'pass', 'Perceptual hash not computed (image extension unavailable).');
        } else {
            $maxDistance = (int) config('receipt_scanner.phash_max_distance', 6);
            $similar = DB::table('payment_receipts')
                ->whereNotNull('phash')
                ->where('id', '!=', $receipt->id)
                ->pluck('phash')
                ->contains(fn ($other) => ReceiptImagePreprocessor::hammingDistance($phash, $other) <= $maxDistance);
            $results[] = $this->rule(
                'similar_image',
                !$similar,
                $similar ? 'warning' : 'pass',
                $similar ? 'This image is very similar to a previously uploaded receipt — possible edited copy.' : null
            );
        }

        // 6. Amount — equals the payable balance.
        $due = PayableAmountResolver::resolve($receipt->payable_type, (int) $receipt->payable_id);
        $amount = $extraction['amount'] ?? null;
        if ($amount === null) {
            $results[] = $this->rule('amount', true, 'warning', 'No amount could be read from the receipt.');
        } else {
            $equal = abs((float) $amount - $due) < 0.01;
            $results[] = $this->rule(
                'amount',
                $equal,
                $equal ? 'pass' : 'warning',
                $equal ? null : sprintf('Receipt shows ₱%s but ₱%s is due (%s).', number_format((float) $amount, 2), number_format($due, 2), $amount < $due ? 'underpayment' : 'overpayment')
            );
        }

        // 7. Date — receipt time within the allowed window.
        $paidAt = $extraction['paid_at'] ?? null;
        $payableCreated = $this->payableCreatedAt($receipt->payable_type, (int) $receipt->payable_id);
        $windowDays = (int) config('receipt_scanner.date_window_days', 7);
        $dateOk = true;
        $dateDetail = null;
        if ($paidAt === null) {
            $dateOk = false;
            $dateDetail = 'No payment date could be read from the receipt.';
        } else {
            try {
                $paidAtTs = strtotime((string) $paidAt);
                if ($paidAtTs > time() + 300) {
                    $dateOk = false;
                    $dateDetail = 'Receipt time is in the future.';
                } elseif ($payableCreated && $paidAtTs < strtotime((string) $payableCreated) - 3600) {
                    $dateOk = false;
                    $dateDetail = 'Receipt predates this payment request.';
                } elseif ($payableCreated && $paidAtTs > strtotime((string) $payableCreated) + ($windowDays * 86400)) {
                    $dateOk = false;
                    $dateDetail = "Receipt is outside the {$windowDays}-day acceptance window.";
                }
            } catch (\Throwable) {
                $dateOk = false;
                $dateDetail = 'Unreadable receipt date.';
            }
        }
        $results[] = $this->rule('date', $dateOk, $dateOk ? 'pass' : 'warning', $dateDetail);

        // 8. Recipient — name/last4 vs the clinic's registered account.
        $recipientOk = true;
        $recipientDetail = null;
        $accounts = ClinicPaymentAccount::where('provider', $provider)->where('active', true)->get();
        if ($accounts->isEmpty()) {
            $recipientOk = false;
            $recipientDetail = "No clinic {$provider} account is configured — recipient cannot be checked.";
        } else {
            $recipientName = mb_strtolower((string) ($extraction['recipient_name'] ?? ''));
            $recipientLast4 = (string) ($extraction['recipient_account_last4'] ?? '');
            $matched = $accounts->contains(function ($account) use ($recipientName, $recipientLast4) {
                $nameMatch = $recipientName !== '' && str_contains($recipientName, mb_strtolower($account->account_name));
                $last4Match = $recipientLast4 !== '' && $account->account_last4 && $recipientLast4 === $account->account_last4;
                return $nameMatch || $last4Match;
            });
            $recipientOk = $matched;
            $recipientDetail = $matched ? null : 'Receipt recipient does not match the clinic\'s registered account.';
        }
        $results[] = $this->rule('recipient', $recipientOk, $recipientOk ? 'pass' : 'warning', $recipientDetail);

        // 9. Status — receipt shows a successful payment.
        $statusText = mb_strtolower((string) ($extraction['status_text'] ?? ''));
        $accepted = collect($config?->accepted_status_texts ?? [])->map(fn ($w) => mb_strtolower((string) $w));
        $statusOk = $statusText !== '' && $accepted->contains(fn ($word) => $word !== '' && str_contains($statusText, $word));
        $statusUnreadable = $statusText === '';
        $results[] = $this->rule(
            'status',
            $statusOk,
            $statusOk ? 'pass' : 'warning',
            $statusOk ? null : ($statusUnreadable
                ? 'No payment status could be read from the receipt — check the image for the transaction status.'
                : 'Receipt shows a non-successful status ("' . ($extraction['status_text'] ?? '') . '").')
        );

        // 10. Confidence — reference read confidence thresholds.
        $confidence = $extraction['confidence'] ?? [];
        $refConfidence = $confidence['reference_number'] ?? $confidence['overall'] ?? null;
        $greenThreshold = (float) config('receipt_scanner.thresholds.green', 0.90);
        $reviewThreshold = (float) config('receipt_scanner.thresholds.review', 0.70);
        $results[] = $this->rule(
            'confidence',
            $refConfidence !== null && $refConfidence >= $greenThreshold,
            $refConfidence === null || $refConfidence < $reviewThreshold ? 'warning' : ($refConfidence < $greenThreshold ? 'warning' : 'pass'),
            $refConfidence === null
                ? 'Reader reported no reference confidence.'
                : ($refConfidence < $reviewThreshold
                    ? sprintf('Low read confidence (%.0f%%) — verify the reference manually.', $refConfidence * 100)
                    : ($refConfidence < $greenThreshold ? sprintf('Reference confidence %.0f%% — check against the receipt.', $refConfidence * 100) : null))
        );

        // 11. Image quality.
        $quality = $extraction['image_quality'] ?? null;
        $results[] = $this->rule(
            'image_quality',
            $quality !== 'poor',
            $quality === 'poor' ? 'warning' : 'pass',
            $quality === 'poor' ? 'Image quality is poor — consider asking the customer for a clearer image.' : null
        );

        // 12. Typed-vs-extracted reference agreement.
        if ($receipt->submitted_reference && $normalized) {
            $submitted = ReceiptNormalizer::normalize($receipt->submitted_reference, $config);
            $same = $submitted === $normalized;
            $results[] = $this->rule(
                'reference_agreement',
                $same,
                $same ? 'pass' : 'warning',
                $same ? null : "Customer-typed reference ({$receipt->submitted_reference}) differs from the scanned reference."
            );
        }

        // Persist one row per rule.
        ReceiptValidation::where('receipt_id', $receipt->id)->delete();
        foreach ($results as $result) {
            ReceiptValidation::create([
                'receipt_id' => $receipt->id,
                'rule' => $result['rule'],
                'result' => $result['result'],
                'detail' => $result['detail'],
            ]);
        }

        $overall = 'green';
        if (collect($results)->contains('result', 'block')) {
            $overall = 'red';
        } elseif (collect($results)->contains('result', 'warning')) {
            $overall = 'amber';
        }

        return ['overall' => $overall, 'results' => $results];
    }

    private function rule(string $rule, bool $passed, string $result, ?string $detail): array
    {
        return ['rule' => $rule, 'result' => $passed ? 'pass' : $result, 'detail' => $detail];
    }

    /**
     * A pending typed/scanned reference on another open payable — cross-table
     * check mirroring PaymentReferenceGuard's column map.
     */
    private function pendingReferenceExists(string $normalized, PaymentReceipt $receipt): bool
    {
        $referenceColumns = [
            'payments' => ['reference_number', 'payment_reference'],
            'service_requests' => ['reference_number', 'payment_reference'],
            'boardings' => ['reference_number', 'payment_reference'],
            'groomings' => ['reference_number', 'payment_reference'],
            'appointments' => ['reference_number', 'payment_reference'],
            'medical_confinements' => ['reference_number', 'payment_reference'],
            'service_billing_payment_requests' => ['payment_reference', 'reference_number'],
        ];

        foreach ($referenceColumns as $table => $columns) {
            foreach ($columns as $column) {
                if (!\Illuminate\Support\Facades\Schema::hasColumn($table, $column)) {
                    continue;
                }

                $query = DB::table($table)
                    ->whereNotNull($column)
                    ->whereRaw("UPPER(TRIM({$column})) = ?", [$normalized]);

                // Exclude this receipt's own payable row.
                $ownTable = self::TABLE_FOR_PAYABLE[$receipt->payable_type] ?? null;
                if ($table === $ownTable) {
                    $query->where('id', '!=', $receipt->payable_id);
                }

                $statusColumn = $table === 'service_billing_payment_requests' ? 'status' : 'payment_status';
                if (\Illuminate\Support\Facades\Schema::hasColumn($table, $statusColumn)) {
                    $query->whereIn($statusColumn, $statusColumn === 'status'
                        ? ['awaiting_cashier', 'pending_verification']
                        : ['pending']);
                }

                if ($query->exists()) {
                    return true;
                }
            }
        }

        return false;
    }

    private function payableCreatedAt(string $payableType, int $payableId): ?string
    {
        $table = self::TABLE_FOR_PAYABLE[$payableType] ?? null;
        if (!$table) {
            return null;
        }

        return DB::table($table)->where('id', $payableId)->value('created_at');
    }
}
