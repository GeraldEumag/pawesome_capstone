<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceiptCorrection extends Model
{
    protected $fillable = [
        'receipt_id',
        'field',
        'old_value',
        'new_value',
        'corrected_by',
    ];

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(PaymentReceipt::class, 'receipt_id');
    }
}
