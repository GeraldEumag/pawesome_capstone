<?php

namespace App\Services\Receipts;

use App\Jobs\ProcessReceiptScan;
use App\Models\PaymentReceipt;
use App\Models\ProviderConfig;
use App\Models\ReceiptExtraction;
use App\Services\FileStorageService;
use App\Services\ServiceCatalog;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Orchestrates the receipt-scanning pipeline: attach at upload → queue →
 * preprocess → reader chain (vision → ocr) → provider detect → normalize →
 * business validations → auto-fill the payable's payment_reference.
 *
 * Disabled via RECEIPT_SCANNER_ENABLED=false → attach() is a transparent
 * passthrough to FileStorageService and the manual flow is untouched.
 */
class ReceiptService
{
    /** payable_type → database table. */
    public const PAYABLE_TABLES = [
        'service_request' => 'service_requests',
        'boarding' => 'boardings',
        'grooming' => 'groomings',
        'appointment' => 'appointments',
        'medical_confinement' => 'medical_confinements',
        'service_billing_payment' => 'service_billing_payment_requests',
    ];

    /**
     * Store a payment proof and attach a payment_receipts row to the payable,
     * then queue the scan job. Wraps FileStorageService::storeAndPersist so the
     * file + payable update + receipt row commit together.
     *
     * @param  callable(string $path): mixed  $persist  caller's payable update
     * @return mixed the persist callback's result (mirrors storeAndPersist)
     *
     * @throws ValidationException on max-upload cap
     */
    public static function storeAndAttach(
        UploadedFile $file,
        string $directory,
        string $payableType,
        int $payableId,
        callable $persist,
        array $options = []
    ): mixed {
        if (!config('receipt_scanner.enabled', true) || !isset(self::PAYABLE_TABLES[$payableType])) {
            return FileStorageService::storeAndPersist($file, $directory, 'private', $persist, deleteOld: false, prefix: $options['prefix'] ?? null);
        }

        $idempotencyKey = $options['idempotency_key'] ?? null;
        if ($idempotencyKey) {
            $existing = PaymentReceipt::where('payable_type', $payableType)
                ->where('payable_id', $payableId)
                ->where('idempotency_key', $idempotencyKey)
                ->first();
            if ($existing) {
                return $persist($existing->disk_path);
            }
        }

        $maxUploads = (int) config('receipt_scanner.max_uploads_per_payable', 5);
        $count = PaymentReceipt::where('payable_type', $payableType)->where('payable_id', $payableId)->count();
        if ($count >= $maxUploads) {
            throw ValidationException::withMessages([
                'payment_proof' => ["This payment already has {$maxUploads} uploaded receipts. Please contact the cashier."],
            ]);
        }

        $contents = file_get_contents($file->getRealPath());
        $sha256 = $contents !== false ? hash('sha256', $contents) : null;
        $phash = $contents !== false
            ? ReceiptImagePreprocessor::dHash($file->getRealPath(), $file->getMimeType() ?? '')
            : null;

        $receiptId = null;
        $result = FileStorageService::storeAndPersist(
            $file,
            $directory,
            'private',
            function (string $path) use ($persist, $payableType, $payableId, $options, $sha256, $phash, $file, $idempotencyKey, &$receiptId) {
                $persistResult = $persist($path);

                $receipt = PaymentReceipt::create([
                    'payable_type' => $payableType,
                    'payable_id' => $payableId,
                    'uploaded_by' => $options['uploaded_by'] ?? null,
                    'disk' => 'private',
                    'disk_path' => $path,
                    'mime' => $file->getMimeType(),
                    'size_bytes' => $file->getSize(),
                    'sha256' => $sha256,
                    'phash' => $phash,
                    'submitted_reference' => $options['submitted_reference'] ?? null,
                    'idempotency_key' => $idempotencyKey,
                    'status' => PaymentReceipt::STATUS_UPLOADED,
                ]);
                $receiptId = $receipt->id;

                return $persistResult;
            },
            deleteOld: false,
            prefix: $options['prefix'] ?? null,
        );

        if ($receiptId) {
            self::dispatchScan($receiptId);
        }

        return $result;
    }

