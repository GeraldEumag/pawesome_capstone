<?php

namespace App\Services\Receipts;

use App\Services\Receipts\Contracts\ReceiptReaderInterface;

/**
 * Resolves the configured reader chain into ordered reader instances.
 * Entries are driver names or FQCNs (used by tests to inject fakes).
 * Unavailable readers are skipped, not fatal.
 *
 * Drivers: 'vision'/'openrouter' — OpenRouter (free models only);
 * 'gemini' — Google Gemini; 'ocr' — local Tesseract/pdftotext.
 * Example chains: 'vision,ocr' (default), 'gemini,ocr' (Gemini direct),
 * 'vision,gemini,ocr' (OpenRouter first, Gemini backup, then local).
 */
class ReceiptReaderChain
{
    private const DRIVERS = [
        'vision' => OpenRouterVisionReader::class,
        'openrouter' => OpenRouterVisionReader::class,
        'gemini' => GeminiVisionReader::class,
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
