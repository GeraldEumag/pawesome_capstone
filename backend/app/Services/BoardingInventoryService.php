<?php

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\ServiceItemUsage;
use App\Models\InventoryBatch;
use App\Models\InventoryLog;
use App\Models\Boarding;
use App\Models\Pet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class BoardingInventoryService
{
    /**
     * Record inventory usage for boarding services (food/supplies)
     */
    public function recordInventoryUsage(array $items, int $boardingId, int $petId, string $notes = '', ?int $userId = null): array
    {
        $usages = [];
        $errors = [];
        
        DB::beginTransaction();
        
        try {
            // Get boarding and pet info for snapshots
            $boarding = Boarding::find($boardingId);
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
                $usageType = strtolower((string) ($item['usage_type'] ?? 'food'));
                $movementType = $usageType === 'food' ? 'boarding_food_usage' : 'boarding_supply_usage';
                
                // Use InventoryService for stock deduction (supports FEFO/FIFO)
                $inventoryService = new InventoryService();
                $deductionResult = $inventoryService->deductStock(
                    $item['inventory_item_id'],
                    $item['quantity_used'],
                    'Boarding food/supply usage: ' . ($notes ?: 'Boarding supplies'),
                    $movementType,
                    $boardingId,
                    $item['batch_id'] ?? null
                );
                
                // Record service usage with snapshots
                $usage = ServiceItemUsage::create([
                    'service_type' => ServiceItemUsage::SERVICE_BOARDING,
                    'service_id' => $boardingId,
                    'appointment_id' => null, // Boarding doesn't use appointments
                    'pet_id' => $petId,
                    'customer_id' => $boarding?->customer_id,
                    'customer_email' => $boarding?->customer_email,
                    'inventory_item_id' => $item['inventory_item_id'],
                    'batch_id' => $this->getUsedBatchId($deductionResult),
                    'batch_deductions' => $this->getAllBatchDeductions($deductionResult),
                    'quantity_used' => $item['quantity_used'],
                    'unit' => $item['unit'] ?? $inventoryItem->unit ?? 'pcs',
                    'usage_type' => $usageType,
                    'used_by' => $userId ?? Auth::id(),
                    'role' => Auth::user()?->role,
                    'notes' => $item['notes'] ?? $notes,
                    'charge_amount' => (float) ($item['charge_amount'] ?? 0),
                    // Snapshot fields for historical data
                    'item_name_snapshot' => $inventoryItem->name,
                    'item_sku_snapshot' => $inventoryItem->sku,
                    'pet_name_snapshot' => $pet?->name ?? 'Unknown Pet',
                    'service_name_snapshot' => 'Boarding: ' . ($boarding?->pet_name ?? 'Unknown'),
                ]);
                
                $usages[] = [
                    'item' => $inventoryItem->name,
                    'quantity' => $item['quantity_used'],
                    'usage_type' => $usageType,
                    'movement_type' => $movementType,
                    'stock_before' => $stockBefore,
                    'stock_after' => $deductionResult['stock_after'],
                    'batch_deductions' => $deductionResult['batch_deductions'] ?? [],
                ];
            }
            
            DB::commit();
            
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
     * Get available service consumable items for boarding
     * Filters: Food, Boarding Supplies, active, in stock, service consumable
     */
    public function getAvailableServiceItems(): array
    {
        return InventoryItem::where('is_service_consumable', true)
            ->where('status', 'active')
            ->where('stock', '>', 0)
            ->whereIn('category', ['Food', 'Health', 'Grooming', 'Accessories']) // Boarding relevant categories
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
     * Get usage history for a boarding record
     */
    public function getBoardingUsageHistory(int $boardingId): array
    {
        return ServiceItemUsage::with(['inventoryItem', 'batch', 'user'])
            ->where('service_type', ServiceItemUsage::SERVICE_BOARDING)
            ->where('service_id', $boardingId)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($usage) {
                return [
                    'id' => $usage->id,
                    'item_name' => $usage->item_name_snapshot ?? $usage->inventoryItem->name ?? 'Unknown',
                    'item_sku' => $usage->item_sku_snapshot ?? $usage->inventoryItem->sku ?? 'N/A',
                    'quantity_used' => $usage->quantity_used,
                    'unit' => $usage->unit,
                    'usage_type' => $usage->usage_type ?? 'food',
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
}
