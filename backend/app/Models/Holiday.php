<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

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
}
