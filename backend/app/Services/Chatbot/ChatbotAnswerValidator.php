<?php

namespace App\Services\Chatbot;

use App\Support\StoreFacts;

/**
 * Output validator for AI replies. An AI answer may only contain contact
 * details (phones, emails, URLs) and peso prices that also appear in the
 * facts/context it was given — anything else is treated as invented and the
 * whole reply is discarded in favor of the FAQ/rule fallback.
 */
class ChatbotAnswerValidator
{
    /**
     * @param  string  $reply     AI-generated reply text
     * @param  array   $context   Context array passed to the prompt (its
     *                            rendered values are the allowed ground truth)
     * @return array{ok: bool, violations: string[]}
     */
    public static function validate(string $reply, array $context = []): array
    {
        $allowed = strtolower(
            implode(' ', StoreFacts::allowedContactValues()) . ' ' . self::flatten($context)
        );

        $violations = [];

        // Emails
        foreach (self::matches('/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i', $reply) as $email) {
            if (!str_contains($allowed, strtolower($email))) {
                $violations[] = "email:{$email}";
            }
        }

        // URLs (ignore the store's own social links — they're in allowed)
        foreach (self::matches('#https?://[^\s)]+|www\.[^\s)]+#i', $reply) as $url) {
            if (!str_contains($allowed, strtolower($url))) {
                $violations[] = "url:{$url}";
            }
        }

        // Phone-like digit runs (6+ digits, optional +/()- separators)
        foreach (self::matches('/\+?\d[\d\s().\-]{5,}\d/', $reply) as $phone) {
            $digits = preg_replace('/\D/', '', $phone);
            if (strlen($digits) >= 6 && !str_contains(preg_replace('/\D/', '', $allowed), $digits)) {
                $violations[] = "phone:{$phone}";
            }
        }

        // Peso amounts (₱1,234.56 / PHP 500 / 500 pesos)
        foreach (self::matches('/(?:₱|php\s*|p\s?)\s?\d[\d,]*(?:\.\d{2})?/i', $reply) as $amount) {
            $num = preg_replace('/[^\d.]/', '', $amount);
            if ($num !== '' && !str_contains($allowed, self::moneyVariants($num))) {
                $violations[] = "price:{$amount}";
            }
        }

        return ['ok' => $violations === [], 'violations' => $violations];
    }

    /**
     * Flatten context values to a plain string for "is this fact allowed"
     * containment checks.
     */
    private static function flatten(mixed $value): string
    {
        if (is_array($value)) {
            return implode(' ', array_map(fn ($v) => self::flatten($v), $value));
        }

        return is_scalar($value) || $value === null ? (string) $value : '';
    }

    /**
     * A peso figure is allowed if ANY common rendering of it appears in the
     * ground truth (500, 500.00, 1,234, 1,234.56).
     */
    private static function moneyVariants(string $num): string
    {
        $variants = [$num];
        if (str_contains($num, '.')) {
            $variants[] = number_format((float) $num, 2, '.', '');
            $variants[] = number_format((float) $num, 0, '.', '');
        }
        $variants[] = number_format((float) $num, 0);   // with commas
        $variants[] = number_format((float) $num, 2);   // with commas + cents

        return implode(' ', $variants);
    }

    /** @return string[] */
    private static function matches(string $pattern, string $text): array
    {
        return preg_match_all($pattern, $text, $m) ? ($m[0] ?? []) : [];
    }
}
