<?php

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\ServiceItemUsage;
use App\Models\InventoryBatch;
use App\Models\InventoryLog;
use App\Models\Grooming;
use App\Models\Pet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class GroomingInventoryService
{
    /**
     * Record inventory usage for grooming services (shampoos, conditioners, supplies)
     */
    public function recordInventoryUsage(array $items, int $groomingId, int $petId, string $notes = '', ?int $userId = null): array
    {
        $usages = [];
        $errors = [];
        
        DB::beginTransaction();
        
        try {
            // Get grooming and pet info for snapshots
            $grooming = Grooming::find($groomingId);
            $pet = Pet::find($petId);
            
            foreach ($items as $item) {
                $validation = $this->validateUsageItem($item);
                if (!$validation['valid']) {
                    $errors[] = $validation['error'];
                    continue;
                }
                
                $inventoryItem = InventoryItem::findOrFail($item['inventory_item_id']);
                
                // Check if item is service consumable
                if (!$inventoryItem->is_service_consumable) {
                    $errors[] = "Item '{$inventoryItem->name}' is not marked as service consumable";
                    continue;
                }
                
                // Check stock availability
                if ($inventoryItem->stock < $item['quantity_used']) {
                    $errors[] = "Insufficient stock for '{$inventoryItem->name}'. Available: {$inventoryItem->stock}, Requested: {$item['quantity_used']}";
                    continue;
                }
                
                $stockBefore = $inventoryItem->stock;
                
                // Use InventoryService for stock deduction (supports FEFO/FIFO)
                $inventoryService = new InventoryService();
                $deductionResult = $inventoryService->deductStock(
                    $item['inventory_item_id'],
                    $item['quantity_used'],
                    'Grooming supply usage: ' . ($notes ?: 'Grooming supplies'),
                    'grooming_usage',
                    $groomingId,
                    $item['batch_id'] ?? null
                );
                
                // Record service usage with snapshots
                $usage = ServiceItemUsage::create([
                    'service_type' => ServiceItemUsage::SERVICE_GROOMING,
                    'service_id' => $groomingId,
                    'appointment_id' => null, // Grooming uses grooming_id not appointment_id
                    'pet_id' => $petId,
                    'customer_id' => $grooming?->customer_id,
                    'customer_email' => $grooming?->customer?->email,
                    'inventory_item_id' => $item['inventory_item_id'],
                    'batch_id' => $this->getUsedBatchId($deductionResult),
                    'batch_deductions' => $this->getAllBatchDeductions($deductionResult),
                    'quantity_used' => $item['quantity_used'],
                    'unit' => $item['unit'] ?? $inventoryItem->unit ?? 'pcs',
                    'usage_type' => $item['usage_type'] ?? 'supply',
                    'used_by' => $userId ?? Auth::id(),
                    'role' => Auth::user()?->role,
                    'notes' => $item['notes'] ?? $notes,
                    'charge_amount' => (float) ($item['charge_amount'] ?? 0),
                    // Snapshot fields for historical data
                    'item_name_snapshot' => $inventoryItem->name,
                    'item_sku_snapshot' => $inventoryItem->sku,
                    'pet_name_snapshot' => $pet?->name ?? 'Unknown Pet',
                    'service_name_snapshot' => 'Grooming: ' . ($grooming?->service ?? 'Pet Grooming'),
                ]);
                
                $usages[] = [
                    'item' => $inventoryItem->name,
                    'quantity' => $item['quantity_used'],
                    'stock_before' => $stockBefore,
                    'stock_after' => $deductionResult['stock_after'],
                    'batch_deductions' => $deductionResult['batch_deductions'] ?? [],
                ];
            }
            
            DB::commit();
            
            // Check for low stock after deductions and create notifications
            $this->checkAndNotifyLowStock($usages);
            
            return [
                'success' => empty($errors),
                'message' => empty($errors) 
                    ? 'Inventory usage recorded successfully.' 
                    : 'Some items could not be processed.',
                'usages' => $usages,
                'errors' => $errors,
                'total_items' => count($items),
                'processed_items' => count($usages),
            ];
            
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }
    }
    
    /**
     * Validate individual usage item
     */
    private function validateUsageItem(array $item): array
    {
        if (empty($item['inventory_item_id'])) {
            return ['valid' => false, 'error' => 'Inventory item ID is required'];
        }
        
        if (empty($item['quantity_used']) || $item['quantity_used'] <= 0) {
            return ['valid' => false, 'error' => 'Quantity used must be greater than 0'];
        }
        
        // Check if inventory item exists and is active
        $inventoryItem = InventoryItem::find($item['inventory_item_id']);
        if (!$inventoryItem) {
            return ['valid' => false, 'error' => 'Inventory item not found'];
        }
        
        if ($inventoryItem->status !== 'active') {
            return ['valid' => false, 'error' => 'Inventory item is not active'];
        }
        
        return ['valid' => true];
    }
    
    /**
     * Get the primary batch ID that was used from deduction result.
     * Full batch deductions are available in $deductionResult['batch_deductions'].
     */
    private function getUsedBatchId(array $deductionResult): ?int
    {
        if (!empty($deductionResult['batch_deductions']) && count($deductionResult['batch_deductions']) > 0) {
            return $deductionResult['batch_deductions'][0]['batch_id'];
        }

        return null;
    }

    /**
     * Get all batch deductions from deduction result (for audit trail)
     */
    private function getAllBatchDeductions(array $deductionResult): array
    {
        return $deductionResult['batch_deductions'] ?? [];
    }
    
    /**
     * Get available service consumable items for grooming
     * Filters: Grooming, Grooming Supplies, active, in stock, service consumable
     */
    public function getAvailableServiceItems(): array
    {
        return InventoryItem::where('is_service_consumable', true)
            ->where('status', 'active')
            ->where('stock', '>', 0)
            ->whereIn('category', ['Grooming', 'Health', 'Accessories']) // Grooming relevant categories
            ->with(['batches' => function ($q) {
                $q->where('status', 'active')
                  ->where('remaining_quantity', '>', 0)
                  ->where(function ($bq) {
                      $bq->whereNull('expiration_date')
                         ->orWhere('expiration_date', '>', now());
                  })
                  ->orderByRaw('COALESCE(expiration_date, "9999-12-31") ASC')
                  ->orderBy('received_date', 'asc');
            }])
            ->select('id', 'name', 'sku', 'stock', 'category', 'brand', 'status', 'is_service_consumable', 'requires_expiry_tracking', 'issue_method')
            ->orderBy('name')
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'sku' => $item->sku,
                    'stock' => $item->stock,
                    'quantity' => $item->stock,
                    'unit' => 'pcs',
                    'category' => $item->category,
                    'type' => $item->category,
                    'brand' => $item->brand,
                    'status' => $item->status,
                    'needs_fefo' => $item->needsFefo(),
                    'issue_method' => $item->issue_method ?? 'FEFO',
                    'batches' => $item->batches->map(fn ($batch) => [
                        'batch_id' => $batch->id,
                        'batch_no' => $batch->batch_no,
                        'expiration_date' => $batch->expiration_date,
                        'remaining_quantity' => $batch->remaining_quantity,
                        'is_expiring_soon' => $batch->isExpiringSoon(),
                        'days_until_expiry' => $batch->expiration_date
                            ? now()->diffInDays($batch->expiration_date, false)
                            : null,
                    ])->toArray(),
                ];
            })
            ->toArray();
    }
    
    /**
     * Get usage history for a grooming appointment
     */
    public function getGroomingUsageHistory(int $groomingId): array
    {
        return ServiceItemUsage::with(['inventoryItem', 'batch', 'user'])
            ->where('service_type', ServiceItemUsage::SERVICE_GROOMING)
            ->where('service_id', $groomingId)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($usage) {
                return [
                    'id' => $usage->id,
                    'item_name' => $usage->item_name_snapshot ?? $usage->inventoryItem->name ?? 'Unknown',
                    'item_sku' => $usage->item_sku_snapshot ?? $usage->inventoryItem->sku ?? 'N/A',
                    'quantity_used' => $usage->quantity_used,
                    'unit' => $usage->unit,
                    'notes' => $usage->notes,
                    'used_by' => $usage->user->name ?? 'Unknown',
                    'created_at' => $usage->created_at->toIso8601String(),
                    'batch_info' => $usage->batch ? [
                        'batch_no' => $usage->batch->batch_no,
                        'expiration_date' => $usage->batch->expiration_date,
                    ] : null,
                ];
            })
            ->toArray();
    }
    
    /**
     * Check for low stock after usage and create notifications
     */
    private function checkAndNotifyLowStock(array $usages): void
    {
        foreach ($usages as $usage) {
            // Only check items that were actually processed
            if (empty($usage['stock_after'])) continue;
            
            // Get the current inventory item to check reorder level
            $inventoryItem = InventoryItem::where('name', $usage['item'])->first();
            if (!$inventoryItem) continue;
            
            // Check if stock is at or below reorder level
            $reorderLevel = $inventoryItem->reorder_level ?? 0;
            $threshold = $inventoryItem->threshold ?? $reorderLevel;
            
            if ($usage['stock_after'] <= $threshold && $usage['stock_before'] > $threshold) {
                // Stock just reached low level - create notification
                $this->createLowStockNotification($inventoryItem, $usage);
            }
        }
    }
    
    /**
     * Create low stock notification for inventory/admin roles
     */
    private function createLowStockNotification(InventoryItem $item, array $usage): void
    {
        try {
            // Get admin and inventory role users
            $staffUsers = \App\Models\User::whereIn('role', ['admin', 'inventory', 'manager'])->get();
            
            foreach ($staffUsers as $user) {
                \App\Services\NotificationService::createNotification(
                    $user->id,
                    'Low Stock Alert',
                    "Item '{$item->name}' is running low on stock.\n" .
                    "Current stock: {$usage['stock_after']}\n" .
                    "Reorder level: " . ($item->reorder_level ?? 0) . "\n" .
                    "Used in grooming service.",
                    'warning',
                    'inventory_item',
                    $item->id,
                    [
                        'item_name' => $item->name,
                        'current_stock' => $usage['stock_after'],
                        'reorder_level' => $item->reorder_level ?? 0,
                        'service_type' => 'grooming',
                        'usage_quantity' => $usage['quantity']
                    ]
                );
            }
        } catch (\Exception $e) {
            // Log error but don't fail the inventory usage
            \Log::error('Failed to create low stock notification', [
                'item_id' => $item->id,
                'error' => $e->getMessage()
            ]);
        }
    }
}
