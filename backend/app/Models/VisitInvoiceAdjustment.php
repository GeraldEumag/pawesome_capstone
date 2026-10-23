<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VisitInvoiceAdjustment extends Model
{
    public const TYPE_DISCOUNT = 'discount';
    public const TYPE_WAIVER = 'waiver';
    public const TYPE_WRITE_OFF = 'write_off';
    public const TYPE_CREDIT_NOTE = 'credit_note';

    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_APPLIED = 'applied';

    // Types that always require manager approval regardless of amount.
    public const ALWAYS_REQUIRES_APPROVAL = [
        self::TYPE_WAIVER,
        self::TYPE_WRITE_OFF,
    ];

    public const REASON_CODES = [
        'senior_citizen',
        'pwd',
        'loyalty',
        'promo',
        'staff_error',
        'goodwill',
        'uncollectible',
        'other',
    ];

    protected $fillable = [
        'visit_invoice_id',
        'type',
        'amount',
        'reason_code',
        'notes',
        'status',
        'requested_by',
        'approved_by',
        'approved_at',
        'applied_at',
        'service_item_usage_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'approved_at' => 'datetime',
        'applied_at' => 'datetime',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(VisitInvoice::class, 'visit_invoice_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
