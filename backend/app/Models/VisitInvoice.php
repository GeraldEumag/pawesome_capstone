<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class VisitInvoice extends Model
{
    public const STATUS_OPEN = 'open';
    public const STATUS_PARTIALLY_PAID = 'partially_paid';
    public const STATUS_SETTLED = 'settled';
    public const STATUS_VOIDED = 'voided';

    protected $fillable = [
        'invoice_number',
        'invoiceable_type',
        'invoiceable_id',
        'customer_id',
        'status',
        'subtotal',
        'discount_total',
        'total',
        'amount_paid',
        'balance_due',
        'version_hash',
        'issued_at',
        'settled_at',
        'voided_at',
        'voided_by',
        'void_reason',
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'discount_total' => 'decimal:2',
        'total' => 'decimal:2',
        'amount_paid' => 'decimal:2',
        'balance_due' => 'decimal:2',
        'issued_at' => 'datetime',
        'settled_at' => 'datetime',
        'voided_at' => 'datetime',
    ];

    public function invoiceable(): MorphTo
    {
        return $this->morphTo();
    }

    public function lines(): HasMany
    {
        return $this->hasMany(VisitInvoiceLine::class, 'visit_invoice_id')->orderBy('sort_order');
    }

    public function adjustments(): HasMany
    {
        return $this->hasMany(VisitInvoiceAdjustment::class, 'visit_invoice_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
