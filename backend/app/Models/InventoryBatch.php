<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryBatch extends Model
{
    use HasFactory;

    protected $fillable = [
        'inventory_item_id',
        'batch_no',
        'received_date',
        'manufacturing_date',
        'expiration_date',
        'quantity',
        'remaining_quantity',
        'supplier',
        'unit_cost',
        'proof_photo',
        'status',
        'notes',
    ];

    protected $casts = [
        'received_date' => 'date',
        'manufacturing_date' => 'date',
        'expiration_date' => 'date',
    ];

    /**
     * Get the inventory item this batch belongs to
     */
    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    /**
     * Check if batch is expired
     */
    public function isExpired(): bool
    {
        if (!$this->expiration_date) {
            return false;
        }
        return $this->expiration_date->isPast();
    }

    /**
     * Check if batch is expiring soon (within 30 days)
     */
    public function isExpiringSoon(): bool
    {
        if (!$this->expiration_date || $this->isExpired()) {
            return false;
        }
        return $this->expiration_date->diffInDays(now()) <= 30;
    }

    /**
     * Get expiration status text
     */
    public function getExpirationStatus(): string
    {
        if ($this->isExpired()) {
            return 'expired';
        }
        if ($this->isExpiringSoon()) {
            return 'expiring_soon';
        }
        return 'good';
    }

    /**
     * Get expiration status badge color
     */
    public function getExpirationBadgeColor(): string
    {
        return match($this->getExpirationStatus()) {
            'expired' => 'red',
            'expiring_soon' => 'orange',
            default => 'green',
        };
    }

    /**
     * Scope for active batches only
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active')
                     ->where('remaining_quantity', '>', 0);
    }

    /**
     * Scope for non-expired batches (FEFO eligible)
     */
    public function scopeNotExpired($query)
    {
        return $query->where(function ($q) {
            $q->whereNull('expiration_date')
              ->orWhere('expiration_date', '>', now());
        });
    }

    /**
     * Scope for FEFO ordering (earliest expiration first)
     */
    public function scopeFefoOrder($query)
    {
        return $query->orderByRaw('COALESCE(expiration_date, "9999-12-31") ASC')
                     ->orderBy('received_date', 'asc');
    }

    /**
     * Scope for FIFO ordering (oldest received first)
     */
    public function scopeFifoOrder($query)
    {
        return $query->orderBy('received_date', 'asc');
    }
}
