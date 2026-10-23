<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class DiagnosticOrder extends Model
{
    public const STATUS_ORDERED = 'ordered';
    public const STATUS_COLLECTED = 'collected';
    public const STATUS_RESULTED = 'resulted';
    public const STATUS_REVIEWED = 'reviewed';
    public const STATUS_CANCELLED = 'cancelled';

    public const OPEN_STATUSES = [
        self::STATUS_ORDERED,
        self::STATUS_COLLECTED,
        self::STATUS_RESULTED,
    ];

    protected $fillable = [
        'appointment_id',
        'code',
        'order_type',
        'name',
        'priority',
        'status',
        'notes',
        'ordered_by',
        'ordered_at',
        'collected_by',
        'collected_at',
        'resulted_by',
        'resulted_at',
        'reviewed_by',
        'reviewed_at',
        'cancelled_by',
        'cancelled_at',
        'cancel_reason',
    ];

    protected $casts = [
        'ordered_at' => 'datetime',
        'collected_at' => 'datetime',
        'resulted_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function results(): HasMany
    {
        return $this->hasMany(DiagnosticResult::class, 'diagnostic_order_id');
    }

    public function latestResult(): HasOne
    {
        return $this->hasOne(DiagnosticResult::class, 'diagnostic_order_id')->latestOfMany();
    }
}
