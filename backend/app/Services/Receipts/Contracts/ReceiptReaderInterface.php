<?php

namespace App\Services\Receipts\Contracts;

use App\Services\Receipts\ReceiptReaderException;

interface ReceiptReaderInterface
{
    /**
     * Short reader name persisted on receipt_extractions.reader.
     */
    public function name(): string;

    /**
     * Version string persisted on receipt_extractions.reader_version.
     */
    public function version(): string;

    /**
     * Whether this reader can run in the current environment (API key set,
     * binary present). Checked before the chain attempts it.
     */
    public function isAvailable(): bool;

    /**
     * Read a receipt file and return the fixed extraction schema:
     *   is_payment_receipt (bool), provider, transaction_type,
     *   reference_number, amount, paid_at, status_text, recipient_name,
     *   recipient_account_last4, sender_name, image_quality,
     *   confidence (array incl. per-field + 'overall'), raw (any extra data).
     *
     * @throws ReceiptReaderException on timeout/error — the chain falls through
     */
    public function read(string $absolutePath, string $mime): array;
}
