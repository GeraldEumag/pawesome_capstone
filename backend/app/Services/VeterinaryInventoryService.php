<?php

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\ServiceItemUsage;
use App\Models\InventoryBatch;
use App\Models\InventoryLog;
use App\Models\VetAppointment;
use App\Models\Pet;
use App\Models\Appointment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class VeterinaryInventoryService
{
    /**
     * Record inventory usage for veterinary services
     */
    public function recordInventoryUsage(array $items, int $appointmentId, int $petId, string $notes = '', ?int $userId = null): array
    {
        $usages = [];
        $changes = [];
        
        try {
            $appointment = Appointment::with(['customer', 'pet'])->find($appointmentId);
            $pet = Pet::find($petId);
            $requestedItems = $this->normalizeRequestedItems($items);

            DB::beginTransaction();

            $existingUsages = ServiceItemUsage::with('inventoryItem')
                ->where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
                ->where('service_id', $appointmentId)
                ->whereNotNull('inventory_item_id')
                ->get()
                ->keyBy('inventory_item_id');

            $inventoryService = new InventoryService();
            $submittedIds = array_keys($requestedItems);

            foreach ($requestedItems as $inventoryItemId => $item) {
                $validation = $this->validateUsageItem($item);
                if (!$validation['valid']) {
                    throw new \Exception($validation['error']);
                }

                $inventoryItem = InventoryItem::lockForUpdate()->findOrFail($inventoryItemId);

                if (!$inventoryItem->is_service_consumable) {
                    throw new \Exception("Item '{$inventoryItem->name}' is not marked as service consumable");
                }

                $existing = $existingUsages->get($inventoryItemId);
                $oldQuantity = (int) ($existing?->quantity_used ?? 0);
                $newQuantity = (int) $item['quantity_used'];
                $delta = $newQuantity - $oldQuantity;
                $stockBefore = (int) $inventoryItem->stock;
                $stockAfter = $stockBefore;
                $batchId = $existing?->batch_id;

                if ($delta > 0) {
                    if ($inventoryItem->stock < $delta) {
                        throw new \Exception("Insufficient stock for '{$inventoryItem->name}'. Available: {$inventoryItem->stock}, Additional needed: {$delta}");
                    }

                    $deductionResult = $inventoryService->deductStock(
                        $inventoryItemId,
                        $delta,
                        'Veterinary service add-on usage: ' . ($notes ?: 'Medical supplies'),
                        'vet_usage',
                        $appointmentId,
                        $item['batch_id'] ?? null
                    );
                    $stockAfter = $deductionResult['stock_after'];
                    $batchId = $this->getUsedBatchId($deductionResult) ?? $batchId;
                } elseif ($delta < 0) {
                    $restoreQuantity = abs($delta);
                    $restoreResult = $inventoryService->addStock(
                        $inventoryItemId,
                        $restoreQuantity,
                        'Veterinary service add-on quantity reduced: ' . ($notes ?: 'Medical supplies'),
                        'vet_usage',
                        $appointmentId
                    );
                    $stockAfter = $restoreResult['stock_after'];
                }

                // Get or create vet appointment record for foreign key constraint
                $vetAppointment = \DB::table('vet_appointments')
                    ->where('pet_id', $petId)
                    ->first();
                    
                $vetAppointmentId = $vetAppointment ? $vetAppointment->id : null;

                $unitPrice = (float) ($item['unit_price'] ?? $item['charge_amount'] ?? $inventoryItem->price ?? 0);
                $totalPrice = round($newQuantity * $unitPrice, 2);
                $payload = [
                    'service_type' => ServiceItemUsage::SERVICE_VETERINARY,
                    'service_id' => $appointmentId,
                    'appointment_id' => $vetAppointmentId,
                    'pet_id' => $petId,
                    'customer_id' => $appointment?->customer_id,
                    'customer_email' => $appointment?->customer?->email,
                    'inventory_item_id' => $inventoryItemId,
                    'batch_id' => $batchId,
                    'batch_deductions' => $delta > 0 ? $this->getAllBatchDeductions($deductionResult) : null,
                    'quantity_used' => $newQuantity,
                    'unit' => $item['unit'] ?? $inventoryItem->unit ?? 'pcs',
                    'usage_type' => $item['usage_type'] ?? 'service_addon',
                    'used_by' => $userId ?? Auth::id(),
                    'role' => Auth::user()?->role ?? 'veterinary',
                    'notes' => $item['notes'] ?? $notes,
                    'item_type' => ServiceItemUsage::ITEM_INVENTORY_USAGE,
                    'description' => $item['description'] ?? $inventoryItem->name,
                    'unit_price' => $unitPrice,
                    'total_price' => $totalPrice,
                    'charge_amount' => $totalPrice,
                    'is_billable' => $unitPrice > 0,
                    'is_paid' => false,
                    'item_name_snapshot' => $inventoryItem->name,
                    'item_sku_snapshot' => $inventoryItem->sku,
                    'pet_name_snapshot' => $pet?->name ?? 'Unknown Pet',
                    'service_name_snapshot' => $appointment?->service?->name ?? 'Veterinary consultation',
                ];

                $usage = $existing
                    ? tap($existing)->update($payload)
                    : ServiceItemUsage::create($payload);

                $usages[] = [
                    'id' => $usage->id,
                    'item' => $inventoryItem->name,
                    'quantity' => $newQuantity,
                    'previous_quantity' => $oldQuantity,
                    'delta' => $delta,
                    'stock_before' => $stockBefore,
                    'stock_after' => $stockAfter,
                ];

                if ($delta !== 0) {
                    $changes[] = "{$inventoryItem->name}: {$oldQuantity} -> {$newQuantity}";
                }
            }

            $removedUsages = $existingUsages->reject(fn ($usage, $inventoryItemId) => in_array((int) $inventoryItemId, $submittedIds, true));
            foreach ($removedUsages as $usage) {
                $inventoryItem = InventoryItem::lockForUpdate()->find($usage->inventory_item_id);
                if ($inventoryItem && $usage->quantity_used > 0) {
                    $stockBefore = (int) $inventoryItem->stock;
                    $restoreResult = $inventoryService->addStock(
                        (int) $usage->inventory_item_id,
                        (int) $usage->quantity_used,
                        'Veterinary service add-on removed: ' . ($notes ?: 'Medical supplies'),
                        'vet_usage',
                        $appointmentId
                    );
                    $usages[] = [
                        'id' => $usage->id,
                        'item' => $inventoryItem->name,
                        'quantity' => 0,
                        'previous_quantity' => (int) $usage->quantity_used,
                        'delta' => -((int) $usage->quantity_used),
                        'stock_before' => $stockBefore,
                        'stock_after' => $restoreResult['stock_after'],
                    ];
                    $changes[] = "{$inventoryItem->name}: {$usage->quantity_used} -> 0";
                }
                $usage->delete();
            }

            \App\Services\ServiceBillingService::syncServicePaymentState(ServiceItemUsage::SERVICE_VETERINARY, $appointmentId);
            
            DB::commit();
            
            // Check for low stock after deductions and create notifications
            $this->checkAndNotifyLowStock($usages);
            
            return [
                'success' => true,
                'message' => empty($changes)
                    ? 'Service add-ons already up to date.'
                    : 'Service add-ons saved successfully.',
                'usages' => $usages,
                'errors' => [],
                'total_items' => count($requestedItems),
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

    private function normalizeRequestedItems(array $items): array
    {
        $normalized = [];

        foreach ($items as $item) {
            if (!is_array($item) || empty($item['inventory_item_id'])) {
                continue;
            }

            $inventoryItemId = (int) $item['inventory_item_id'];
            $quantity = max(0, (int) ($item['quantity_used'] ?? $item['quantity'] ?? 0));
            if ($quantity <= 0) {
                continue;
            }

            if (isset($normalized[$inventoryItemId])) {
                $normalized[$inventoryItemId]['quantity_used'] += $quantity;
                continue;
            }

            $item['inventory_item_id'] = $inventoryItemId;
            $item['quantity_used'] = $quantity;
            $normalized[$inventoryItemId] = $item;
        }

        return $normalized;
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
     * Get available service consumable items for veterinary
     */
    public function getAvailableServiceItems(): array
    {
        return InventoryItem::where('is_service_consumable', true)
            ->where('status', 'active')
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
            ->select('id', 'name', 'sku', 'description', 'stock', 'category', 'status', 'price', 'reorder_level', 'is_service_consumable', 'requires_expiry_tracking', 'issue_method')
            ->orderBy('name')
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'sku' => $item->sku,
                    'description' => $item->description,
                    'stock' => $item->stock,
                    'available_stock' => $item->stock,
                    'quantity' => $item->stock,
                    'unit' => 'pcs',
                    'category' => $item->category,
                    'type' => $item->category,
                    'price' => (float) ($item->price ?? 0),
                    'unit_price' => (float) ($item->price ?? 0),
                    'default_quantity' => 1,
                    'is_inventory_linked' => true,
                    'inventory_item_id' => $item->id,
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
     * Get usage history for an appointment
     */
    public function getAppointmentUsageHistory(int $appointmentId): array
    {
        return ServiceItemUsage::with(['inventoryItem', 'batch', 'user'])
            ->where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
            ->where('service_id', $appointmentId)
            ->whereNotNull('inventory_item_id')
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($usage) {
                return [
                    'id' => $usage->id,
                    'inventory_item_id' => $usage->inventory_item_id,
                    'item_name' => $usage->inventoryItem->name ?? 'Unknown',
                    'description' => $usage->description,
                    'quantity_used' => $usage->quantity_used,
                    'unit' => $usage->unit,
                    'unit_price' => (float) ($usage->unit_price ?? 0),
                    'total_price' => (float) ($usage->total_price ?? 0),
                    'is_billable' => (bool) $usage->is_billable,
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
                    "Used in veterinary service.",
                    'warning',
                    'inventory_item',
                    $item->id,
                    [
                        'item_name' => $item->name,
                        'current_stock' => $usage['stock_after'],
                        'reorder_level' => $item->reorder_level ?? 0,
                        'service_type' => 'veterinary',
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
