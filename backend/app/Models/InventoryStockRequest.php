<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryStockRequest extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'request_no',
        'transaction_no',
        'reason_code',
        'status',
        'request_payload',
        'requested_by',
        'reviewed_by',
        'reviewed_at',
        'review_remarks',
        'executed_at',
    ];

    protected $casts = [
        'request_payload' => 'array',
        'reviewed_at' => 'datetime',
        'executed_at' => 'datetime',
    ];

    public function items()
    {
        return $this->hasMany(InventoryStockRequestItem::class, 'request_id');
    }

    public function requester()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
