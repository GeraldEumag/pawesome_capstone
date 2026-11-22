<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryStockRequestItem extends Model
{
    protected $fillable = [
        'request_id',
        'inventory_item_id',
        'quantity',
        'batch_id',
        'line_details',
        'movement_id',
    ];

    protected $casts = [
        'line_details' => 'array',
    ];

    public function request()
    {
        return $this->belongsTo(InventoryStockRequest::class, 'request_id');
    }

    public function item()
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function movement()
    {
        return $this->belongsTo(InventoryLog::class, 'movement_id');
    }
}
