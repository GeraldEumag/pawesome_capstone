<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PaymentReceipt extends Model
{
    public const STATUS_UPLOADED = 'uploaded';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_READY = 'ready';
    public const STATUS_NEEDS_REVIEW = 'needs_review';
    public const STATUS_CONFIRMED = 'confirmed';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'payable_type',
        'payable_id',
        'uploaded_by',
        'disk',
        'disk_path',
        'mime',
        'size_bytes',
        'sha256',
        'phash',
        'provider',
        'submitted_reference',
        'idempotency_key',
        'status',
        'reject_reason',
    ];

    public function extractions(): HasMany
    {
        return $this->hasMany(ReceiptExtraction::class, 'receipt_id');
    }

    public function validations(): HasMany
    {
        return $this->hasMany(ReceiptValidation::class, 'receipt_id');
    }

    public function corrections(): HasMany
    {
        return $this->hasMany(ReceiptCorrection::class, 'receipt_id');
    }
}
