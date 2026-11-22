<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryReturn extends Model
{
    protected $table = 'inventory_returns';

    public const STATUS_PENDING = 'pending_inspection';
    public const STATUS_RESTOCKED = 'restocked';
    public const STATUS_QUARANTINED = 'quarantined';
    public const STATUS_DAMAGED = 'damaged';
    public const STATUS_DISPOSED = 'disposed';

    protected $fillable = [
        'return_no',
        'source_type',
        'source_id',
        'inventory_item_id',
        'quantity',
        'return_reason',
        'status',
        'disposition',
        'inspection_notes',
        'photo',
        'received_by',
        'inspected_by',
        'inspected_at',
        'movement_id',
    ];

    protected $casts = [
        'inspected_at' => 'datetime',
    ];

    public function item()
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function receiver()
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function inspector()
    {
        return $this->belongsTo(User::class, 'inspected_by');
    }

    public function movement()
    {
        return $this->belongsTo(InventoryLog::class, 'movement_id');
    }
}
