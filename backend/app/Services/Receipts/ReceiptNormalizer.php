<?php

namespace App\Services\Receipts;

use App\Models\ProviderConfig;

/**
 * Normalize an extracted reference number: strip spaces/hyphens, uppercase,
 * and apply the provider's character-confusion map only when the provider
 * pattern allows digits only (per the provider_configs rule — Maya Payment
 * IDs may be hexadecimal, so no automatic changes there).
 */
class ReceiptNormalizer
{
    public static function normalize(?string $raw, ?ProviderConfig $config): ?string
    {
        if ($raw === null) {
            return null;
        }

        $value = mb_strtoupper(preg_replace('/[\s\-]+/', '', trim($raw)) ?? '', 'UTF-8');
        if ($value === '') {
            return null;
        }

        // Confusion map applies only when the provider pattern is digits-only —
        // a letter in an alphanumeric reference may be a real letter.
        $pattern = (string) ($config?->reference_pattern ?? '');
        $hasLetterClass = preg_match('/A-Z|a-z/i', $pattern) === 1;
        $hasDigitClass = str_contains($pattern, '0-9') || str_contains($pattern, '\d');
        $digitsOnly = $pattern !== '' && $hasDigitClass && !$hasLetterClass;

        if ($digitsOnly && $config?->confusion_map) {
            $value = strtr($value, $config->confusion_map);
        }

        return $value;
    }

    /**
     * Does a normalized value satisfy the provider's configured pattern and
     * length bounds?
     */
    public static function matchesProviderPattern(?string $normalized, ?ProviderConfig $config): bool
    {
        if ($normalized === null || $normalized === '') {
            return false;
        }

        if ($config) {
            $min = (int) ($config->min_length ?? 0);
            $max = (int) ($config->max_length ?? PHP_INT_MAX);
            $length = mb_strlen($normalized);
            if ($length < $min || $length > $max) {
                return false;
            }

            if ($config->reference_pattern) {
                $pattern = '/' . str_replace('/', '\/', $config->reference_pattern) . '/';
                if (@preg_match($pattern, $normalized) !== 1) {
                    return false;
                }
            }
        }

        return true;
    }
}
