<?php

namespace App\Services\Receipts;

use App\Models\ProviderConfig;
use Illuminate\Support\Facades\Cache;

/**
 * Label-driven parser for raw receipt text produced by the local OCR reader
 * (tesseract stdout) or pdftotext. Emits the same extraction schema as the
 * vision reader so the rest of the pipeline is reader-agnostic.
 *
 * Labels and accepted status wording come from provider_configs — app layout
 * changes are fixed by the manager editing config, not by a code change.
 */
class ProviderReceiptParser
{
    /**
     * @return array extraction schema (see ReceiptReaderInterface::read)
     */
    public function parse(string $text): array
    {
        $lines = collect(preg_split('/\R/', $text))
            ->map(fn ($line) => trim($line))
            ->filter(fn ($line) => $line !== '')
            ->values()
            ->all();

        $provider = $this->detectProvider($text);
        $config = $provider ? $this->providerConfig($provider) : null;

        $reference = $this->extractReference($lines, $provider, $config);
        $amount = $this->extractAmount($lines);
        $paidAt = $this->extractPaidAt($lines);
        $statusText = $this->extractStatusText($lines, $config);
        $recipient = $this->extractRecipient($lines);
        $transactionType = $this->detectTransactionType($text);

        $refConfidence = $reference['confidence'];
        $confidence = [
            'reference_number' => $refConfidence,
            'amount' => $amount !== null ? 0.70 : null,
            'paid_at' => $paidAt !== null ? 0.60 : null,
            'overall' => $refConfidence,
        ];

        return [
            'is_payment_receipt' => $provider !== null && $reference['value'] !== null,
            'provider' => $provider ?? 'unknown',
            'transaction_type' => $transactionType,
            'reference_number' => $reference['value'],
            'amount' => $amount,
            'paid_at' => $paidAt,
            'status_text' => $statusText,
            'recipient_name' => $recipient['name'],
            'recipient_account_last4' => $recipient['last4'],
            'sender_name' => null,
            'image_quality' => null,
            'confidence' => $confidence,
            'raw' => ['source' => 'local_text'],
        ];
    }

    private function providerConfig(string $provider): ?ProviderConfig
    {
        return Cache::remember("provider_config:{$provider}", 300, fn () =>
            ProviderConfig::where('provider', $provider)->where('active', true)->first()
        );
    }

    private function detectProvider(string $text): ?string
    {
        $lower = mb_strtolower($text);
        if (str_contains($lower, 'gcash')) {
            return 'gcash';
        }
        if (str_contains($lower, 'paymaya') || str_contains($lower, 'maya')) {
            return 'maya';
        }

        return null;
    }

    private function detectTransactionType(string $text): ?string
    {
        $lower = mb_strtolower($text);
        return match (true) {
            str_contains($lower, 'send money'), str_contains($lower, 'express send') => 'send_money',
            str_contains($lower, 'pay qr'), str_contains($lower, 'qrph'), str_contains($lower, 'scan to pay') => 'pay_qr',
            str_contains($lower, 'pay bills'), str_contains($lower, 'bills payment') => 'bills',
            str_contains($lower, 'payment') => 'other',
            default => null,
        };
    }

    /**
     * Find the reference by its label, falling back to a standalone token
     * matching the provider pattern. Label hits score higher confidence.
     */
    private function extractReference(array $lines, ?string $provider, ?ProviderConfig $config): array
    {
        $labels = $config?->reference_labels ?? [];

        foreach ($lines as $i => $line) {
            foreach ($labels as $label) {
                $pos = mb_stripos($line, $label);
                if ($pos === false) {
                    continue;
                }

                $after = trim(mb_substr($line, $pos + mb_strlen($label)));
                $after = ltrim($after, ':.-# ');

                // GCash prints the ref grouped with spaces ("0123 456 7890");
                // collapse the groups on the same line.
                if ($after !== '' && preg_match('/^[A-Za-z0-9][A-Za-z0-9\s]{4,}$/', $after)) {
                    $candidate = preg_replace('/\s+/', '', $after);
                    return ['value' => $candidate, 'confidence' => 0.85];
                }

                // Label on its own line → try the next line.
                if ($after === '' && isset($lines[$i + 1])
                    && preg_match('/^[A-Za-z0-9][A-Za-z0-9\s]{4,}$/', $lines[$i + 1])) {
                    $candidate = preg_replace('/\s+/', '', $lines[$i + 1]);
                    return ['value' => $candidate, 'confidence' => 0.80];
                }
            }
        }

        // Fallback: a standalone line matching the provider pattern/length.
        if ($config) {
            $min = (int) ($config->min_length ?? 6);
            $max = (int) ($config->max_length ?? 32);
            foreach ($lines as $line) {
                $candidate = preg_replace('/\s+/', '', $line);
                if (preg_match('/^[A-Za-z0-9]{' . $min . ',' . $max . '}$/', $candidate)
                    && $this->matchesPattern($candidate, $config->reference_pattern)) {
                    return ['value' => $candidate, 'confidence' => 0.65];
                }
            }
        }

        return ['value' => null, 'confidence' => null];
    }

