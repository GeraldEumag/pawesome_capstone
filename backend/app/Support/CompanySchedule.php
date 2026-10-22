<?php

namespace App\Support;

use App\Models\Employee;
use App\Models\EmployeeDayOff;
use App\Models\User;
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

    /**
     * Weekday integers (0 = Sun … 6 = Sat) this person has OFF every week,
     * from the employee_day_offs table. Returns [] when nothing is
     * configured — callers then fall back to the company work_days set.
     *
     * For employees linked to a user account, offs stored on either record
     * are merged so the manager only has to configure one side.
     */
    public static function dayOffWeekdays(mixed $person): array
    {
        if (!$person) {
            return [];
        }

        $query = EmployeeDayOff::query();
        if ($person instanceof User) {
            $query->where('user_id', $person->id);
        } elseif ($person instanceof Employee) {
            $query->where('employee_id', $person->id);
            if ($person->user_id) {
                $query->orWhere('user_id', $person->user_id);
            }
        } else {
            return [];
        }

        return $query->pluck('weekday')
            ->map(fn ($d) => (int) $d)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Whether a given date is a scheduled workday.
     *
     * With $person: once a person has configured day-offs the business is
     * treated as operating 7 days a week and only their listed weekdays are
     * rest days. With no configured offs (or no person) the company-wide
     * work_days set applies (default Mon–Sat, Sunday rest).
     */
    public static function isWorkday(Carbon $date, mixed $person = null): bool
    {
        return static::isWorkdayWithOffs(
            $date,
            $person ? static::dayOffWeekdays($person) : []
        );
    }

    /**
     * Same check as isWorkday() but takes pre-fetched offs — for loops that
     * walk many dates and can't afford a query per iteration.
     */
    public static function isWorkdayWithOffs(Carbon $date, array $offs): bool
    {
        if (!empty($offs)) {
            return !in_array($date->dayOfWeek, $offs, true);
        }

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

        return $actual->gt($grace) ? (int) $shiftStart->diffInMinutes($actual) : 0;
    }

    /**
     * How many minutes a check-out is earlier than the standard shift end
     * (undertime). 0 when on time, missing, or past shift end.
     *
     * @param  string  $checkOutHHMM  e.g. '16:12'
     */
    public static function undertimeMinutes(string $checkOutHHMM): int
    {
        $shiftEnd = Carbon::today()->setTimeFromTimeString(static::shiftEnd());
        $actual   = Carbon::today()->setTimeFromTimeString(substr($checkOutHHMM, 0, 5));

        return $actual->lt($shiftEnd) ? (int) $actual->diffInMinutes($shiftEnd) : 0;
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
