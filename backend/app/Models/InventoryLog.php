<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryLog extends Model
{
    protected $fillable = [
        'inventory_item_id',
        'item_id',
        'batch_id',
        'booking_id',
        'movement_type',
        'type',
        'quantity',
        'delta',
        'previous_stock',
        'stock_before',
        'new_stock',
        'stock_after',
        'reason',
        'reference_type',
        'reference_id',
        'transaction_no',
        'reason_code',
        'original_movement_id',
        'reversed_quantity',
        'reference',
        'details',
        'performed_by',
        'user_id',
        'role',
    ];

    public function item()
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function inventoryItem()
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
