<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InventoryItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'sku',
        'name',
        'category',
        'brand',
        'supplier',
        'description',
        'photo',
        'stock',
        'reorder_level',
        'price',
        'expiry_date',
        'status',
        'is_sellable',
        'barcode',
        'threshold',
        'deleted_by',
        'archive_reason',
        'archive_status',
        'archived_at',
        'archived_by',
        'customer_snapshot',
        'pet_snapshot',
        'service_item_usage_snapshot',
        'payment_snapshot',
    ];

    protected $appends = ['photo_url'];

    /**
     * Category to SKU prefix mapping
     */
    private const SKU_PREFIXES = [
        'Food' => 'FOO',
        'Accessories' => 'ACC',
        'Grooming' => 'GRM',
        'Toys' => 'TOY',
        'Health' => 'HLT',
        'Services' => 'SRV',
    ];

    protected static function booted(): void
    {
        static::creating(function ($item) {
            // Auto-generate SKU if empty
            if (empty($item->sku)) {
                $prefix = self::SKU_PREFIXES[$item->category] ?? 'ITM';
                $item->sku = $prefix . '-' . strtoupper(uniqid());
            }

            // Validate and correct category
            $validCategories = ['Food', 'Accessories', 'Grooming', 'Toys', 'Health', 'Services'];
            if (!in_array($item->category, $validCategories)) {
                $item->category = 'Accessories';
            }

            // Validate and correct status
            $validStatuses = ['active', 'inactive', 'discontinued'];
            if (!in_array($item->status, $validStatuses)) {
                $item->status = 'active';
            }

            // Ensure non-negative values
            $item->stock = max(0, $item->stock ?? 0);
            $item->price = max(0, $item->price ?? 0);
            $item->reorder_level = max(0, $item->reorder_level ?? 0);
        });

        static::created(function ($item) {
            if ($item->stock > 0) {
                InventoryLog::create([
                    'inventory_item_id' => $item->id,
                    'delta' => $item->stock,
                    'reason' => 'Initial stock',
                    'reference_type' => 'initial',
                ]);
            }
        });

        static::updating(function ($item) {
            // Ensure non-negative values on update
            if ($item->stock < 0) {
                $item->stock = 0;
            }
            if ($item->price < 0) {
                $item->price = 0;
            }
            if ($item->reorder_level < 0) {
                $item->reorder_level = 0;
            }
        });
    }

    public function logs()
    {
        return $this->hasMany(InventoryLog::class);
    }

    /**
     * Get all batches for this item
     */
    public function batches()
    {
        return $this->hasMany(InventoryBatch::class);
    }

    /**
     * Get active batches only (FEFO order for expiring items, FIFO for non-expiring)
     */
    public function activeBatches()
    {
        return $this->batches()
            ->where('status', 'active')
            ->where('remaining_quantity', '>', 0)
            ->where(function ($q) {
                $q->whereNull('expiration_date')
                  ->orWhere('expiration_date', '>', now());
            })
            ->orderByRaw('COALESCE(expiration_date, "9999-12-31") ASC')
            ->orderBy('received_date', 'asc');
    }

    /**
     * Get total available stock from active batches (FEFO logic)
     */
    public function getBatchStock(): int
    {
        return $this->activeBatches()->sum('remaining_quantity');
    }

    /**
     * Check if item has expiring batches
     */
    public function hasExpiringBatches(): bool
    {
        return $this->batches()
            ->where('status', 'active')
            ->where('remaining_quantity', '>', 0)
            ->whereNotNull('expiration_date')
            ->where('expiration_date', '<=', now()->addDays(30))
            ->where('expiration_date', '>', now())
            ->exists();
    }

    /**
     * Check if item has expired batches
     */
    public function hasExpiredBatches(): bool
    {
        return $this->batches()
            ->where('status', 'expired')
            ->orWhere(function ($q) {
                $q->where('status', 'active')
                  ->whereNotNull('expiration_date')
                  ->where('expiration_date', '<', now());
            })
            ->exists();
    }

    /**
     * Get the next batch for FEFO deduction
     */
    public function getNextFefoBatch(): ?InventoryBatch
    {
        return $this->activeBatches()->first();
    }

    /**
     * Deduct stock using FEFO logic from batches
     * Returns array of batch deductions
     */
    public function deductStockFefo(int $amount, string $reason = '', string $movementType = 'stock_deduction', string $referenceType = 'sale', ?int $referenceId = null): array
    {
        $deductions = [];
        $remainingToDeduct = $amount;

        // Get batches in FEFO order
        $batches = $this->activeBatches()->get();

        foreach ($batches as $batch) {
            if ($remainingToDeduct <= 0) break;

            $deductFromBatch = min($batch->remaining_quantity, $remainingToDeduct);
            $batch->remaining_quantity -= $deductFromBatch;

            // Update batch status if depleted
            if ($batch->remaining_quantity <= 0) {
                $batch->status = 'depleted';
            }
            $batch->save();

            $deductions[] = [
                'batch_id' => $batch->id,
                'batch_no' => $batch->batch_no,
                'amount' => $deductFromBatch,
                'expiration_date' => $batch->expiration_date,
            ];

            $remainingToDeduct -= $deductFromBatch;
        }

        // Update main stock count
        $this->stock -= $amount;
        $this->save();

        // Create log entry
        InventoryLog::create([
            'inventory_item_id' => $this->id,
            'delta' => -$amount,
            'quantity' => $amount,
            'type' => 'sale',
            'movement_type' => $movementType,
            'reason' => $reason,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'stock_before' => $this->stock + $amount,
            'stock_after' => $this->stock,
            'previous_stock' => $this->stock + $amount,
            'new_stock' => $this->stock,
            'performed_by' => auth()->user()?->name,
            'role' => auth()->user()?->role,
            'user_id' => auth()->id(),
            'details' => json_encode(['batch_deductions' => $deductions]),
        ]);

        return $deductions;
    }

    /**
     * Add stock with batch tracking
     */
    public function addBatchStock(int $amount, ?string $batchNo = null, ?string $expirationDate = null, string $notes = '', bool $updateMainStock = true): InventoryBatch
    {
        $batch = $this->batches()->create([
            'batch_no' => $batchNo ?: 'BATCH-' . strtoupper(uniqid()),
            'received_date' => now(),
            'expiration_date' => $expirationDate,
            'quantity' => $amount,
            'remaining_quantity' => $amount,
            'status' => 'active',
            'notes' => $notes,
        ]);

        // Update main stock count (only if not handled by caller)
        if ($updateMainStock) {
            $this->stock += $amount;
            $this->save();
        }

        // Create log entry
        InventoryLog::create([
            'inventory_item_id' => $this->id,
            'delta' => $amount,
            'quantity' => $amount,
            'type' => 'restock',
            'movement_type' => 'batch_restock',
            'reason' => 'Batch restock',
            'reference_type' => 'restock',
            'stock_before' => $this->stock - ($updateMainStock ? $amount : 0),
            'stock_after' => $this->stock,
            'previous_stock' => $this->stock - ($updateMainStock ? $amount : 0),
            'new_stock' => $this->stock,
            'performed_by' => auth()->user()?->name,
            'role' => auth()->user()?->role,
            'user_id' => auth()->id(),
            'details' => json_encode(['batch_id' => $batch->id, 'expiration_date' => $expirationDate]),
        ]);

        return $batch;
    }

    /**
     * Check if this item category needs FEFO (expiration tracking)
     */
    public function needsFefo(): bool
    {
        $fefoCategories = ['Food', 'Health', 'Grooming'];
        return in_array($this->category, $fefoCategories);
    }

    /**
     * Check if item is low on stock
     */
    public function isLowStock(): bool
    {
        return $this->stock > 0 && $this->stock <= $this->reorder_level;
    }

    /**
     * Check if item is out of stock
     */
    public function isOutOfStock(): bool
    {
        return $this->stock <= 0;
    }

    /**
     * Get inventory value (stock * price)
     */
    public function getInventoryValue(): float
    {
        return $this->stock * $this->price;
    }

    /**
     * Check if item is expiring soon (within 30 days)
     */
    public function isExpiringSoon(): bool
    {
        if (!$this->expiry_date) {
            return false;
        }
        return now()->diffInDays($this->expiry_date, false) <= 30;
    }

    /**
     * Decrement stock and create log entry
     */
    public function decrementStock(int $amount, string $reason = ''): void
    {
        $this->stock -= $amount;
        $this->save();

        InventoryLog::create([
            'inventory_item_id' => $this->id,
            'delta' => -$amount,
            'reason' => $reason,
            'reference_type' => 'sale',
        ]);
    }

    /**
     * Increment stock and create log entry
     */
    public function incrementStock(int $amount, string $reason = ''): void
    {
        $this->stock += $amount;
        $this->save();

        InventoryLog::create([
            'inventory_item_id' => $this->id,
            'delta' => $amount,
            'reason' => $reason,
            'reference_type' => 'restock',
        ]);
    }

    public function updateStock(int $amount, string $reason = ''): void
    {
        $this->stock += $amount;
        $this->save();

        InventoryLog::create([
            'inventory_item_id' => $this->id,
            'delta' => $amount,
            'reason' => $reason,
            'reference_type' => $amount >= 0 ? 'restock' : 'sale',
        ]);
    }

    /**
     * Scope: Active items only
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope: In stock items
     */
    public function scopeInStock($query)
    {
        return $query->where('stock', '>', 0);
    }

    /**
     * Scope: Low stock items
     */
    public function scopeLowStock($query)
    {
        return $query->where('stock', '>', 0)
            ->whereColumn('stock', '<=', 'reorder_level');
    }

    /**
     * Scope: Archived items only
     */
    public function scopeArchived($query)
    {
        return $query->where('status', 'archived');
    }

    /**
     * Relationship to user who archived this item
     */
    public function archivedBy()
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    /**
     * Archive the inventory item
     */
    public function archive($reason = '', $userId = null)
    {
        $this->status = 'archived';
        $this->archived_at = now();
        $this->archived_by = $userId ?? auth()->id();
        $this->archive_reason = $reason;
        $this->save();

        // Log the archiving action
        ActivityLog::create([
            'user_id' => $this->archived_by,
            'action' => 'archived',
            'subject_type' => 'InventoryItem',
            'subject_id' => $this->id,
            'description' => "Archived inventory item: {$this->name}. Reason: {$reason}",
            'properties' => [
                'old_status' => 'active',
                'new_status' => 'archived',
                'archive_reason' => $reason,
            ],
        ]);
    }

    /**
     * Unarchive the inventory item
     */
    public function unarchive($userId = null)
    {
        $this->status = 'active';
        $this->archived_at = null;
        $this->archived_by = null;
        $this->archive_reason = null;
        $this->save();

        // Log the unarchiving action
        ActivityLog::create([
            'user_id' => $userId ?? auth()->id(),
            'action' => 'unarchived',
            'subject_type' => 'InventoryItem',
            'subject_id' => $this->id,
            'description' => "Unarchived inventory item: {$this->name}",
            'properties' => [
                'old_status' => 'archived',
                'new_status' => 'active',
            ],
        ]);
    }

    /**
     * Check if item is archived
     */
    public function isArchived(): bool
    {
        return $this->status === 'archived';
    }

    /**
     * Get full URL for product photo
     */
    public function getPhotoUrlAttribute(): ?string
    {
        if (empty($this->photo)) {
            return null;
        }

        if (str_starts_with($this->photo, 'http')) {
            return $this->photo;
        }

        return asset($this->photo);
    }
}
