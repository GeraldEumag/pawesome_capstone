<?php

namespace App\Services\Receipts;

use App\Services\Receipts\Contracts\ReceiptReaderInterface;

/**
 * Resolves the configured reader chain into ordered reader instances.
 * Entries are driver names ('vision', 'ocr') or FQCNs (used by tests to
 * inject fakes). Unavailable readers are skipped, not fatal.
 */
class ReceiptReaderChain
{
    private const DRIVERS = [
        'vision' => GeminiVisionReader::class,
        'ocr' => LocalOcrReader::class,
    ];

    /**
     * @return array<int, ReceiptReaderInterface>
     */
    public function readers(): array
    {
        $readers = [];
        foreach ((array) config('receipt_scanner.chain', ['vision', 'ocr']) as $entry) {
            $class = self::DRIVERS[$entry] ?? (is_string($entry) && class_exists($entry) ? $entry : null);
            if (!$class) {
                continue;
            }

            $reader = app($class);
            if ($reader instanceof ReceiptReaderInterface) {
                $readers[] = $reader;
            }
        }

        return $readers;
    }
}
