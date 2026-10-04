<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PaymentSettlement extends Model
{
    public const STATUS_PAID = 'paid';
    public const STATUS_VOIDED = 'voided';
    public const STATUS_REFUNDED = 'refunded';

    public const STATUSES = [
        self::STATUS_PAID,
        self::STATUS_VOIDED,
        self::STATUS_REFUNDED,
    ];

    protected $fillable = [
        'settleable_type',
        'settleable_id',
        'customer_id',
        'user_id',
        'amount',
        'currency',
        'status',
        'payment_method',
        'reference_number',
        'receipt_number',
        'verified_by',
        'verified_at',
        'paid_at',
        'voided_at',
        'voided_by',
        'void_reason',
        'idempotency_key',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'verified_at' => 'datetime',
        'paid_at' => 'datetime',
        'voided_at' => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(PaymentSettlementItem::class);
    }
}
