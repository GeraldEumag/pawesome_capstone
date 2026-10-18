<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Cache;

class Holiday extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'date', 'name', 'type', 'year', 'is_recurring', 'created_by',
    ];

    protected $casts = [
        'date'         => 'date',
        'is_recurring' => 'boolean',
        'year'         => 'integer',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Check if a given date string is a holiday; returns the holiday row or null. */
    public static function forDate(string $date): ?self
    {
        return static::whereDate('date', $date)->first();
    }

    /**
     * Map of 'Y-m-d' => holiday name for one year, cached 10 minutes.
     * Only non-deleted rows count (soft-deleted holidays are not blocked).
     *
     * @return array<string, string>
     */
    public static function blockedMap(int $year): array
    {
        return Cache::remember("holidays_blocked_{$year}", 600, function () use ($year) {
            return static::where('year', $year)->orderBy('date')->get()
                ->mapWithKeys(fn (self $h) => [$h->date->toDateString() => $h->name])
                ->all();
        });
    }

    /** Holiday name blocking the given date, or null when the date is open for bookings. */
    public static function blockedNameOn(Carbon|string $date): ?string
    {
        $day = Carbon::parse($date)->toDateString();
        return static::blockedMap((int) substr($day, 0, 4))[$day] ?? null;
    }

    public static function isBlockedForBooking(Carbon|string $date): bool
    {
        return static::blockedNameOn($date) !== null;
    }

    /**
     * Blocked dates in an inclusive range, as [['date' => 'Y-m-d', 'name' => ...], ...].
     */
    public static function blockedBetween(Carbon|string $from, Carbon|string $to): array
    {
        $start = Carbon::parse($from)->startOfDay();
        $end = Carbon::parse($to)->startOfDay();
        $result = [];
        for ($d = $start->copy(); $d->lte($end); $d->addDay()) {
            $name = static::blockedNameOn($d);
            if ($name !== null) {
                $result[] = ['date' => $d->toDateString(), 'name' => $name];
            }
        }
        return $result;
    }

    /** Forget cached blocked-date maps for the years a change touched. */
    public static function clearCache(int ...$years): void
    {
        foreach ($years ?: [(int) now()->year] as $year) {
            Cache::forget("holidays_blocked_{$year}");
        }
    }
}
