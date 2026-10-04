<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentSettlementItem extends Model
{
    protected $fillable = [
        'payment_settlement_id',
        'service_item_usage_id',
        'description',
        'quantity',
        'unit_price',
        'total_price',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'total_price' => 'decimal:2',
    ];

    public function settlement(): BelongsTo
    {
        return $this->belongsTo(PaymentSettlement::class, 'payment_settlement_id');
    }

    public function serviceItemUsage(): BelongsTo
    {
        return $this->belongsTo(ServiceItemUsage::class);
    }
}
