<?php

namespace App\Console\Commands;

use App\Models\ProviderConfig;
use App\Services\Receipts\ReceiptNormalizer;
use App\Services\Receipts\ReceiptReaderChain;
use Illuminate\Console\Command;

/**
 * Measures receipt-reader accuracy against a labelled test corpus — the
 * thesis metric the receipt scanner spec calls for.
 *
 * Corpus layout (default: tests/Fixtures/receipts):
 *   gcash-send.png
 *   gcash-send.expected.json   → {"provider":"gcash","reference":"1234567890123","amount":500.00}
 *
 * Usage:
 *   php artisan receipts:evaluate
 *   php artisan receipts:evaluate storage/receipt-corpus
 *   php artisan receipts:evaluate --json
 */
class EvaluateReceiptScanner extends Command
{
    protected $signature = 'receipts:evaluate
        {dir? : Corpus directory (default tests/Fixtures/receipts)}
        {--json : Emit machine-readable JSON}';

    protected $description = 'Evaluate receipt-reader accuracy against a labelled corpus';

    public function handle(ReceiptReaderChain $chain): int
    {
        $dir = rtrim((string) ($this->argument('dir') ?: base_path('tests/Fixtures/receipts')), '/\\');
        if (!is_dir($dir)) {
            $this->error("Corpus directory not found: {$dir}");
            $this->line('Create it with receipt files plus *.expected.json sidecars.');
            return self::FAILURE;
        }

        $readers = $chain->readers();
        $available = array_filter($readers, fn ($r) => $r->isAvailable());
        if (empty($available)) {
            $this->error('No receipt readers are available (check RECEIPT_* env / tesseract install).');
            return self::FAILURE;
        }

        $files = collect(glob("{$dir}/*.{png,jpg,jpeg,webp,pdf}", GLOB_BRACE) ?: [])
            ->filter(fn ($f) => is_file("{$f}.expected.json") || is_file(preg_replace('/\.[^.]+$/', '.expected.json', $f)));

        if ($files->isEmpty()) {
            $this->warn("No labelled files in {$dir} (need a *.expected.json next to each receipt).");
            return self::SUCCESS;
        }

        $rows = [];
        $totals = ['files' => 0, 'provider_ok' => 0, 'reference_ok' => 0, 'reference_found' => 0, 'amount_ok' => 0];

        foreach ($files as $file) {
            $expectedPath = is_file("{$file}.expected.json") ? "{$file}.expected.json" : preg_replace('/\.[^.]+$/', '.expected.json', $file);
            $expected = json_decode((string) file_get_contents($expectedPath), true) ?: [];
            $mime = mime_content_type($file) ?: 'application/octet-stream';

            $extraction = null;
            $readerUsed = null;
            foreach ($available as $reader) {
                try {
                    $extraction = $reader->read($file, $mime);
                    $readerUsed = $reader->name();
                    break;
                } catch (\Throwable) {
                    continue;
                }
            }

            $config = isset($expected['provider'])
                ? ProviderConfig::where('provider', $expected['provider'])->where('active', true)->first()
                : null;
            $normalized = ReceiptNormalizer::normalize($extraction['reference_number'] ?? null, $config);

            $providerOk = isset($expected['provider'])
                ? (($extraction['provider'] ?? null) === $expected['provider'])
                : null;
            $referenceOk = isset($expected['reference'])
                ? $normalized === ReceiptNormalizer::normalize($expected['reference'], $config)
                : null;
            $amountOk = isset($expected['amount'])
                ? abs((float) ($extraction['amount'] ?? 0) - (float) $expected['amount']) < 0.01
                : null;

            $totals['files']++;
            if ($providerOk) $totals['provider_ok']++;
            if ($referenceOk) $totals['reference_ok']++;
            if ($normalized !== null) $totals['reference_found']++;
            if ($amountOk) $totals['amount_ok']++;

            $rows[] = [
                'file' => basename($file),
                'reader' => $readerUsed ?? 'none',
                'provider' => ($extraction['provider'] ?? '—') . ($providerOk === false ? ' ✗' : ''),
                'reference' => ($normalized ?: '—') . ($referenceOk === false ? ' ✗' : ''),
                'amount' => isset($extraction['amount']) ? number_format((float) $extraction['amount'], 2) : '—',
            ];
        }

        $summary = [
            'files' => $totals['files'],
            'reference_detected_rate' => $totals['files'] ? round($totals['reference_found'] / $totals['files'], 4) : null,
            'provider_accuracy' => $totals['files'] ? round($totals['provider_ok'] / $totals['files'], 4) : null,
            'reference_accuracy' => $totals['files'] ? round($totals['reference_ok'] / $totals['files'], 4) : null,
            'amount_accuracy' => $totals['files'] ? round($totals['amount_ok'] / $totals['files'], 4) : null,
        ];

        if ($this->option('json')) {
            $this->line(json_encode(['results' => $rows, 'summary' => $summary], JSON_PRETTY_PRINT));
            return self::SUCCESS;
        }

        $this->table(['File', 'Reader', 'Provider', 'Reference', 'Amount'], $rows);
        $this->info(sprintf(
            'Accuracy over %d file(s) — reference detected: %s%%, provider: %s%%, reference exact: %s%%, amount: %s%%',
            $summary['files'],
            number_format(($summary['reference_detected_rate'] ?? 0) * 100, 1),
            number_format(($summary['provider_accuracy'] ?? 0) * 100, 1),
            number_format(($summary['reference_accuracy'] ?? 0) * 100, 1),
            number_format(($summary['amount_accuracy'] ?? 0) * 100, 1),
        ));

        return self::SUCCESS;
    }
}
