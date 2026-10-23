<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VisitEstimate extends Model
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_PRESENTED = 'presented';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_CHANGES_REQUESTED = 'changes_requested';

    protected $fillable = [
        'appointment_id',
        'version',
        'status',
        'subtotal',
        'approved_total',
        'threshold_percent',
        'channel',
        'approved_by_user_id',
        'approved_by_customer_id',
        'presented_at',
        'approved_at',
        'rejected_at',
        'created_by',
        'notes',
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'approved_total' => 'decimal:2',
        'threshold_percent' => 'decimal:2',
        'presented_at' => 'datetime',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
    ];

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(VisitEstimateLine::class, 'visit_estimate_id')->orderBy('sort_order');
    }

    public function approvedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function approvedByCustomer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'approved_by_customer_id');
    }
}
