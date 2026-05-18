<?php

namespace App\Services;

use App\Models\Boarding;
use App\Models\BookingAddOn;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\AddOn;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class BoardingAddOnInventoryService
{
    /**
     * Deduct inventory for boarding add-ons when a booking is approved/checked-in
     */
    public function deductAddOnInventory(Boarding $boarding, string $performedByRole = 'receptionist'): array
    {
        $results = [
            'success' => false,
            'deducted_items' => [],
            'errors' => [],
            'insufficient_stock' => []
        ];

        return DB::transaction(function () use ($boarding, $performedByRole, &$results) {
            // Get all inventory-backed add-ons for this booking that haven't been deducted yet
            $bookingAddOns = BookingAddOn::where('booking_id', $boarding->id)
                ->where('add_on_type', 'inventory_item')
                ->whereNotNull('inventory_item_id')
                ->where('deduction_status', 'pending')
                ->with(['addOn', 'inventoryItem'])
                ->get();

            if ($bookingAddOns->isEmpty()) {
                $results['success'] = true;
                $results['message'] = 'No inventory-backed add-ons to deduct';
                return $results;
            }

            // Check stock availability for all items first
            foreach ($bookingAddOns as $bookingAddOn) {
                $requiredQuantity = $this->calculateRequiredQuantity($bookingAddOn, $boarding);
                
                if (!$bookingAddOn->inventoryItem) {
                    $results['errors'][] = "Inventory item not found for add-on: {$bookingAddOn->name}";
                    continue;
                }

                if ($bookingAddOn->inventoryItem->stock < $requiredQuantity) {
                    $results['insufficient_stock'][] = [
                        'add_on_name' => $bookingAddOn->name,
                        'required' => $requiredQuantity,
                        'available' => $bookingAddOn->inventoryItem->stock
                    ];
                }
            }

            // If there are errors or insufficient stock, rollback
            if (!empty($results['errors']) || !empty($results['insufficient_stock'])) {
                $results['success'] = false;
                if (!empty($results['insufficient_stock'])) {
                    $results['message'] = 'Insufficient stock for some add-ons';
                } else {
                    $results['message'] = 'Errors found during inventory deduction';
                }
                throw new \Exception(implode('; ', array_merge($results['errors'], array_column($results['insufficient_stock'], 'add_on_name'))));
            }

            // Process deductions
            foreach ($bookingAddOns as $bookingAddOn) {
                $requiredQuantity = $this->calculateRequiredQuantity($bookingAddOn, $boarding);
                $inventoryItem = $bookingAddOn->inventoryItem;

                // Lock the inventory row for update
                $lockedItem = InventoryItem::where('id', $inventoryItem->id)
                    ->lockForUpdate()
                    ->first();

                if ($lockedItem->stock < $requiredQuantity) {
                    throw new \Exception("Stock changed during processing for {$bookingAddOn->name}");
                }

                // Update stock
                $previousStock = $lockedItem->stock;
                $newStock = $previousStock - $requiredQuantity;
                $lockedItem->update(['stock' => $newStock]);

                // Create inventory log
                InventoryLog::create([
                    'inventory_item_id' => $inventoryItem->id,
                    'movement_type' => 'boarding_addon_usage',
                    'type' => 'deduction',
                    'quantity' => $requiredQuantity,
                    'delta' => -$requiredQuantity,
                    'previous_stock' => $previousStock,
                    'new_stock' => $newStock,
                    'reference_id' => $boarding->id,
                    'reference_type' => 'boarding',
                    'reference' => "Pet Hotel add-on usage for booking #{$boarding->id}",
                    'performed_by' => Auth::user()?->name ?: 'System',
                    'role' => $performedByRole,
                    'user_id' => Auth::id(),
                    'details' => json_encode([
                        'booking_id' => $boarding->id,
                        'add_on_id' => $bookingAddOn->add_on_id,
                        'add_on_name' => $bookingAddOn->name,
                        'charge_type' => $bookingAddOn->charge_type,
                        'selected_quantity' => $bookingAddOn->quantity,
                        'number_of_days' => $bookingAddOn->number_of_days,
                        'quantity_per_unit' => $bookingAddOn->addOn->quantity_per_unit ?? 1,
                        'calculated_quantity' => $requiredQuantity,
                        'pet_name' => $boarding->pet_name,
                        'customer_name' => $boarding->customer_name
                    ])
                ]);

                // Update booking add-on with deduction info
                $bookingAddOn->update([
                    'inventory_deducted_at' => now(),
                    'inventory_deducted_by' => Auth::id(),
                    'inventory_deducted_quantity' => $requiredQuantity,
                    'deduction_status' => 'deducted'
                ]);

                $results['deducted_items'][] = [
                    'add_on_name' => $bookingAddOn->name,
                    'quantity_deducted' => $requiredQuantity,
                    'previous_stock' => $previousStock,
                    'new_stock' => $newStock
                ];
            }

            $results['success'] = true;
            $results['message'] = 'Successfully deducted inventory for add-ons';
            return $results;
        });
    }

    /**
     * Restore inventory for boarding add-ons when a booking is cancelled
     */
    public function restoreAddOnInventory(Boarding $boarding, string $performedByRole = 'receptionist'): array
    {
        $results = [
            'success' => false,
            'restored_items' => [],
            'errors' => []
        ];

        return DB::transaction(function () use ($boarding, $performedByRole, &$results) {
            // Get all inventory-backed add-ons that were deducted
            $bookingAddOns = BookingAddOn::where('booking_id', $boarding->id)
                ->where('add_on_type', 'inventory_item')
                ->whereNotNull('inventory_item_id')
                ->where('deduction_status', 'deducted')
                ->with(['addOn', 'inventoryItem'])
                ->get();

            if ($bookingAddOns->isEmpty()) {
                $results['success'] = true;
                $results['message'] = 'No inventory-backed add-ons to restore';
                return $results;
            }

            foreach ($bookingAddOns as $bookingAddOn) {
                $deductedQuantity = $bookingAddOn->inventory_deducted_quantity;
                $inventoryItem = $bookingAddOn->inventoryItem;

                if (!$inventoryItem) {
                    $results['errors'][] = "Inventory item not found for add-on: {$bookingAddOn->name}";
                    continue;
                }

                // Lock the inventory row for update
                $lockedItem = InventoryItem::where('id', $inventoryItem->id)
                    ->lockForUpdate()
                    ->first();

                // Update stock (restore)
                $previousStock = $lockedItem->stock;
                $newStock = $previousStock + $deductedQuantity;
                $lockedItem->update(['stock' => $newStock]);

                // Create inventory log for restoration
                InventoryLog::create([
                    'inventory_item_id' => $inventoryItem->id,
                    'movement_type' => 'boarding_addon_restore',
                    'type' => 'restoration',
                    'quantity' => $deductedQuantity,
                    'delta' => $deductedQuantity,
                    'previous_stock' => $previousStock,
                    'new_stock' => $newStock,
                    'reference_id' => $boarding->id,
                    'reference_type' => 'boarding',
                    'reference' => "Pet Hotel add-on restoration for cancelled booking #{$boarding->id}",
                    'performed_by' => Auth::user()?->name ?: 'System',
                    'role' => $performedByRole,
                    'user_id' => Auth::id(),
                    'details' => json_encode([
                        'booking_id' => $boarding->id,
                        'add_on_id' => $bookingAddOn->add_on_id,
                        'add_on_name' => $bookingAddOn->name,
                        'charge_type' => $bookingAddOn->charge_type,
                        'selected_quantity' => $bookingAddOn->quantity,
                        'number_of_days' => $bookingAddOn->number_of_days,
                        'quantity_per_unit' => $bookingAddOn->addOn->quantity_per_unit ?? 1,
                        'restored_quantity' => $deductedQuantity,
                        'pet_name' => $boarding->pet_name,
                        'customer_name' => $boarding->customer_name
                    ])
                ]);

                // Update booking add-on with restoration info
                $bookingAddOn->update([
                    'deduction_status' => 'restored'
                ]);

                $results['restored_items'][] = [
                    'add_on_name' => $bookingAddOn->name,
                    'quantity_restored' => $deductedQuantity,
                    'previous_stock' => $previousStock,
                    'new_stock' => $newStock
                ];
            }

            $results['success'] = true;
            $results['message'] = 'Successfully restored inventory for add-ons';
            return $results;
        });
    }

    /**
     * Calculate the required inventory quantity for a booking add-on
     */
    private function calculateRequiredQuantity(BookingAddOn $bookingAddOn, Boarding $boarding): int
    {
        $addOn = $bookingAddOn->addOn;
        $selectedQuantity = $bookingAddOn->quantity;
        $quantityPerUnit = $addOn->quantity_per_unit ?? 1;

        if ($bookingAddOn->charge_type === 'per_day') {
            $numberOfDays = $bookingAddOn->number_of_days ?? $boarding->number_of_days ?? 1;
            return $quantityPerUnit * $selectedQuantity * $numberOfDays;
        } else {
            // one_time
            return $quantityPerUnit * $selectedQuantity;
        }
    }

    /**
     * Check if a booking has any inventory-backed add-ons pending deduction
     */
    public function hasPendingInventoryDeductions(Boarding $boarding): bool
    {
        return BookingAddOn::where('booking_id', $boarding->id)
            ->where('add_on_type', 'inventory_item')
            ->whereNotNull('inventory_item_id')
            ->where('deduction_status', 'pending')
            ->exists();
    }

    /**
     * Get inventory-backed add-ons for a booking with stock status
     */
    public function getInventoryAddOnsWithStockStatus(Boarding $boarding): array
    {
        $bookingAddOns = BookingAddOn::where('booking_id', $boarding->id)
            ->where('add_on_type', 'inventory_item')
            ->whereNotNull('inventory_item_id')
            ->with(['addOn', 'inventoryItem'])
            ->get();

        $result = [];
        foreach ($bookingAddOns as $bookingAddOn) {
            $requiredQuantity = $this->calculateRequiredQuantity($bookingAddOn, $boarding);
            $availableStock = $bookingAddOn->inventoryItem?->stock ?? 0;
            
            $result[] = [
                'booking_add_on_id' => $bookingAddOn->id,
                'add_on_name' => $bookingAddOn->name,
                'add_on_type' => $bookingAddOn->add_on_type,
                'charge_type' => $bookingAddOn->charge_type,
                'selected_quantity' => $bookingAddOn->quantity,
                'number_of_days' => $bookingAddOn->number_of_days,
                'quantity_per_unit' => $bookingAddOn->addOn->quantity_per_unit ?? 1,
                'required_quantity' => $requiredQuantity,
                'available_stock' => $availableStock,
                'has_sufficient_stock' => $availableStock >= $requiredQuantity,
                'deduction_status' => $bookingAddOn->deduction_status,
                'inventory_deducted_at' => $bookingAddOn->inventory_deducted_at,
                'inventory_deducted_quantity' => $bookingAddOn->inventory_deducted_quantity
            ];
        }

        return $result;
    }
}
