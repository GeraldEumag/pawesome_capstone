<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceiptValidation extends Model
{
    public const RESULT_PASS = 'pass';
    public const RESULT_WARNING = 'warning';
    public const RESULT_BLOCK = 'block';

    protected $fillable = [
        'receipt_id',
        'rule',
        'result',
        'detail',
    ];

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(PaymentReceipt::class, 'receipt_id');
    }
}
