<?php

namespace App\Support;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Customer-facing store hours (bookings, availability, chatbot copy).
 *
 * Separate from CompanySchedule, which governs employee attendance and payroll.
 *
 * Keys managed in system_settings:
 *   store_open_time   '10:00'
 *   store_close_time  '18:00'
 *   store_open_days   [0,1,2,3,4,5,6]   (0 = Sunday)
 */
class StoreHours
{
    public const TIMEZONE = 'Asia/Manila';

    private const DEFAULTS = [
        'store_open_time' => '10:00',
        'store_close_time' => '18:00',
        'store_open_days' => '[0,1,2,3,4,5,6]',
    ];

    private static function setting(string $key): mixed
    {
        return Cache::remember("store_hours_{$key}", 3600, function () use ($key) {
            $value = DB::table('system_settings')->where('key', $key)->value('value');
            return $value ?? self::DEFAULTS[$key];
        });
    }

    /** Clear cached values (call after any update to the store_* settings). */
    public static function clearCache(): void
    {
        foreach (array_keys(self::DEFAULTS) as $key) {
            Cache::forget("store_hours_{$key}");
        }
    }

    /** Opening time, 'HH:mm'. */
    public static function opensAt(): string
    {
        return substr((string) self::setting('store_open_time'), 0, 5);
    }

    /** Closing time, 'HH:mm'. */
    public static function closesAt(): string
    {
        return substr((string) self::setting('store_close_time'), 0, 5);
    }

    /** @return int[] Open weekdays, 0 = Sunday … 6 = Saturday. */
    public static function openDays(): array
    {
        $raw = self::setting('store_open_days');
        $decoded = is_array($raw) ? $raw : json_decode((string) $raw, true);
        return is_array($decoded) ? array_map('intval', $decoded) : [0, 1, 2, 3, 4, 5, 6];
    }

    /** Opening time in minutes after midnight. */
    public static function openMinutes(): int
    {
        [$h, $m] = array_map('intval', explode(':', self::opensAt()));
        return $h * 60 + $m;
    }

    /** Closing time in minutes after midnight. */
    public static function closeMinutes(): int
    {
        [$h, $m] = array_map('intval', explode(':', self::closesAt()));
        return $h * 60 + $m;
    }

    public static function isOpenDay(Carbon $date): bool
    {
        return in_array($date->dayOfWeek, self::openDays(), true);
    }

    /** Human-readable hours, e.g. "10:00 AM – 6:00 PM". */
    public static function label(): string
    {
        $fmt = fn (string $hm) => Carbon::createFromFormat('H:i', $hm)->format('g:i A');
        return $fmt(self::opensAt()) . ' – ' . $fmt(self::closesAt());
    }

    /** Payload for the public settings endpoint. */
    public static function publicPayload(): array
    {
        return [
            'open' => self::opensAt(),
            'close' => self::closesAt(),
            'open_days' => self::openDays(),
            'label' => self::label(),
        ];
    }
}
