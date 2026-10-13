<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceBillingPaymentRequestItem extends Model
{
    protected $fillable = [
        'payment_request_id',
        'service_item_usage_id',
        'item_type',
        'description',
        'quantity',
        'unit',
        'unit_price',
        'total_price',
        'is_discount',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'decimal:2',
        'total_price' => 'decimal:2',
        'is_discount' => 'boolean',
    ];

    public function paymentRequest(): BelongsTo
    {
        return $this->belongsTo(ServiceBillingPaymentRequest::class, 'payment_request_id');
    }

    public function serviceItemUsage(): BelongsTo
    {
        return $this->belongsTo(ServiceItemUsage::class);
    }
}
