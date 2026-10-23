<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryMonthlyAudit extends Model
{
    protected $fillable = [
        'inventory_item_id',
        'system_stock',
        'actual_stock',
        'variance',
        'audit_month',
        'status',
        'approval_status',
        'reason',
        'checked_by',
        'approved_by',
        'approved_at',
    ];

    protected $casts = [
        'approved_at' => 'datetime',
    ];

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function item()
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }
}