    /**
     * Attach a receipt row to a payable whose proof file is already stored —
     * used when the payable row only comes into existence inside the persist
     * callback (service_billing_payment_requests). Hashes are recomputed from
     * the stored file so the receipt always describes what is on disk.
     * Never throws — scanner bookkeeping must not fail a completed upload.
     */
    public static function attachStoredProof(
        string $payableType,
        int $payableId,
        string $disk,
        string $diskPath,
        array $options = []
    ): ?PaymentReceipt {
        if (!config('receipt_scanner.enabled', true) || !isset(self::PAYABLE_TABLES[$payableType])) {
            return null;
        }

        try {
            $idempotencyKey = $options['idempotency_key'] ?? null;
            if ($idempotencyKey && PaymentReceipt::where('payable_type', $payableType)
                ->where('payable_id', $payableId)
                ->where('idempotency_key', $idempotencyKey)
                ->exists()) {
                return null;
            }

            $maxUploads = (int) config('receipt_scanner.max_uploads_per_payable', 5);
            if (PaymentReceipt::where('payable_type', $payableType)->where('payable_id', $payableId)->count() >= $maxUploads) {
                return null;
            }

            $absolutePath = Storage::disk($disk)->path($diskPath);
            $contents = is_file($absolutePath) ? file_get_contents($absolutePath) : false;
            $mime = is_file($absolutePath) ? (mime_content_type($absolutePath) ?: null) : null;

            $receipt = PaymentReceipt::create([
                'payable_type' => $payableType,
                'payable_id' => $payableId,
                'uploaded_by' => $options['uploaded_by'] ?? null,
                'disk' => $disk,
                'disk_path' => $diskPath,
                'mime' => $mime,
                'size_bytes' => $contents !== false ? strlen($contents) : null,
                'sha256' => $contents !== false ? hash('sha256', $contents) : null,
                'phash' => is_file($absolutePath) && $mime
                    ? ReceiptImagePreprocessor::dHash($absolutePath, $mime)
                    : null,
                'submitted_reference' => $options['submitted_reference'] ?? null,
                'idempotency_key' => $idempotencyKey,
                'status' => PaymentReceipt::STATUS_UPLOADED,
            ]);

            self::dispatchScan($receipt->id);

            return $receipt;
        } catch (\Throwable $e) {
            Log::warning('Receipt attach failed — payment proof upload unaffected', [
                'payable_type' => $payableType,
                'payable_id' => $payableId,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Dispatch the scan job. Under QUEUE_CONNECTION=sync the job runs inline
     * during the upload request — a reader failure must never turn a
     * successful upload into a 500, so the call is guarded.
     */
    public static function dispatchScan(int $receiptId): void
    {
        try {
            ProcessReceiptScan::dispatch($receiptId)->onQueue('receipts')->afterCommit();
        } catch (\Throwable $e) {
            Log::warning('Receipt scan dispatch/run failed — receipt left for manual review', [
                'receipt_id' => $receiptId,
                'error' => $e->getMessage(),
            ]);
            PaymentReceipt::where('id', $receiptId)
                ->whereNotIn('status', [PaymentReceipt::STATUS_CONFIRMED, PaymentReceipt::STATUS_REJECTED])
                ->update(['status' => PaymentReceipt::STATUS_FAILED]);
        }
    }

    /**
     * Latest receipt for a payable, if any.
     */
    public static function latestFor(string $payableType, int $payableId): ?PaymentReceipt
    {
        return PaymentReceipt::where('payable_type', $payableType)
            ->where('payable_id', $payableId)
            ->orderByDesc('id')
            ->first();
    }

    /**
     * Run the scan pipeline for a receipt. Called by ProcessReceiptScan.
     *
     * @throws ReceiptReaderException when no reader in the chain can read it —
     *         the job retries; after the final attempt the receipt is 'failed'.
     */
    public function process(int $receiptId): void
    {
        $receipt = PaymentReceipt::findOrFail($receiptId);
        if (in_array($receipt->status, [PaymentReceipt::STATUS_CONFIRMED, PaymentReceipt::STATUS_REJECTED], true)) {
            return;
        }

        $receipt->update(['status' => PaymentReceipt::STATUS_PROCESSING]);

        $absolutePath = Storage::disk($receipt->disk)->path($receipt->disk_path);
        if (!is_file($absolutePath)) {
            $receipt->update(['status' => PaymentReceipt::STATUS_FAILED]);
            throw new ReceiptReaderException('Receipt file missing from storage.');
        }

        // Early duplicate check — identical image already confirmed elsewhere.
        $confirmedDupe = PaymentReceipt::where('sha256', $receipt->sha256)
            ->where('status', PaymentReceipt::STATUS_CONFIRMED)
            ->where('id', '!=', $receipt->id)
            ->exists();
        if ($confirmedDupe) {
            $this->persistBlockOnly($receipt, 'image_unique', 'This exact image was already used on a confirmed payment.');
            $receipt->update(['status' => PaymentReceipt::STATUS_NEEDS_REVIEW]);
            return;
        }

        $workingPath = ReceiptImagePreprocessor::prepare($absolutePath, (string) $receipt->mime);

        try {
            $extraction = $this->readWithChain($receipt, $workingPath, (string) $receipt->mime);
        } finally {
            ReceiptImagePreprocessor::cleanup($workingPath, $absolutePath);
        }

        $provider = $extraction['provider'] ?? 'unknown';
        $config = in_array($provider, ['gcash', 'maya'], true)
            ? ProviderConfig::where('provider', $provider)->where('active', true)->first()
            : null;

        $normalized = ReceiptNormalizer::normalize($extraction['reference_number'] ?? null, $config);

        // Persist the winning extraction row (attempt rows were written during reads).
        $extractionRow = ReceiptExtraction::create([
            'receipt_id' => $receipt->id,
            'reader' => $extraction['_reader'],
            'reader_version' => $extraction['_reader_version'],
            'provider' => $provider,
            'transaction_type' => $extraction['transaction_type'] ?? null,
            'reference_raw' => $extraction['reference_number'] ?? null,
            'reference_normalized' => $normalized,
            'amount' => $extraction['amount'] ?? null,
            'paid_at' => $this->parsePaidAt($extraction['paid_at'] ?? null),
            'status_text' => $extraction['status_text'] ?? null,
            'recipient_name' => $extraction['recipient_name'] ?? null,
            'recipient_last4' => $extraction['recipient_account_last4'] ?? null,
            'sender_name' => $extraction['sender_name'] ?? null,
            'image_quality' => $extraction['image_quality'] ?? null,
            'confidence_json' => $extraction['confidence'] ?? null,
            'raw_response_json' => $extraction['raw'] ?? null,
            'latency_ms' => $extraction['_latency_ms'] ?? null,
        ]);

        $extraction['reference_normalized'] = $normalized;
        $outcome = app(ReceiptValidationService::class)->run($receipt->fresh(), $extraction, $config);

        // Auto-fill the payable's reference with the normalized scan value.
        if ($normalized) {
            $this->autofillReference($receipt, $normalized);
        }

        // Conditional write: if a cashier confirmed or rejected this receipt
        // while the scan was in flight, their decision must win — never
        // downgrade a reviewed receipt back to a scan outcome.
        $newStatus = $outcome['overall'] === 'green'
            ? PaymentReceipt::STATUS_READY
            : PaymentReceipt::STATUS_NEEDS_REVIEW;

        PaymentReceipt::where('id', $receipt->id)
            ->whereNotIn('status', [PaymentReceipt::STATUS_CONFIRMED, PaymentReceipt::STATUS_REJECTED])
            ->update([
                'provider' => $provider,
                'status' => $newStatus,
            ]);
    }

    /**
     * Try each configured reader in order; first success wins. Failed attempts
     * are recorded as extraction rows so the fallback is auditable.
     */
    private function readWithChain(PaymentReceipt $receipt, string $path, string $mime): array
    {
        $errors = [];

        foreach (app(ReceiptReaderChain::class)->readers() as $reader) {
            if (!$reader->isAvailable()) {
                $errors[] = "{$reader->name()}: unavailable";
                continue;
            }

            $started = microtime(true);
            try {
                $extraction = $reader->read($path, $mime);
                $extraction['_reader'] = $reader->name();
                $extraction['_reader_version'] = $reader->version();
                $extraction['_latency_ms'] = (int) round((microtime(true) - $started) * 1000);
                return $extraction;
            } catch (\Throwable $e) {
                $latency = (int) round((microtime(true) - $started) * 1000);
                $errors[] = "{$reader->name()}: {$e->getMessage()}";

                ReceiptExtraction::create([
                    'receipt_id' => $receipt->id,
                    'reader' => $reader->name(),
                    'reader_version' => $reader->version(),
                    'latency_ms' => $latency,
                    'raw_response_json' => ['error' => $e->getMessage()],
                ]);
            }
        }

        throw new ReceiptReaderException('All receipt readers failed — ' . implode('; ', $errors));
    }

    /**
     * Write the normalized reference onto the payable row and mirror it to the
     * linked service_request / service records exactly like the upload-time
     * syncs do, so every payable view shows one consistent reference.
     */
    private function autofillReference(PaymentReceipt $receipt, string $normalized): void
    {
        $table = self::PAYABLE_TABLES[$receipt->payable_type] ?? null;
        if (!$table || !Schema::hasColumn($table, 'payment_reference')) {
            return;
        }

        $updates = ['payment_reference' => $normalized];
        if (Schema::hasColumn($table, 'updated_at')) {
            $updates['updated_at'] = now();
        }

        DB::table($table)->where('id', $receipt->payable_id)
            ->where('payment_status', '!=', 'paid')
            ->update($updates);

        $record = DB::table($table)->where('id', $receipt->payable_id)->first();
        if (!$record) {
            return;
        }

        // Mirror onto the linked row so both queue copies agree.
        if ($receipt->payable_type === 'service_request') {
            $linkedTable = match (ServiceCatalog::bucketFor($record->request_type ?? $record->service_type ?? null)) {
                'grooming' => 'groomings',
                'hotel' => 'boardings',
                'vet' => 'appointments',
                default => null,
            };
            if ($linkedTable && Schema::hasColumn($linkedTable, 'payment_reference')) {
                DB::table($linkedTable)
                    ->where('service_request_id', $receipt->payable_id)
                    ->where('payment_status', '!=', 'paid')
                    ->update(['payment_reference' => $normalized]);
            }
        } elseif (in_array($receipt->payable_type, ['boarding', 'grooming'], true)
            && ($record->service_request_id ?? null)) {
            DB::table('service_requests')
                ->where('id', $record->service_request_id)
                ->where('payment_status', '!=', 'paid')
                ->update(['payment_reference' => $normalized]);
        }
    }

    private function persistBlockOnly(PaymentReceipt $receipt, string $rule, string $detail): void
    {
        \App\Models\ReceiptValidation::where('receipt_id', $receipt->id)->delete();
        \App\Models\ReceiptValidation::create([
            'receipt_id' => $receipt->id,
            'rule' => $rule,
            'result' => \App\Models\ReceiptValidation::RESULT_BLOCK,
            'detail' => $detail,
        ]);
    }

    private function parsePaidAt(?string $value): ?string
    {
        if (!$value) {
            return null;
        }

        $ts = strtotime($value);
        return $ts === false ? null : date('Y-m-d H:i:s', $ts);
    }
}
