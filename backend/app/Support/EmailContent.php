<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * Shared formatting helpers for customer-facing transactional emails.
 * Keep presentation conventions (₱ money, dates, status labels, frontend
 * links) in one place so producers cannot drift apart.
 */
class EmailContent
{
    /** '₱1,234.00' — null when the amount is not a usable number. */
    public static function money($amount): ?string
    {
        if ($amount === null || $amount === '' || !is_numeric($amount)) {
            return null;
        }

        return '₱' . number_format((float) $amount, 2);
    }

    public static function vatInclusivePortion($grossAmount): ?float
    {
        if ($grossAmount === null || $grossAmount === '' || !is_numeric($grossAmount)) {
            return null;
        }

        return round(((float) $grossAmount * 0.12) / 1.12, 2);
    }

    /** 'Oct 06, 2026' — null for missing/unparseable input. */
    public static function date($value): ?string
    {
        return self::format($value, 'M d, Y');
    }

    /** 'Oct 06, 2026 10:00 AM' — null for missing/unparseable input. */
    public static function datetime($value): ?string
    {
        return self::format($value, 'M d, Y h:i A');
    }

    private static function format($value, string $format): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->format($format);
        } catch (\Throwable) {
            return null;
        }
    }

    /** 'in_progress' → 'In Progress'. */
    public static function status(?string $status): ?string
    {
        if ($status === null || $status === '') {
            return null;
        }

        return ucwords(str_replace(['_', '-'], ' ', $status));
    }

    /** Absolute frontend URL for a path — driven by FRONTEND_URL config. */
    public static function frontendUrl(string $path = ''): string
    {
        return rtrim((string) config('app.frontend_url'), '/') . '/' . ltrim($path, '/');
    }
}
