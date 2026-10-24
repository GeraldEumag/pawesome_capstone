<?php

namespace App\Jobs;

use App\Models\PaymentReceipt;
use App\Services\Receipts\ReceiptService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Runs the receipt-scanning pipeline for one payment_receipts row. Retries
 * up to 3 times with increasing delay; after the final failure the receipt
 * is marked 'failed' and the cashier continues with manual entry — a broken
 * reader never blocks payment.
 */
class ProcessReceiptScan implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 3;

    /** Reader calls can take several seconds (vision API / OCR binary). */
    public $timeout = 120;

    public $backoff = [15, 60, 300];

    public function __construct(public int $receiptId)
    {
        $this->onQueue('receipts');
    }

    public function handle(ReceiptService $service): void
    {
        $service->process($this->receiptId);
    }

    public function failed(Throwable $e): void
    {
        PaymentReceipt::where('id', $this->receiptId)
            ->whereNotIn('status', [PaymentReceipt::STATUS_CONFIRMED, PaymentReceipt::STATUS_REJECTED])
            ->update(['status' => PaymentReceipt::STATUS_FAILED]);

        Log::warning('Receipt scan failed after retries — manual entry applies', [
            'receipt_id' => $this->receiptId,
            'error' => $e->getMessage(),
        ]);
    }
}
