<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceiptExtraction extends Model
{
    protected $fillable = [
        'receipt_id',
        'reader',
        'reader_version',
        'provider',
        'transaction_type',
        'reference_raw',
        'reference_normalized',
        'amount',
        'paid_at',
        'status_text',
        'recipient_name',
        'recipient_last4',
        'sender_name',
        'image_quality',
        'confidence_json',
        'raw_response_json',
        'latency_ms',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'paid_at' => 'datetime',
        'confidence_json' => 'array',
        'raw_response_json' => 'array',
    ];

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(PaymentReceipt::class, 'receipt_id');
    }
}
