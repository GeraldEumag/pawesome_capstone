<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VisitInvoiceLine extends Model
{
    protected $fillable = [
        'visit_invoice_id',
        'service_item_usage_id',
        'item_type',
        'description',
        'quantity',
        'unit_price',
        'line_total',
        'is_billable',
        'is_paid',
        'sort_order',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
        'is_billable' => 'boolean',
        'is_paid' => 'boolean',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(VisitInvoice::class, 'visit_invoice_id');
    }

    public function usage(): BelongsTo
    {
        return $this->belongsTo(ServiceItemUsage::class, 'service_item_usage_id');
    }
}
