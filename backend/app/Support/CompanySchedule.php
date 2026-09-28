<?php

namespace App\Support;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Company-wide fixed schedule settings.
 *
 * Reads from system_settings (key-value) and caches results for 60 minutes.
 * Replaces the per-employee work_schedules table queries.
 *
 * Keys managed:
 *   shift_start            '08:00'
 *   shift_end              '17:00'
 *   break_minutes          60
 *   work_days              [1,2,3,4,5,6]  (0=Sun … 6=Sat)
 *   grace_period_minutes   15
 *   daily_rate_divisor     26
 *   overtime_threshold_hours 8
 */
class CompanySchedule
{
    private static function setting(string $key, mixed $default = null): mixed
    {
        return Cache::remember("company_schedule_{$key}", 3600, function () use ($key, $default) {
            $value = DB::table('system_settings')->where('key', $key)->value('value');
            return $value !== null ? $value : $default;
        });
    }

    /** Clear cached settings (call after any update to system_settings). */
    public static function clearCache(): void
    {
        foreach ([
            'shift_start', 'shift_end', 'break_minutes', 'work_days',
            'grace_period_minutes', 'daily_rate_divisor', 'overtime_threshold_hours',
        ] as $key) {
            Cache::forget("company_schedule_{$key}");
        }
    }

    /** Standard shift start time, e.g. '08:00'. */
    public static function shiftStart(): string
    {
        return (string) static::setting('shift_start', '08:00');
    }

    /** Standard shift end time, e.g. '17:00'. */
    public static function shiftEnd(): string
    {
        return (string) static::setting('shift_end', '17:00');
    }

    /** Break duration in minutes (deducted from worked hours). */
    public static function breakMinutes(): int
    {
        return (int) static::setting('break_minutes', 60);
    }

    /**
     * Array of day-of-week integers that are working days.
     * 0 = Sunday, 1 = Monday … 6 = Saturday.
     * Default: Mon–Sat → [1,2,3,4,5,6]
     */
    public static function workDays(): array
    {
        $raw = static::setting('work_days', '[1,2,3,4,5,6]');
        if (is_array($raw)) {
            return array_map('intval', $raw);
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? array_map('intval', $decoded) : [1, 2, 3, 4, 5, 6];
    }

    /** Late grace period in minutes after shift_start before deduction applies. */
    public static function graceMinutes(): int
    {
        return (int) static::setting('grace_period_minutes', 15);
    }

    /** Number of working days per month used as the daily rate denominator. */
    public static function dailyRateDivisor(): int
    {
        return (int) static::setting('daily_rate_divisor', 26);
    }

    /** Hours per day after which overtime rate kicks in. */
    public static function overtimeThreshold(): int
    {
        return (int) static::setting('overtime_threshold_hours', 8);
    }

    /** Whether a given date is a company working day. */
    public static function isWorkday(Carbon $date): bool
    {
        return in_array($date->dayOfWeek, static::workDays(), true);
    }

    /**
     * How many minutes a check-in is late (0 if within grace period).
     *
     * @param  string  $checkInHHMM  e.g. '08:32'
     * @return int minutes late (0 if on time or within grace)
     */
    public static function lateMinutes(string $checkInHHMM): int
    {
        $shiftStart = Carbon::today()->setTimeFromTimeString(static::shiftStart());
        $grace      = $shiftStart->copy()->addMinutes(static::graceMinutes());
        $actual     = Carbon::today()->setTimeFromTimeString(substr($checkInHHMM, 0, 5));

        return $actual->gt($grace) ? (int) $actual->diffInMinutes($shiftStart) : 0;
    }

    /**
     * Number of minutes the employee worked within the night differential window
     * (10 PM to 6 AM next day) for a given attendance record.
     *
     * @param  string  $date      'Y-m-d'
     * @param  string  $checkIn   'H:i' or 'H:i:s'
     * @param  string  $checkOut  'H:i' or 'H:i:s'
     */
    public static function nightDiffMinutes(string $date, string $checkIn, string $checkOut): int
    {
        $base = Carbon::parse($date);

        $workStart = $base->copy()->setTimeFromTimeString($checkIn);
        $workEnd   = $base->copy()->setTimeFromTimeString($checkOut);
        if ($workEnd->lt($workStart)) {
            $workEnd->addDay(); // overnight shift
        }

        // Night window: 22:00 on date → 06:00 next day
        $nightStart = $base->copy()->setTime(22, 0);
        $nightEnd   = $base->copy()->addDay()->setTime(6, 0);

        $overlapStart = $workStart->max($nightStart);
        $overlapEnd   = $workEnd->min($nightEnd);

        return $overlapEnd->gt($overlapStart)
            ? (int) $overlapStart->diffInMinutes($overlapEnd)
            : 0;
    }
}
