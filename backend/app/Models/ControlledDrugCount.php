<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ControlledDrugCount extends Model
{
    public const STATUS_PENDING_WITNESS = 'pending_witness';
    public const STATUS_VERIFIED = 'verified';
    public const STATUS_DISPUTED = 'disputed';

    protected $fillable = [
        'inventory_item_id',
        'expected_balance',
        'counted_balance',
        'variance',
        'reason',
        'counted_by',
        'witnessed_by',
        'status',
        'week_of',
        'verified_at',
    ];

    protected $casts = [
        'week_of' => 'date',
        'verified_at' => 'datetime',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function countedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'counted_by');
    }

    public function witnessedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'witnessed_by');
    }
}
