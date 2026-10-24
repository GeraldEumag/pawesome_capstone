<?php

namespace App\Services\Receipts;

use App\Services\Receipts\Contracts\ReceiptReaderInterface;
use Symfony\Component\Process\Process;

/**
 * Fully local, no-network fallback reader. Images go through the Tesseract
 * CLI; PDFs go through pdftotext (digital receipts) — a scanned image-PDF
 * with no text layer is reported unreadable locally and the chain falls
 * through. Requires the Tesseract binary (OCR_TESSERACT_PATH or PATH).
 */
class LocalOcrReader implements ReceiptReaderInterface
{
    private string $tesseractPath;
    private string $pdftotextPath;
    private int $psm;
    private int $timeout;
    private ProviderReceiptParser $parser;

    public function __construct(?ProviderReceiptParser $parser = null)
    {
        $ocr = config('receipt_scanner.ocr', []);
        $this->tesseractPath = (string) ($ocr['tesseract_path'] ?? '');
        $this->pdftotextPath = (string) ($ocr['pdftotext_path'] ?? 'pdftotext');
        $this->psm = (int) ($ocr['psm'] ?? 6);
        $this->timeout = (int) ($ocr['timeout'] ?? 60);
        $this->parser = $parser ?? new ProviderReceiptParser();
    }

    public function name(): string
    {
        return 'ocr';
    }

    public function version(): string
    {
        return 'local-ocr:' . (string) config('receipt_scanner.reader_version', 'v1');
    }

    public function isAvailable(): bool
    {
        return $this->resolveTesseractBinary() !== null
            || $this->resolveBinary($this->pdftotextPath) !== null;
    }

    public function read(string $absolutePath, string $mime): array
    {
        if ($mime === 'application/pdf') {
            return $this->readPdf($absolutePath);
        }

        return $this->readImage($absolutePath);
    }

    private function readImage(string $absolutePath): array
    {
        $binary = $this->resolveTesseractBinary();
        if (!$binary) {
            throw new ReceiptReaderException('Tesseract binary not found (set OCR_TESSERACT_PATH or install Tesseract).');
        }

        $text = $this->run([$binary, $absolutePath, 'stdout', '--psm', (string) $this->psm]);
        if (trim($text) === '') {
            throw new ReceiptReaderException('OCR produced no text.');
        }

        return $this->parser->parse($text);
    }

    private function readPdf(string $absolutePath): array
    {
        $binary = $this->resolveBinary($this->pdftotextPath);
        if (!$binary) {
            throw new ReceiptReaderException('pdftotext binary not found — cannot read PDFs locally.');
        }

        $text = $this->run([$binary, '-layout', $absolutePath, '-']);
        if (trim($text) === '') {
            throw new ReceiptReaderException('PDF has no extractable text layer (scanned PDF needs the vision reader).');
        }

        return $this->parser->parse($text);
    }

    private function resolveTesseractBinary(): ?string
    {
        $candidates = array_filter([
            $this->tesseractPath,
            'tesseract',
            'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
            'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
        ]);

        foreach ($candidates as $candidate) {
            if ($this->resolveBinary($candidate)) {
                return $this->resolveBinary($candidate);
            }
        }

        return null;
    }

    private function resolveBinary(string $binary): ?string
    {
        if ($binary === '') {
            return null;
        }

        // Absolute or relative path with a separator → check the file exists.
        if (str_contains($binary, DIRECTORY_SEPARATOR) || str_contains($binary, '/')) {
            return is_file($binary) ? $binary : null;
        }

        // Bare command name → probe via `where` (Windows) / `which`.
        $probe = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' ? ['where', $binary] : ['which', $binary];
        try {
            $process = new Process($probe);
            $process->setTimeout(5)->run();
            if ($process->isSuccessful()) {
                $first = trim(explode("\n", $process->getOutput())[0] ?? '');
                return $first !== '' ? $first : $binary;
            }
        } catch (\Throwable) {
        }

        return null;
    }

    private function run(array $command): string
    {
        try {
            $process = new Process($command);
            $process->setTimeout($this->timeout)->run();
        } catch (\Throwable $e) {
            throw new ReceiptReaderException('OCR process failed: ' . $e->getMessage());
        }

        if (!$process->isSuccessful()) {
            throw new ReceiptReaderException('OCR failed: ' . trim($process->getErrorOutput() ?: $process->getOutput()));
        }

        return $process->getOutput();
    }
}