    private function matchesPattern(string $candidate, ?string $pattern): bool
    {
        if (!$pattern) {
            return true;
        }

        return @preg_match('/' . str_replace('/', '\/', $pattern) . '/', strtoupper($candidate)) === 1;
    }

    private function extractAmount(array $lines): ?float
    {
        $patterns = [
            // Prefer labelled amounts ("Amount Sent ₱1,250.00", "Total ₱...")
            '/(?:amount|total|paid|sent)[^0-9₱]{0,20}[₱p]?\s*([0-9][0-9,]*\.[0-9]{2})/i',
            // Bare currency amount on its own line
            '/^[₱p]\s*([0-9][0-9,]*\.[0-9]{2})/i',
        ];

        foreach ($patterns as $pattern) {
            foreach ($lines as $line) {
                if (preg_match($pattern, $line, $m)) {
                    return (float) str_replace(',', '', $m[1]);
                }
            }
        }

        return null;
    }

    private function extractPaidAt(array $lines): ?string
    {
        $formats = [
            'M d, Y g:i A', 'M d, Y g:iA', 'd M Y g:i A', 'd M Y, g:i A',
            'Y-m-d H:i:s', 'Y-m-d H:i', 'm/d/Y g:i A', 'd/m/Y H:i',
            'M d, Y', 'Y-m-d',
        ];

        foreach ($lines as $line) {
            if (!preg_match('/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i', $line)) {
                continue;
            }

            $candidate = trim(preg_replace('/^(date|time|paid on|transaction date)\s*[:.]?\s*/i', '', $line));
            foreach ($formats as $format) {
                $parsed = \DateTime::createFromFormat($format, $candidate, new \DateTimeZone('Asia/Manila'));
                if ($parsed && $parsed->format($format) === $candidate) {
                    return $parsed->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
                }
            }

            $ts = strtotime($candidate);
            if ($ts !== false) {
                $dt = new \DateTime('@' . $ts);
                $dt->setTimezone(new \DateTimeZone('UTC'));
                return $dt->format('Y-m-d H:i:s');
            }
        }

        return null;
    }

    private function extractStatusText(array $lines, ?ProviderConfig $config): ?string
    {
        $accepted = collect($config?->accepted_status_texts ?? [])->map(fn ($w) => mb_strtolower((string) $w));

        foreach ($lines as $line) {
            $lower = mb_strtolower($line);
            if ($accepted->contains(fn ($word) => $word !== '' && str_contains($lower, $word))) {
                return $line;
            }
        }

        return null;
    }

    /**
     * Receipts usually mask the account number ("0917•••4567", "09XX XXX 1234").
     * Take the recipient name from lines near "to"/"recipient"/"sent to" and
     * the last 4 digits from any masked or plain mobile number.
     */
    private function extractRecipient(array $lines): array
    {
        $name = null;
        $last4 = null;

        foreach ($lines as $i => $line) {
            if ($last4 === null && preg_match('/09\d{9}/', $line, $m)) {
                $last4 = substr($m[0], -4);
            }
            if ($last4 === null && preg_match('/(?:\*|x|•){2,}\s*(\d{4})\b/i', $line, $m)) {
                $last4 = $m[1];
            }

            if ($name === null && preg_match('/^(?:sent|paid|transferred)?\s*to\s+(.+)$/i', $line, $m)) {
                $candidate = trim($m[1]);
                if (mb_strlen($candidate) >= 3 && mb_strlen($candidate) <= 80 && !preg_match('/[0-9]{6,}/', $candidate)) {
                    $name = $candidate;
                }
            }
        }

        return ['name' => $name, 'last4' => $last4];
    }
}
