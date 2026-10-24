<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentReference extends Model
{
    protected $fillable = [
        'provider',
        'reference_normalized',
        'payable_type',
        'payable_id',
        'receipt_id',
        'confirmed_by',
        'confirmed_at',
    ];

    protected $casts = [
        'confirmed_at' => 'datetime',
    ];

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(PaymentReceipt::class, 'receipt_id');
    }
}
