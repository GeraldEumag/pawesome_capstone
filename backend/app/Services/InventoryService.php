<?php

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\InventoryBatch;
use App\Models\InventoryLog;
use App\Models\InventoryMonthlyAudit;
use App\Models\InventoryReturn;
use App\Models\InventoryStockRequest;
use App\Models\Notification;
use App\Models\ActivityLog;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class InventoryService
{
    /**
     * Standardized status values
     */
    public const STATUS_ACTIVE = 'active';
    public const STATUS_INACTIVE = 'inactive';
    public const STATUS_DISCONTINUED = 'discontinued';

    /**
     * Valid status values
     */
    public const VALID_STATUSES = [
        self::STATUS_ACTIVE,
        self::STATUS_INACTIVE,
        self::STATUS_DISCONTINUED,
    ];

    public const PERMANENT_DELETE_REASONS = [
        'expired' => 'Expired medicine or product',
        'damaged' => 'Damaged or contaminated',
        'discontinued' => 'Withdrawn or discontinued',
        'duplicate' => 'Duplicate inventory record',
        'entered_in_error' => 'Entered in error',
        'other' => 'Other',
    ];

    /**
     * Valid category values
     */
    public const VALID_CATEGORIES = ['Food', 'Accessories', 'Grooming', 'Toys', 'Health', 'Services'];

    /**
     * Create a new inventory item
     */
    public function createItem(array $data): array
    {
        return DB::transaction(function () use ($data) {
            $validated = $this->validateItemData($data, true, null);

        // Auto-generate SKU if not provided (retry on the unlikely collision
        // instead of failing the create with a uniqueness error).
        if (empty($validated['sku'])) {
            $validated['sku'] = $this->generateUniqueSKU($validated['category']);
        }

        // Sellable items must always carry a barcode for POS scanning; when
        // the caller omits one, generate a unique EAN-13 automatically.
        $isSellable = array_key_exists('is_sellable', $validated)
            ? (bool) $validated['is_sellable']
            : true;
        if ($isSellable && empty($validated['barcode'])) {
            $validated['barcode'] = $this->generateUniqueBarcode();
        }

        // Use quantity or stock_quantity if stock is not provided (frontend compatibility)
        $stock = $validated['stock'] ?? $validated['stock_quantity'] ?? ($validated['quantity'] ?? 0);
        $validated['stock'] = (int) $stock;

        // Remove extra fields that don't exist in database
        unset($validated['stock_quantity'], $validated['quantity']);

        // Handle batch data if provided (for FEFO items)
        $batchData = $data['batchData'] ?? null;
        if ($batchData) {
            // Use batch quantity as the stock quantity
            $validated['stock'] = (int) ($batchData['quantity'] ?? $stock);
        }

        // Set default status
        $validated['status'] = $validated['status'] ?? self::STATUS_ACTIVE;

        // Item-level supplier falls back to the initial batch's supplier so the
        // product record shows where it was received from.
        if (empty($validated['supplier']) && !empty($batchData['supplier'] ?? null)) {
            $validated['supplier'] = $batchData['supplier'];
            $validated['supplier_id'] ??= Supplier::where('name', $validated['supplier'])->value('id');
        }

        $item = InventoryItem::create($validated);

        // Create initial batch if batch data provided
        if ($batchData && $validated['stock'] > 0) {
            $item->addBatchStock(
                (int) $batchData['quantity'],
                $batchData['batch_no'] ?? null,
                $batchData['expiration_date'] ?? null,
                $batchData['notes'] ?? 'Initial stock batch',
                false, // Don't update main stock here
                $batchData['manufacturing_date'] ?? null,
                $batchData['supplier'] ?? null,
                isset($batchData['unit_cost']) ? (float) $batchData['unit_cost'] : null,
                $batchData['proof_photo'] ?? null,
                $batchData['received_date'] ?? null
            );
        } elseif ($validated['stock'] > 0) {
            // Create default batch for non-FEFO items with stock
            $item->addBatchStock(
                $validated['stock'],
                'INITIAL-' . strtoupper(uniqid()),
                null,
                'Initial stock',
                false // Don't update main stock here
            );
        }

            // Ensure stock field is synchronized with batch totals
            if ($item->batches()->exists()) {
                $item->stock = $item->getBatchStock();
                $item->save();
            }

            return [
                'message' => 'Item created successfully',
                'item' => $item->fresh()->load('batches'),
                'stock_action' => 'initial',
                'new_stock' => $item->stock,
                'has_batch' => $batchData !== null,
                'batch_total' => $item->batches()->sum('remaining_quantity'),
            ];
        });
    }

    /**
     * Fields that move inventory quantities. Product updates must never carry
     * them — stock only changes through the dedicated receiving/adjustment
     * endpoints, which keep batches, movement logs and notifications in sync.
     */
    private const STOCK_MUTATION_FIELDS = ['stock', 'quantity', 'stock_quantity', 'add_stock'];

    /**
     * Update an existing inventory item (product information only)
     */
    public function updateItem(int $id, array $data): array
    {
        return DB::transaction(function () use ($id, $data) {
            // Reject outright — do not silently strip — so callers fail loudly
            // instead of believing a stock change was applied.
            $prohibited = array_intersect(self::STOCK_MUTATION_FIELDS, array_keys($data));
            if (!empty($prohibited)) {
                throw ValidationException::withMessages([
                    'stock' => 'Stock quantity cannot be changed through product updates. Use the stock receiving or stock adjustment endpoints instead.',
                ]);
            }

            $item = InventoryItem::lockForUpdate()->findOrFail($id);
            $validated = $this->validateItemData($data, false, $id);

            $item->update($validated);

            return [
                'message' => 'Item updated successfully',
                'item' => $item->fresh(),
                'stock_action' => 'unchanged',
                'previous_stock' => $item->stock,
                'new_stock' => $item->stock,
            ];
        });
    }

    /**
     * Archive an inventory item (replaces delete)
     */
    public function archiveItem(int $id, string $reason = ''): array
    {
        return DB::transaction(function () use ($id, $reason) {
            $item = InventoryItem::lockForUpdate()->findOrFail($id);

        // Check if item has stock - block archive if stock exists
        if ($item->stock > 0) {
            throw new \Exception("Cannot archive item with remaining stock. Current stock: {$item->stock}. Please adjust stock to 0 first.");
        }

        // Check if item has active batches
        $activeBatchesCount = $item->batches()
            ->where('status', 'active')
            ->where('remaining_quantity', '>', 0)
            ->count();

        if ($activeBatchesCount > 0) {
            throw new \Exception("Cannot archive item with active batches. Please dispose of or deplete all batches first.");
        }

        // Archive the item
        $item->update([
            'status' => 'archived',
            'archived_at' => now(),
            'archived_by' => auth()->id(),
            'archive_reason' => $reason ?: 'Archived via inventory management',
        ]);

        // Log the archiving
        InventoryLog::create([
            'inventory_item_id' => $item->id,
            'delta' => 0,
            'quantity' => 0,
            'type' => 'archive',
            'movement_type' => 'archive',
            'reason' => "Item archived: {$reason}",
            'reference_type' => 'archive',
            'stock_before' => $item->stock,
            'stock_after' => $item->stock,
            'previous_stock' => $item->stock,
            'new_stock' => $item->stock,
            'performed_by' => auth()->user()?->name,
            'role' => auth()->user()?->role,
            'user_id' => auth()->id(),
            'details' => json_encode([
                'archived_at' => now()->toIso8601String(),
                'archive_reason' => $reason,
                'previous_status' => 'active',
            ]),
        ]);

        return [
            'message' => 'Item archived successfully. It will no longer appear in POS or service dropdowns, but historical data remains available.',
            'item' => $item->fresh(),
            'archived_at' => $item->archived_at,
            'archive_reason' => $reason,
        ];
        });
    }

    /**
     * Delete an inventory item (admin only for items with no history)
     */
    public function deleteItem(int $id, string $reason, ?string $reasonDetails = null): array
    {
        if (!array_key_exists($reason, self::PERMANENT_DELETE_REASONS)) {
            throw ValidationException::withMessages(['reason' => ['Select a valid reason for permanent deletion.']]);
        }
        if ($reason === 'other' && mb_strlen(trim((string) $reasonDetails)) < 3) {
            throw ValidationException::withMessages(['reason_details' => ['Provide details for the selected reason.']]);
        }

        return DB::transaction(function () use ($id, $reason, $reasonDetails) {
            $item = InventoryItem::lockForUpdate()->findOrFail($id);
            if ($item->status !== 'archived') {
                throw new \Exception('Archive this inventory item before permanently deleting it.');
            }
            if ((int) $item->stock > 0) {
                throw new \Exception('Inventory items with remaining stock cannot be permanently deleted.');
            }

            $saleItemsCount = DB::table('sale_items')->where('product_id', $id)->count();
            $customerOrderItemsCount = Schema::hasTable('customer_order_items')
                ? DB::table('customer_order_items')->where('inventory_item_id', $id)->count()
                : 0;
            $serviceUsageCount = Schema::hasTable('service_item_usages')
                ? DB::table('service_item_usages')->where('inventory_item_id', $id)->count()
                : 0;
            $batchesCount = $item->batches()->count();
            $transactionLogsCount = DB::table('inventory_logs')
                ->where('inventory_item_id', $id)
                ->where(function ($query) {
                    $query->whereNull('type')->orWhereNotIn('type', ['archive', 'restore']);
                })
                ->where(function ($query) {
                    $query->whereNull('movement_type')->orWhereNotIn('movement_type', ['archive', 'restore']);
                })
                ->count();

            if ($saleItemsCount > 0 || $customerOrderItemsCount > 0 || $serviceUsageCount > 0 || $batchesCount > 0 || $transactionLogsCount > 0) {
                throw new \Exception('This archived item has sales, usage, batches, or transaction history and must remain archived.');
            }

            $reasonLabel = self::PERMANENT_DELETE_REASONS[$reason];
            $details = trim((string) $reasonDetails);
            $reasonText = $reason === 'other' ? $reasonLabel . ': ' . $details : $reasonLabel;
            $photoPath = $item->photo;

            ActivityLog::log(auth()->id(), 'inventory_item_permanently_deleted', "Permanently deleted archived inventory item {$item->name} ({$item->sku}). Reason: {$reasonText}", [
                'category' => 'inventory',
                'reference_type' => 'inventory_item',
                'reference_id' => $item->id,
                'metadata' => [
                    'reason' => $reason,
                    'reason_label' => $reasonLabel,
                    'reason_details' => $reason === 'other' ? $details : null,
                    'item_name' => $item->name,
                    'sku' => $item->sku,
                    'archive_reason' => $item->archive_reason,
                    'archived_at' => $item->archived_at,
                ],
            ]);

            $item->delete();
            if ($photoPath) {
                DB::afterCommit(fn () => FileStorageService::deleteQuietly('public', $photoPath));
            }

            return [
                'message' => 'Archived inventory item permanently deleted.',
                'item_id' => $id,
                'reason' => $reasonLabel,
                'reason_details' => $reason === 'other' ? $details : null,
            ];
        });
    }

    /**
     * Adjust stock for an item
     */
    public function adjustStock(int $id, int $quantity, string $reason, ?array $auditData = null): array
    {
        return DB::transaction(function () use ($id, $quantity, $reason, $auditData) {
            $item = InventoryItem::lockForUpdate()->findOrFail($id);
            $adjustmentType = $auditData['adjustment_type'] ?? $auditData['type'] ?? 'increment';
            $adjustmentType = match ($adjustmentType) {
                'add' => 'increment',
                'remove' => 'decrement',
                default => $adjustmentType,
            };

            if (!in_array($adjustmentType, ['increment', 'decrement', 'set'], true)) {
                throw new \Exception('Invalid adjustment type.');
            }
            if ($adjustmentType === 'increment') {
                throw new \Exception('Stock increases must be recorded as a new batch. Use the stock receiving action.');
            }

            // 'set' legitimately targets zero (zeroing an item is a valid
            // physical-count correction); decrements of zero or less are no-ops
            // at best and must be rejected.
            if ($adjustmentType === 'decrement' && $quantity <= 0) {
                throw new \Exception('Quantity must be greater than zero.');
            }
            if ($quantity < 0) {
                throw new \Exception('Quantity must not be negative.');
            }

            $previousStock = (int) ($item->stock ?? 0);
            $newStock = match ($adjustmentType) {
                'increment' => $previousStock + $quantity,
                'decrement' => $previousStock - $quantity,
                'set' => $quantity,
            };

            if ($newStock < 0) {
                throw new \Exception('Adjustment would result in negative stock');
            }

            $delta = $newStock - $previousStock;

            // Batch-tracked items must keep batch totals in sync with the
            // flat counter — reconcile instead of writing stock directly.
            if ($delta !== 0 && $item->hasRealBatches()) {
                $this->reconcileToStock(
                    $item,
                    $newStock,
                    $reason,
                    'stock_adjustment_' . $adjustmentType,
                    'stock_adjustment',
                    $auditData['reference_id'] ?? null,
                    'ADJUST',
                    ['adjustment_type' => $adjustmentType]
                );
            } else {
                $update = ['stock' => $newStock];

                if (\Illuminate\Support\Facades\Schema::hasColumn($item->getTable(), 'quantity')) {
                    $update['quantity'] = $newStock;
                }

                $item->update($update);

                // Log the adjustment with audit data
                InventoryLog::create([
                    'inventory_item_id' => $item->id,
                    'delta' => $delta,
                    'quantity' => $quantity,
                    'type' => $adjustmentType,
                    'movement_type' => 'stock_adjustment_' . $adjustmentType,
                    'reason' => $reason,
                    'reference_type' => 'stock_adjustment',
                    'reference_id' => $auditData['reference_id'] ?? null,
                    'stock_before' => $previousStock,
                    'stock_after' => $newStock,
                    'previous_stock' => $previousStock,
                    'new_stock' => $newStock,
                    'performed_by' => $auditData['performed_by'] ?? auth()->user()?->name,
                    'role' => $auditData['role'] ?? auth()->user()?->role,
                    'user_id' => $auditData['user_id'] ?? auth()->id(),
                    'details' => json_encode([
                        'adjustment_type' => $adjustmentType,
                        'reason' => $reason,
                    ]),
                ]);
            }

            ActivityLog::log($auditData['user_id'] ?? auth()->id(), 'inventory_adjusted', "Adjusted {$item->name} stock by {$delta}", [
                'category' => 'inventory',
                'reference_type' => 'inventory_item',
                'reference_id' => $item->id,
                'metadata' => [
                    'adjustment_type' => $adjustmentType,
                    'previous_stock' => $previousStock,
                    'new_stock' => $newStock,
                    'reason' => $reason,
                ],
            ]);

            // Check for low/out of stock and create notifications
            $this->checkAndCreateStockNotifications($item->fresh());

            return [
                'success' => true,
                'message' => 'Stock adjusted successfully',
                'item' => $item->fresh(),
                'previous_stock' => $previousStock,
                'new_stock' => $newStock,
                'adjustment' => $delta,
                'adjustment_type' => $adjustmentType,
            ];
        });
    }

    /**
     * Deduct stock for sales/orders with FEFO batch tracking
     * Centralized method used by POS and Customer Order systems
     * Blocks sale of expired items
     */
    public function deductStock(int $itemId, int $quantity, string $reason = 'Sale', string $referenceType = 'sale', ?int $referenceId = null, ?int $batchId = null): array
    {
        // Serialize stock mutations: all real callers run inside a transaction,
        // so the row lock makes the stock check + deduction atomic. Outside a
        // transaction FOR UPDATE is a harmless no-op.
        $item = InventoryItem::lockForUpdate()->findOrFail($itemId);

        // Check if item has expired batches - BLOCK SALE
        if ($item->hasExpiredBatches()) {
            throw new \Exception("Cannot sell {$item->name}: Item has expired stock. Please dispose of expired batches first.");
        }

        // Check stock availability
        if ($item->stock < $quantity) {
            throw new \Exception("Insufficient stock for {$item->name}. Available: {$item->stock}, Requested: {$quantity}");
        }

        $stockBefore = $item->stock;

        // Use FEFO batch deduction when the item has real batch records.
        // Zero-quantity marker rows (e.g. legacy audit_adjusted placeholders)
        // must not force an untracked item onto the batch path.
        $hasBatches = $item->hasRealBatches();
        $rotationMethod = $item->needsFefo() ? 'FEFO' : 'FIFO';
        if ($hasBatches) {
            // Self-heal bookkeeping drift: if the flat counter covers the sale
            // but usable batches don't, materialize the gap as a labelled
            // reconciliation batch rather than blocking the cashier. The
            // batch/log entries keep the repair auditable.
            $batchStock = $item->getBatchStock();
            if ($batchStock < $quantity && $item->stock >= $quantity) {
                $shortfall = $quantity - $batchStock;
                $reconBatch = $item->batches()->create([
                    'batch_no' => 'RECON-' . strtoupper(uniqid()),
                    'received_date' => now(),
                    'quantity' => $shortfall,
                    'remaining_quantity' => $shortfall,
                    'status' => 'active',
                    'notes' => 'Auto-reconciliation: untracked stock made sellable',
                ]);

                InventoryLog::create([
                    'inventory_item_id' => $item->id,
                    'delta' => 0,
                    'quantity' => $shortfall,
                    'type' => 'reconciliation',
                    'movement_type' => 'stock_reconciliation',
                    'reason' => "Auto-created RECON batch {$reconBatch->batch_no}: stock column held {$item->stock} but usable batches held {$batchStock}",
                    'reference_type' => $referenceType,
                    'reference_id' => $referenceId,
                    'stock_before' => $item->stock,
                    'stock_after' => $item->stock,
                    'previous_stock' => $item->stock,
                    'new_stock' => $item->stock,
                    'performed_by' => auth()->user()?->name,
                    'role' => auth()->user()?->role,
                    'user_id' => auth()->id(),
                    'details' => json_encode(['batch_id' => $reconBatch->id, 'reconciled_quantity' => $shortfall]),
                ]);
            }

            $movementType = in_array($referenceType, ['vet_usage', 'grooming_usage', 'boarding_food_usage'], true)
                ? $referenceType
                : match ($referenceType) {
                    'sale' => 'pos_sale',
                    'boarding' => 'boarding_addon_usage',
                    default => 'stock_deduction',
                };
            $batchDeductions = $item->deductStockFefo($quantity, $reason, $movementType, $referenceType, $referenceId, $batchId);

            // Refresh item to get updated stock
            $item = $item->fresh();

            // Check for low/out of stock and create notifications
            $this->checkAndCreateStockNotifications($item);
            $this->notifyInventoryMovement($item, -$quantity, $reason, $referenceType, $referenceId, $stockBefore, $item->stock);

            return [
                'message' => "Stock deducted successfully ({$rotationMethod})",
                'item' => $item,
                'deducted' => $quantity,
                'stock_before' => $stockBefore,
                'stock_after' => $item->stock,
                'batch_deductions' => $batchDeductions,
                'fefo_applied' => $rotationMethod === 'FEFO',
                'issue_method' => $rotationMethod,
            ];
        }

        // Fallback: Simple stock deduction for non-batch items
        $item->decrement('stock', $quantity);
        $item = $item->fresh();

        $movementType = in_array($referenceType, ['vet_usage', 'grooming_usage', 'boarding_food_usage'], true)
            ? $referenceType
            : match ($referenceType) {
                'customer_order' => 'customer_order_deduction',
                'boarding' => 'boarding_addon_usage',
                default => 'pos_sale',
            };

        // Log the stock deduction
        InventoryLog::create([
            'inventory_item_id' => $itemId,
            'delta' => -$quantity,
            'quantity' => $quantity,
            'type' => 'sale',
            'movement_type' => $movementType,
            'reason' => $reason,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'stock_before' => $stockBefore,
            'stock_after' => $item->stock,
            'previous_stock' => $stockBefore,
            'new_stock' => $item->stock,
            'performed_by' => auth()->user()?->name,
            'role' => auth()->user()?->role,
            'user_id' => auth()->id(),
        ]);

        // Check for low/out of stock and create notifications
        $this->checkAndCreateStockNotifications($item);
        $this->notifyInventoryMovement($item, -$quantity, $reason, $referenceType, $referenceId, $stockBefore, $item->stock);

        return [
            'message' => 'Stock deducted successfully',
            'item' => $item,
            'deducted' => $quantity,
            'stock_before' => $stockBefore,
            'stock_after' => $item->stock,
            'fefo_applied' => false,
        ];
    }

    /**
     * Add stock (restock) with batch tracking support
     * Centralized method for inventory restocking
     */
    public function addStock(int $itemId, int $quantity, string $reason = 'Restock', string $referenceType = 'restock', ?int $referenceId = null, ?array $batchData = null): array
    {
        $item = InventoryItem::lockForUpdate()->findOrFail($itemId);

        $stockBefore = $item->stock;

        // If item needs FEFO or batch data provided, create batch
        if ($item->needsFefo() || $item->hasRealBatches() || $batchData) {
            $batch = $item->addBatchStock(
                $quantity,
                $batchData['batch_no'] ?? null,
                $batchData['expiration_date'] ?? null,
                $batchData['notes'] ?? $reason
            );

            $item = $item->fresh();
            
            // Always create inventory log for stock addition (including cancellations)
            $logData = [
                'inventory_item_id' => $itemId,
                'delta' => $quantity,
                'quantity' => $quantity,
                'type' => 'restock',
                'movement_type' => match ($referenceType) {
                    'cancellation' => 'sale_void',
                    'boarding' => 'boarding_addon_restore',
                    default => $referenceType,
                },
                'reason' => $reason,
                'reference_type' => $referenceType === 'cancellation' ? 'sale_void' : $referenceType,
                'reference_id' => $referenceId,
                'stock_before' => $stockBefore,
                'stock_after' => $item->stock,
                'previous_stock' => $stockBefore,
                'new_stock' => $item->stock,
                'performed_by' => auth()->user()?->name,
                'role' => auth()->user()?->role,
                'user_id' => auth()->id(),
            ];

            if (Schema::hasColumn('inventory_logs', 'batch_id')) {
                $logData['batch_id'] = $batch->id;
            } else {
                $logData['details'] = json_encode(['batch_id' => $batch->id]);
            }

            InventoryLog::create($logData);

            $this->notifyInventoryMovement($item, $quantity, $reason, $referenceType, $referenceId, $stockBefore, $item->stock);

            return [
                'message' => 'Stock added successfully with batch tracking',
                'item' => $item,
                'added' => $quantity,
                'stock_before' => $stockBefore,
                'stock_after' => $item->stock,
                'batch' => $batch,
                'batch_tracking' => true,
            ];
        }

        // Fallback: Simple stock addition for non-batch items
        $item->increment('stock', $quantity);
        $item = $item->fresh();

        $movementType = in_array($referenceType, ['vet_usage', 'grooming_usage', 'boarding_food_usage'], true)
            ? $referenceType
            : match ($referenceType) {
                'cancellation' => 'sale_void',
                'customer_order' => 'customer_order_restore',
                'boarding' => 'boarding_addon_restore',
                default => 'stock_in',
            };

        // Log the stock addition
        InventoryLog::create([
            'inventory_item_id' => $itemId,
            'delta' => $quantity,
            'quantity' => $quantity,
            'type' => 'restock',
            'movement_type' => $movementType,
            'reason' => $reason,
            'reference_type' => $referenceType === 'cancellation' ? 'sale_void' : $referenceType,
            'reference_id' => $referenceId,
            'stock_before' => $stockBefore,
            'stock_after' => $item->stock,
            'previous_stock' => $stockBefore,
            'new_stock' => $item->stock,
            'performed_by' => auth()->user()?->name,
            'role' => auth()->user()?->role,
            'user_id' => auth()->id(),
        ]);

        $this->notifyInventoryMovement($item, $quantity, $reason, $referenceType, $referenceId, $stockBefore, $item->stock);

        return [
            'message' => 'Stock added successfully',
            'item' => $item,
            'added' => $quantity,
            'stock_before' => $stockBefore,
            'stock_after' => $item->stock,
            'batch_tracking' => false,
        ];
    }

    /**
     * Set an item's stock to a target value while keeping batch records in
     * sync. For batch-tracked items: a positive gap materializes as a new
     * labelled batch, a negative gap is written off from batches in FEFO
     * order. For items with no real batches the flat counter is updated
     * directly. Always writes an InventoryLog entry.
     */
    public function reconcileToStock(
        InventoryItem $item,
        int $targetStock,
        string $reason,
        string $movementType,
        string $referenceType,
        ?int $referenceId = null,
        string $batchPrefix = 'ADJUST',
        array $logDetails = [],
        array $logExtra = []
    ): array {
        $previousStock = (int) $item->stock;
        $batch = null;
        $writtenOff = 0;

        if ($item->hasRealBatches()) {
            $batchDiff = $targetStock - $item->getPhysicalBatchStock();

            if ($batchDiff > 0) {
                $batch = $item->batches()->create([
                    'batch_no' => $batchPrefix . '-' . strtoupper(uniqid()),
                    'received_date' => now(),
                    'quantity' => $batchDiff,
                    'remaining_quantity' => $batchDiff,
                    'status' => 'active',
                    'notes' => $reason,
                ]);
            } elseif ($batchDiff < 0) {
                $writtenOff = $item->reduceBatchesFefo(-$batchDiff);
            }
        }

        $update = ['stock' => $targetStock];
        if (Schema::hasColumn($item->getTable(), 'quantity')) {
            $update['quantity'] = $targetStock;
        }
        $item->update($update);

        $delta = $targetStock - $previousStock;
        InventoryLog::create(array_merge([
            'inventory_item_id' => $item->id,
            'delta' => $delta,
            'quantity' => abs($delta),
            'type' => $movementType,
            'movement_type' => $movementType,
            'reason' => $reason,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'stock_before' => $previousStock,
            'stock_after' => $targetStock,
            'previous_stock' => $previousStock,
            'new_stock' => $targetStock,
            'performed_by' => auth()->user()?->name,
            'role' => auth()->user()?->role,
            'user_id' => auth()->id(),
            'details' => json_encode(array_merge([
                'reconciled_batch_id' => $batch?->id,
                'batch_written_off' => $writtenOff,
            ], $logDetails, (array) ($logExtra['details'] ?? []))),
        ], \Illuminate\Support\Arr::except($logExtra, 'details')));

        return [
            'batch' => $batch,
            'written_off' => $writtenOff,
            'stock_before' => $previousStock,
            'stock_after' => $targetStock,
        ];
    }

    /**
     * Apply a monthly physical-count audit to an item. The physical count is
     * authoritative: batch records are reconciled to it (surplus becomes an
     * AUDIT- batch, deficit is written off FEFO) and the flat counter is set
     * to the counted value. Shared by the admin and inventory dashboards.
     */
    public function applyMonthlyAuditAdjustment(
        InventoryItem $item,
        int $actualStock,
        ?string $reason,
        string $auditMonth
    ): array {
        $systemStock = (int) ($item->stock ?? 0);
        $variance = $actualStock - $systemStock;
        $status = $variance === 0 ? 'matched' : 'discrepancy';

        if ($status === 'discrepancy' && trim((string) $reason) === '') {
            throw ValidationException::withMessages([
                'items' => ["A reason is required for the discrepancy on \"{$item->name}\"."],
            ]);
        }

        $audit = InventoryMonthlyAudit::updateOrCreate(
            [
                'inventory_item_id' => $item->id,
                'audit_month' => $auditMonth,
            ],
            [
                'system_stock' => $systemStock,
                'actual_stock' => $actualStock,
                'variance' => $variance,
                'status' => $status,
                // Phase D: a physical count that matches is self-approving;
                // a discrepancy is corrected now but stays pending until a
                // manager reviews the variance.
                'approval_status' => $status === 'matched' ? 'auto_approved' : 'pending',
                'approved_by' => null,
                'approved_at' => null,
                'reason' => $reason,
                'checked_by' => auth()->user()?->name ?? 'System',
            ]
        );

        $reconciliation = null;
        if ($variance !== 0) {
            $reconciliation = $this->reconcileToStock(
                $item->fresh(),
                $actualStock,
                $reason ?: 'Monthly inventory count correction',
                'monthly_audit',
                'monthly_audit',
                null,
                'AUDIT',
                [
                    'audit_month' => $auditMonth,
                    'system_stock' => $systemStock,
                    'actual_stock' => $actualStock,
                    'variance' => $variance,
                ]
            );
        }

        return [
            'audit' => $audit,
            'variance' => $variance,
            'system_stock' => $systemStock,
            'reconciliation' => $reconciliation,
        ];
    }

    /**
     * Get low stock items
     */
    public function getLowStockItems(): array
    {
        $items = InventoryItem::whereRaw('stock <= reorder_level')
            ->where('stock', '>', 0)
            ->where('status', self::STATUS_ACTIVE)
            ->orderByRaw('stock / reorder_level asc')
            ->get();

        return [
            'count' => $items->count(),
            'items' => $items,
        ];
    }

    /**
     * Get out of stock items
     */
    public function getOutOfStockItems(): array
    {
        $items = InventoryItem::where('stock', 0)
            ->where('status', self::STATUS_ACTIVE)
            ->orderBy('name')
            ->get();

        return [
            'count' => $items->count(),
            'items' => $items,
        ];
    }

    /**
     * Get inventory summary/stats
     */
    public function getSummary(): array
    {
        $totalItems = InventoryItem::whereNull('archived_at')->count();
        $totalValue = InventoryItem::where('status', self::STATUS_ACTIVE)
            ->whereNull('archived_at')
            ->sum(DB::raw('stock * price'));
        $lowStockCount = InventoryItem::whereNull('archived_at')
            ->whereRaw('stock <= reorder_level')
            ->where('stock', '>', 0)
            ->count();
        $outOfStockCount = InventoryItem::whereNull('archived_at')
            ->where('stock', 0)
            ->count();
        $expiringSoon = InventoryItem::whereNull('archived_at')
            ->where('expiry_date', '<=', now()->addDays(30))
            ->where('expiry_date', '>=', now())
            ->count();

        $categoryBreakdown = InventoryItem::where('status', self::STATUS_ACTIVE)
            ->whereNull('archived_at')
            ->selectRaw('category, COUNT(*) as count, SUM(stock) as total_stock, SUM(stock * price) as total_value')
            ->groupBy('category')
            ->get();

        return [
            'total_items' => $totalItems,
            'total_stock_value' => $totalValue,
            'low_stock_count' => $lowStockCount,
            'out_of_stock_count' => $outOfStockCount,
            'expiring_soon_count' => $expiringSoon,
            'category_breakdown' => $categoryBreakdown,
        ];
    }

    /**
     * Fields exposed by customer-facing inventory endpoints. Internal
     * purchasing data (cost, supplier, supplier_id, reorder_level, batch
     * quantities, audit fields) must never appear here — F-03.
     */
    private const PUBLIC_ITEM_FIELDS = [
        'id', 'name', 'sku', 'category', 'description', 'brand',
        'price', 'stock', 'status', 'is_sellable', 'photo',
    ];

    /**
     * Get public items (read-only for store/pos)
     */
    public function getPublicItems(array $filters = []): array
    {
        // Get items with nearest batch expiration without GROUP BY, so this
        // remains compatible with MySQL ONLY_FULL_GROUP_BY.
        $items = DB::table('inventory_items')
            ->select(
                array_merge(
                    array_map(fn ($f) => "inventory_items.{$f}", self::PUBLIC_ITEM_FIELDS),
                    [DB::raw('(select MIN(inventory_batches.expiration_date)
                        from inventory_batches
                        where inventory_batches.inventory_item_id = inventory_items.id
                        and inventory_batches.status = "active") as nearest_expiration')]
                )
            )
            ->where('inventory_items.status', self::STATUS_ACTIVE)
            ->when(!empty($filters['category']), function ($q) use ($filters) {
                $q->where('inventory_items.category', $filters['category']);
            })
            ->when(!empty($filters['search']), function ($q) use ($filters) {
                $search = $filters['search'];
                $q->where(function ($query) use ($search) {
                    $query->where('inventory_items.name', 'like', "%{$search}%")
                          ->orWhere('inventory_items.sku', 'like', "%{$search}%");
                });
            })
            ->when(!empty($filters['in_stock_only']), function ($q) {
                $q->where('inventory_items.stock', '>', 0);
            })
            ->orderBy('inventory_items.name')
            ->get()
            ->map(function ($item) {
                return [
                    'id'                 => $item->id,
                    'name'               => $item->name,
                    'sku'                => $item->sku,
                    'category'           => $item->category,
                    'description'        => $item->description,
                    'brand'              => $item->brand,
                    'price'              => (float) $item->price,
                    'stock'              => $item->stock,
                    'status'             => $item->status,
                    'is_sellable'        => (bool) $item->is_sellable,
                    'photo_url'          => self::publicPhotoUrl($item->photo),
                    'nearest_expiration' => $item->nearest_expiration,
                ];
            });

        return [
            'items' => $items,
            'count' => $items->count(),
            'timestamp' => now()->toIso8601String(),
        ];
    }

    /**
     * Resolve a stored photo path to a public URL. Mirrors
     * InventoryItem::getPhotoUrlAttribute() for stdClass rows.
     */
    private static function publicPhotoUrl(?string $photo): ?string
    {
        if (empty($photo)) {
            return null;
        }
        if (str_starts_with($photo, 'http')) {
            return $photo;
        }
        if (str_starts_with($photo, 'uploads/')) {
            return asset($photo);
        }
        return \Illuminate\Support\Facades\Storage::disk('public')->url($photo);
    }

    /**
     * Validate item data
     */
    private function validateItemData(array $data, bool $isCreate, ?int $itemId = null): array
    {
        $rules = [
            'name' => $isCreate ? 'required|string|max:255' : 'sometimes|string|max:255',
            'sku' => $isCreate ? 'present|nullable|string|max:50|unique:inventory_items,sku' : 'sometimes|string|max:50|unique:inventory_items,sku,' . ($itemId ?? $data['id'] ?? null),
            // Barcode: alphanumeric + hyphens only (no spaces — HID scanners
            // don't emit spaces, and spaces in barcodes cause lookup issues).
            // Trailing whitespace/newlines from HID scanners are normalized
            // below before validation/storage.
            // Note: 'sometimes' (not 'present') so callers that predate
            // barcode support can omit the key entirely without failing.
            // The required-for-sellable rule is enforced post-validation.
            'barcode' => $isCreate
                ? 'sometimes|nullable|string|max:100|regex:/^[A-Za-z0-9\-]+$/|unique:inventory_items,barcode'
                : 'sometimes|string|max:100|regex:/^[A-Za-z0-9\-]+$/|unique:inventory_items,barcode,' . ($itemId ?? $data['id'] ?? null),
            'category' => $isCreate ? 'required|string|max:50' : 'sometimes|string|max:50',
            'description' => 'nullable|string',
            'brand' => 'nullable|string|max:255',
            'generic_name' => 'nullable|string|max:255',
            'supplier' => 'nullable|string|max:255',
            'supplier_id' => 'nullable|integer|exists:suppliers,id',
            'photo' => 'nullable|string|max:255',
            'price' => $isCreate ? 'required|numeric|min:0' : 'sometimes|numeric|min:0',
            'cost' => 'nullable|numeric|min:0',
            'stock' => 'nullable|integer|min:0',
            'quantity' => 'nullable|integer|min:0',
            'stock_quantity' => 'nullable|integer|min:0',
            'add_stock' => 'nullable|boolean',
            'reorder_level' => $isCreate ? 'required|integer|min:0' : 'sometimes|integer|min:0',
            'expiry_date' => 'nullable|date',
            'status' => 'nullable|in:' . implode(',', self::VALID_STATUSES),
            'is_sellable' => 'sometimes|boolean',
            'is_service_consumable' => 'sometimes|boolean',
            'requires_expiry_tracking' => 'sometimes|boolean',
            'issue_method' => 'sometimes|in:FIFO,FEFO,Manual',
            'unit' => 'sometimes|nullable|string|max:50',
            'pack_size' => 'sometimes|nullable|integer|min:2',
            'box_size' => 'sometimes|nullable|integer|min:2',
        ];

        // Normalize barcode before validation so scanner input such as
        // " 8938501234567\n" resolves identically to "8938501234567".
        if (array_key_exists('barcode', $data)) {
            $data['barcode'] = $this->normalizeBarcode($data['barcode']);
        }

        $validator = \Illuminate\Support\Facades\Validator::make($data, $rules);

        if ($validator->fails()) {
            throw ValidationException::withMessages($validator->errors()->toArray());
        }

        $validated = $validator->validated();

        // Validate category
        if (isset($validated['category']) && !in_array($validated['category'], self::VALID_CATEGORIES)) {
            $validated['category'] = 'Accessories';
        }

        // Ensure normalized barcode is stored (empty string -> null so the
        // unique index treats it as "no barcode" rather than colliding on "").
        if (array_key_exists('barcode', $validated)) {
            $validated['barcode'] = $this->normalizeBarcode($validated['barcode']);
        }

        // Keep the item's supplier name and supplier_id in step so lists,
        // filters and product info always show the linked supplier.
        if (!empty($validated['supplier_id'])) {
            $validated['supplier'] = Supplier::whereKey($validated['supplier_id'])->value('name');
        } elseif (!empty($validated['supplier'])) {
            $validated['supplier_id'] = Supplier::where('name', $validated['supplier'])->value('id');
        }

        // Business rule: barcode is required for sellable items.
        // is_sellable defaults to true (DB default = 1), so if it's not
        // explicitly set to false/0, the item is sellable and must have a barcode.
        // On create: barcode must be present and non-empty.
        // On update: only enforce if barcode is explicitly being set to empty,
        //   or if is_sellable is being changed to true while barcode is empty.
        $isSellable = isset($validated['is_sellable'])
            ? (bool) $validated['is_sellable']
            : (isset($data['is_sellable']) ? (bool) $data['is_sellable'] : true);

        // Business rule: sellable items must always carry a barcode so POS
        // scanning works. On create, an omitted barcode is auto-generated
        // (see createItem); on update it must never be cleared to empty.
        if (!$isCreate && $isSellable
            && array_key_exists('barcode', $validated) && empty($validated['barcode'])) {
            throw ValidationException::withMessages([
                'barcode' => ['The barcode field is required for sellable items.'],
            ]);
        }

        // Packaging sizes only make sense together with a base unit; keep
        // them independent but reject a box smaller than a pack when both
        // are configured — that ordering is never meaningful.
        $packSize = $validated['pack_size'] ?? null;
        $boxSize = $validated['box_size'] ?? null;
        if ($packSize !== null && $boxSize !== null && (int) $boxSize < (int) $packSize) {
            throw ValidationException::withMessages([
                'box_size' => ['A box must contain at least as many units as a pack.'],
            ]);
        }

        return $validated;
    }

    /**
     * Normalize a barcode value: trim leading/trailing whitespace and any
     * trailing newline characters that HID/keyboard-emulation scanners may
     * append. An empty value after normalization becomes null so multiple
     * unbarcoded items do not collide on the unique index.
     */
    private function normalizeBarcode(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $normalized = trim((string) $value);
        return $normalized === '' ? null : $normalized;
    }

    private function notifyInventoryMovement(InventoryItem $item, int $delta, string $reason, string $referenceType, ?int $referenceId, int $previousStock, int $newStock): void
    {
        $direction = $delta < 0 ? 'deducted' : 'restored';

        WorkflowNotifier::notifyRole(
            'inventory',
            'Stock ' . ucfirst($direction),
            "{$item->name}: " . abs($delta) . " units {$direction}. {$previousStock} -> {$newStock}.",
            $delta < 0 ? 'warning' : 'success',
            $referenceType,
            $referenceId,
            [
                'item_id' => $item->id,
                'delta' => $delta,
                'previous_stock' => $previousStock,
                'new_stock' => $newStock,
                'reason' => $reason,
            ]
        );

        ActivityLog::log(auth()->id(), 'stock_' . $direction, "{$item->name} stock {$direction}", [
            'category' => 'inventory',
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'metadata' => [
                'item_id' => $item->id,
                'delta' => $delta,
                'previous_stock' => $previousStock,
                'new_stock' => $newStock,
            ],
        ]);
    }

    /**
     * Dispose expired or damaged batch
     */
    public function disposeBatch(int $batchId, string $reason = 'Expired'): array
    {
        return DB::transaction(function () use ($batchId, $reason) {
            $batch = InventoryBatch::lockForUpdate()->findOrFail($batchId);
            $item = InventoryItem::lockForUpdate()->findOrFail($batch->inventory_item_id);

            $disposedQuantity = $batch->remaining_quantity;
            $stockBefore = (int) $item->stock;

            // Mark batch as disposed
            $batch->update([
                'status' => 'disposed',
                'remaining_quantity' => 0,
                'notes' => $batch->notes . "\nDisposed: {$reason} on " . now()->toDateTimeString(),
            ]);

            // Update main stock
            $item->decrement('stock', $disposedQuantity);
            $item = $item->fresh();

            // Log disposal — full movement fields so the entry is traceable in
            // history the same way deductions and adjustments are.
            InventoryLog::create([
                'inventory_item_id' => $item->id,
                'delta' => -$disposedQuantity,
                'quantity' => $disposedQuantity,
                'type' => 'disposal',
                'movement_type' => 'batch_disposal',
                'reason' => "Batch disposed: {$reason}",
                'reference_type' => 'disposal',
                'reference_id' => $batch->id,
                'stock_before' => $stockBefore,
                'stock_after' => $item->stock,
                'previous_stock' => $stockBefore,
                'new_stock' => $item->stock,
                'performed_by' => auth()->user()?->name,
                'role' => auth()->user()?->role,
                'user_id' => auth()->id(),
                'details' => json_encode([
                    'batch_id' => $batch->id,
                    'batch_no' => $batch->batch_no,
                    'disposed_quantity' => $disposedQuantity,
                    'disposal_reason' => $reason,
                ]),
            ]);

            return [
                'message' => 'Batch disposed successfully',
                'batch' => $batch->fresh(),
                'item' => $item->fresh(),
                'disposed_quantity' => $disposedQuantity,
            ];
        });
    }

    /**
     * Get all batches for an item with expiration info
     */
    public function getItemBatches(int $itemId): array
    {
        $item = InventoryItem::findOrFail($itemId);
        $batches = $item->batches()->orderBy('expiration_date', 'asc')->get();

        return [
            'item' => $item,
            'batches' => $batches,
            'total_batches' => $batches->count(),
            'active_batches' => $batches->where('status', 'active')->count(),
            'expired_batches' => $batches->where('status', 'expired')->count(),
            'has_expired' => $item->hasExpiredBatches(),
            'expiring_soon' => $item->hasExpiringBatches(),
        ];
    }

    /**
     * Generate unique SKU
     */
    private function generateSKU(string $category): string
    {
        $prefix = strtoupper(substr($category, 0, 3));
        $random = strtoupper(Str::random(4));
        $timestamp = date('ym');
        return "{$prefix}-{$random}{$timestamp}";
    }

    /**
     * SKU generation with collision retry — the unique index remains the
     * final guard, but a random hit should regenerate, not 422 the create.
     */
    private function generateUniqueSKU(string $category): string
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $sku = $this->generateSKU($category);
            if (!InventoryItem::where('sku', $sku)->exists()) {
                return $sku;
            }
        }

        // Deterministic fallback: max existing numeric suffix + 1.
        return $this->generateSKU($category) . '-' . strtoupper(Str::random(6));
    }

    /**
     * Generate a unique EAN-13 barcode for in-store items (panel §8.4).
     * Leading digit '2' marks it as an in-store code; the last digit is a
     * valid GTIN check digit so the label scans with standard readers.
     */
    private function generateUniqueBarcode(): string
    {
        for ($attempt = 0; $attempt < 25; $attempt++) {
            $body = '2' . str_pad((string) random_int(0, 99999999999), 11, '0', STR_PAD_LEFT);
            $barcode = $body . $this->ean13CheckDigit($body);
            if (!InventoryItem::where('barcode', $barcode)->exists()) {
                return $barcode;
            }
        }

        throw ValidationException::withMessages([
            'barcode' => ['Could not generate a unique barcode. Please supply one manually.'],
        ]);
    }

    /** GTIN-13 check digit (weights 1,3 alternating from the left). */
    private function ean13CheckDigit(string $body12): string
    {
        $sum = 0;
        for ($i = 0; $i < 12; $i++) {
            $sum += (int) $body12[$i] * ($i % 2 === 0 ? 1 : 3);
        }

        return (string) ((10 - ($sum % 10)) % 10);
    }

    /*
    |----------------------------------------------------------------------
    | Stock Movement & Control System
    |----------------------------------------------------------------------
    */

    /** Stock-in transaction types. */
    public const STOCK_IN_TYPES = [
        'purchase' => 'New Purchase',
        'supplier_delivery' => 'Supplier Delivery',
        'customer_return' => 'Customer Return (Approved Restock)',
        'return_from_internal' => 'Return from Internal Usage',
        'correction' => 'Inventory Correction',
        'other' => 'Other Authorized Incoming Stock',
    ];

    /** Stock-out reason codes. */
    public const STOCK_OUT_REASONS = [
        'damaged' => 'Damaged',
        'expired' => 'Expired',
        'lost_missing' => 'Lost / Missing',
        'internal_usage' => 'Internal Usage',
        'service_consumption' => 'Service Consumption',
        'supplier_return' => 'Returned to Supplier',
        'disposal' => 'Disposal',
        'correction' => 'Inventory Correction',
        'other' => 'Other Authorized Withdrawal',
    ];

    /**
     * Reason-specific required fields, validated against the request-level
     * payload (not the per-line data).
     */
    private const STOCK_OUT_REQUIRED_FIELDS = [
        'damaged' => ['damage_details'],
        'expired' => ['disposal_details'],
        'lost_missing' => ['incident_details'],
        'internal_usage' => ['department', 'purpose'],
        'service_consumption' => ['service_reference'],
        'supplier_return' => ['supplier', 'return_reference'],
        'disposal' => ['disposal_method'],
        'correction' => ['explanation'],
        'other' => ['explanation'],
    ];

    /**
     * Reasons that must pass through the manager/admin approval queue before
     * any stock is touched. `service_consumption` executes immediately; the
     * vet/grooming/boarding services keep their own automatic deduction.
     * `correction` is queued only above a configurable quantity threshold.
     */
    private const STOCK_OUT_APPROVAL_REASONS = [
        'damaged', 'expired', 'lost_missing', 'internal_usage',
        'supplier_return', 'disposal', 'other',
    ];

    /**
     * Write-off reasons deduct from every physical batch (including expired
     * lots awaiting disposal). Consumption-type reasons deduct from sellable
     * batches only, same as POS.
     */
    private const STOCK_OUT_WRITE_OFF_REASONS = [
        'damaged', 'expired', 'disposal', 'lost_missing', 'correction',
    ];

    /**
     * Movement types eligible for the reversal workflow. POS, customer-order
     * and service deductions are deliberately excluded — they keep their own
     * void/restore paths and must never be double-restored through here.
     */
    private const REVERSIBLE_MOVEMENT_TYPES = [
        'stock_out',
        'stock_in',
        'stock_adjustment_decrement',
        'stock_adjustment_set',
        'batch_disposal',
    ];

    /**
     * Compact item payload for the quick-select dropdown. Searches name, SKU,
     * barcode, brand and generic name; returns at most 20 active items.
     */
    public function searchItems(?string $query = null): array
    {
        $items = InventoryItem::query()
            ->where('status', self::STATUS_ACTIVE)
            ->whereNull('archived_at')
            ->when($query !== null && trim($query) !== '', function ($q) use ($query) {
                $term = trim($query);
                $q->where(function ($inner) use ($term) {
                    $inner->where('name', 'like', "%{$term}%")
                        ->orWhere('sku', 'like', "%{$term}%")
                        ->orWhere('barcode', 'like', "%{$term}%")
                        ->orWhere('brand', 'like', "%{$term}%")
                        ->orWhere('generic_name', 'like', "%{$term}%");
                });
            })
            ->orderBy('name')
            ->limit(20)
            ->get()
            ->map(fn (InventoryItem $item) => [
                'id' => $item->id,
                'name' => $item->name,
                'sku' => $item->sku,
                'barcode' => $item->barcode,
                'brand' => $item->brand,
                'generic_name' => $item->generic_name,
                'category' => $item->category,
                'stock' => (int) $item->stock,
                'unit' => $item->unit,
                'pack_size' => $item->pack_size ? (int) $item->pack_size : null,
                'box_size' => $item->box_size ? (int) $item->box_size : null,
                'uom_options' => $item->uomOptions(),
                'status' => $item->status,
                'reorder_level' => (int) ($item->reorder_level ?? 0),
                'requires_expiry_tracking' => (bool) $item->requires_expiry_tracking,
                'issue_method' => $item->issue_method,
                'is_sellable' => (bool) $item->is_sellable,
                'photo_url' => $item->photo_url,
            ]);

        return ['items' => $items, 'count' => $items->count()];
    }

    private function nextTransactionNo(string $prefix): string
    {
        return $prefix . '-' . now()->format('Ymd') . '-' . strtoupper(Str::random(5));
    }

    /**
     * The newest log row for an item. Safe because every caller holds the
     * item's FOR UPDATE row lock, so no other writer can interleave a log for
     * this item between the write and this read.
     */
    private function latestMovementFor(InventoryItem $item): InventoryLog
    {
        return InventoryLog::where('inventory_item_id', $item->id)->latest('id')->firstOrFail();
    }

    /**
     * Record a multi-item Stock In transaction. One DB transaction and one
     * shared transaction_no for every line.
     */
    public function recordStockIn(array $payload): array
    {
        $transactionType = $payload['transaction_type'] ?? '';
        if (!array_key_exists($transactionType, self::STOCK_IN_TYPES)) {
            throw ValidationException::withMessages(['transaction_type' => 'Select a valid stock-in type.']);
        }
        if ($transactionType === 'other' && trim((string) ($payload['description'] ?? '')) === '') {
            throw ValidationException::withMessages(['description' => 'A description is required for "Other" stock-in.']);
        }
        $lines = $payload['items'] ?? [];
        if (empty($lines) || !is_array($lines)) {
            throw ValidationException::withMessages(['items' => 'Add at least one inventory item.']);
        }

        $transactionNo = $this->nextTransactionNo('IN');

        // Lock ordering: sort lines by item id so concurrent multi-item
        // transactions acquire row locks in a consistent order — otherwise
        // reversed submissions ([a,b] vs [b,a]) can deadlock.
        usort($lines, fn ($a, $b) => ($a['inventory_item_id'] ?? $a['item_id'] ?? 0) <=> ($b['inventory_item_id'] ?? $b['item_id'] ?? 0));

        return DB::transaction(function () use ($payload, $lines, $transactionType, $transactionNo) {
            $movements = [];
            $results = [];

            foreach ($lines as $index => $line) {
                $itemId = (int) ($line['inventory_item_id'] ?? $line['item_id'] ?? 0);
                $item = InventoryItem::lockForUpdate()->findOrFail($itemId);

                if ($item->status !== self::STATUS_ACTIVE || $item->archived_at) {
                    throw ValidationException::withMessages(["items.{$index}" => "{$item->name} is not an active inventory item."]);
                }
                $quantity = $this->resolveUomBaseQuantity($item, $line, $index);
                if ($quantity <= 0) {
                    throw ValidationException::withMessages(["items.{$index}.quantity" => 'Quantity must be greater than zero.']);
                }

                $movement = $this->executeStockInLine($item, $quantity, (array) $line, [
                    'transaction_type' => $transactionType,
                    'transaction_no' => $transactionNo,
                    'supplier' => $payload['supplier'] ?? null,
                    'reference' => $payload['reference'] ?? null,
                    'description' => $payload['description'] ?? null,
                ]);
                $movements[] = $movement;
                $results[] = [
                    'item_id' => $item->id,
                    'name' => $item->name,
                    'quantity' => $quantity,
                    'entered_quantity' => (int) ($line['quantity'] ?? $quantity),
                    'unit' => $line['unit'] ?? InventoryItem::UOM_BASE,
                    'movement_id' => $movement->id,
                    'new_stock' => $movement->new_stock,
                ];
            }

            return [
                'transaction_no' => $transactionNo,
                'transaction_type' => $transactionType,
                'movements' => $movements,
                'lines' => $results,
            ];
        });
    }

    private function executeStockInLine(InventoryItem $item, int $quantity, array $line, array $context): InventoryLog
    {
        $stockBefore = (int) $item->stock;
        $batchFields = [
            'batch_no' => $line['batch_no'] ?? null,
            'expiration_date' => $line['expiration_date'] ?? null,
            'manufacturing_date' => $line['manufacturing_date'] ?? null,
            'received_date' => $line['received_date'] ?? null,
            'supplier' => $line['supplier'] ?? $context['supplier'] ?? null,
            'unit_cost' => $line['unit_cost'] ?? null,
        ];
        $needsBatch = $item->needsFefo() || $item->hasRealBatches()
            || !empty($batchFields['expiration_date']) || !empty($batchFields['batch_no']);

        $reasonText = self::STOCK_IN_TYPES[$context['transaction_type']]
            . ($context['description'] ? ': ' . $context['description'] : '');

        $logExtra = [
            'movement_type' => 'stock_in',
            'type' => 'stock_in',
            'reason' => $reasonText,
            'reason_code' => $context['transaction_type'],
            'transaction_no' => $context['transaction_no'],
            'reference_type' => 'stock_in',
            'reference' => $context['reference'],
            'details' => array_merge([
                'transaction_type' => $context['transaction_type'],
                'supplier' => $context['supplier'],
                'reference' => $context['reference'],
                'description' => $context['description'],
                'line' => $batchFields,
            ], isset($line['unit']) && $line['unit'] !== InventoryItem::UOM_BASE ? [
                // UOM traceability: quantity above is always base units;
                // record what the operator actually entered.
                'uom' => [
                    'entered_quantity' => (int) ($line['quantity'] ?? $quantity),
                    'unit' => $line['unit'],
                    'base_quantity' => $quantity,
                ],
            ] : []),
        ];

        if ($needsBatch) {
            if ($item->needsFefo() && empty($batchFields['expiration_date'])) {
                throw ValidationException::withMessages([
                    'expiration_date' => "Expiration date is required for {$item->name}.",
                ]);
            }
            $item->addBatchStock(
                $quantity,
                $batchFields['batch_no'],
                $batchFields['expiration_date'],
                $reasonText,
                true,
                $batchFields['manufacturing_date'],
                $batchFields['supplier'],
                isset($batchFields['unit_cost']) ? (float) $batchFields['unit_cost'] : null,
                null,
                $batchFields['received_date'],
                $logExtra
            );
            $fresh = $item->fresh();
            $this->notifyInventoryMovement($fresh, $quantity, $reasonText, 'stock_in', null, $stockBefore, (int) $fresh->stock);

            return $this->latestMovementFor($item);
        }

        $item->increment('stock', $quantity);
        $item = $item->fresh();
        $movement = InventoryLog::create(array_merge([
            'inventory_item_id' => $item->id,
            'delta' => $quantity,
            'quantity' => $quantity,
            'stock_before' => $stockBefore,
            'stock_after' => $item->stock,
            'previous_stock' => $stockBefore,
            'new_stock' => $item->stock,
            'performed_by' => auth()->user()?->name,
            'role' => auth()->user()?->role,
            'user_id' => auth()->id(),
            'details' => json_encode($logExtra['details']),
        ], \Illuminate\Support\Arr::except($logExtra, 'details')));

        $this->notifyInventoryMovement($item, $quantity, $reasonText, 'stock_in', null, $stockBefore, (int) $item->stock);

        return $movement;
    }

    /**
     * Convert a transaction line's entered quantity into base units using
     * the item's UOM configuration (panel §8.3). `unit` may be 'base'
     * (default), 'pack' or 'box'; pack/box require the corresponding
     * pack_size/box_size on the item. Returns the base-unit quantity.
     */
    private function resolveUomBaseQuantity(InventoryItem $item, array $line, int $index): int
    {
        $entered = (int) ($line['quantity'] ?? 0);
        $unit = $line['unit'] ?? null;

        if ($entered <= 0) {
            return $entered;
        }

        $multiplier = $item->uomMultiplier($unit);
        if ($multiplier === null) {
            $allowed = implode(', ', array_column($item->uomOptions(), 'label'));
            throw ValidationException::withMessages([
                "items.{$index}.unit" => "{$item->name} does not support the \"{$unit}\" unit. Allowed: {$allowed}.",
            ]);
        }

        return $entered * $multiplier;
    }

    private function validateStockOutReasonFields(string $reasonCode, array $payload): void
    {
        $required = self::STOCK_OUT_REQUIRED_FIELDS[$reasonCode] ?? [];
        $errors = [];
        foreach ($required as $field) {
            if (trim((string) ($payload[$field] ?? '')) === '') {
                $errors[$field] = "This field is required for the \"{$reasonCode}\" removal reason.";
            }
        }
        if (!empty($errors)) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * Record a multi-item Stock Out transaction. Sensitive reasons create a
     * pending approval request and leave stock untouched; non-sensitive
     * reasons execute immediately. Either way the response states what
     * happened so callers can't misreport a queued request as a deduction.
     */
    public function recordStockOut(array $payload): array
    {
        $reasonCode = $payload['reason_code'] ?? '';
        if (!array_key_exists($reasonCode, self::STOCK_OUT_REASONS)) {
            throw ValidationException::withMessages(['reason_code' => 'Select a valid removal reason.']);
        }
        $this->validateStockOutReasonFields($reasonCode, $payload);

        $lines = $payload['items'] ?? [];
        if (empty($lines) || !is_array($lines)) {
            throw ValidationException::withMessages(['items' => 'Add at least one inventory item.']);
        }

        // Lock ordering: sort lines by item id so concurrent multi-item
        // transactions acquire row locks in a consistent order — otherwise
        // reversed submissions ([a,b] vs [b,a]) can deadlock.
        usort($lines, fn ($a, $b) => ($a['inventory_item_id'] ?? $a['item_id'] ?? 0) <=> ($b['inventory_item_id'] ?? $b['item_id'] ?? 0));

        // Resolve per-line intent under item locks so the queue decision and
        // (for immediate execution) the deduction see one consistent snapshot.
        return DB::transaction(function () use ($payload, $lines, $reasonCode) {
            $resolved = [];

            foreach ($lines as $index => $line) {
                $itemId = (int) ($line['inventory_item_id'] ?? $line['item_id'] ?? 0);
                $item = InventoryItem::lockForUpdate()->findOrFail($itemId);

                if ($item->status !== self::STATUS_ACTIVE || $item->archived_at) {
                    throw ValidationException::withMessages(["items.{$index}" => "{$item->name} is not an active inventory item."]);
                }

                if ($reasonCode === 'correction') {
                    if (!array_key_exists('physical_count', (array) $line)) {
                        throw ValidationException::withMessages(["items.{$index}.physical_count" => 'Enter the physical count for this item.']);
                    }
                    $physical = (int) $line['physical_count'];
                    if ($physical < 0) {
                        throw ValidationException::withMessages(["items.{$index}.physical_count" => 'Physical count cannot be negative.']);
                    }
                    $delta = $physical - (int) $item->stock;
                    if ($delta === 0) {
                        continue; // counted correctly — nothing to record
                    }
                    $resolved[] = [
                        'item' => $item,
                        'quantity' => abs($delta),
                        'batch_id' => null,
                        'line_details' => [
                            'physical_count' => $physical,
                            'system_count' => (int) $item->stock,
                            'delta' => $delta,
                            'direction' => $delta > 0 ? 'increase' : 'decrease',
                        ],
                    ];
                } else {
                    $quantity = $this->resolveUomBaseQuantity($item, (array) $line, $index);
                    if ($quantity <= 0) {
                        throw ValidationException::withMessages(["items.{$index}.quantity" => 'Quantity must be greater than zero.']);
                    }
                    if ($quantity > (int) $item->stock) {
                        throw ValidationException::withMessages(["items.{$index}.quantity" => "Only {$item->stock} units of {$item->name} are available."]);
                    }
                    if (!empty($line['batch_id']) && !$item->batches()->where('id', (int) $line['batch_id'])->exists()) {
                        throw ValidationException::withMessages(["items.{$index}.batch_id" => "The selected batch does not belong to {$item->name}."]);
                    }
                    $resolved[] = [
                        'item' => $item,
                        'quantity' => $quantity,
                        'batch_id' => isset($line['batch_id']) ? (int) $line['batch_id'] : null,
                        'line_details' => array_merge((array) $line, [
                            'base_quantity' => $quantity,
                            'base_unit' => $item->baseUnitLabel(),
                        ]),
                    ];
                }
            }

            if (empty($resolved)) {
                throw ValidationException::withMessages(['items' => 'No stock changes to record.']);
            }

            if ($this->stockOutRequiresApproval($reasonCode, $resolved)) {
                return $this->queueStockOutRequest($payload, $resolved, $reasonCode);
            }

            $transactionNo = $this->nextTransactionNo('OUT');
            $movements = [];
            foreach ($resolved as $line) {
                $movements[] = $this->executeStockOutLine($line['item'], $line['quantity'], $reasonCode, $payload, [
                    'transaction_no' => $transactionNo,
                    'reference_type' => 'stock_out',
                    'reference_id' => null,
                    'batch_id' => $line['batch_id'],
                    'line_details' => $line['line_details'],
                ]);
            }

            return [
                'queued' => false,
                'transaction_no' => $transactionNo,
                'reason_code' => $reasonCode,
                'movements' => $movements,
            ];
        });
    }

    private function stockOutRequiresApproval(string $reasonCode, array $resolvedLines): bool
    {
        if (in_array($reasonCode, self::STOCK_OUT_APPROVAL_REASONS, true)) {
            return true;
        }
        if ($reasonCode === 'correction') {
            $threshold = (int) env('INVENTORY_CORRECTION_APPROVAL_THRESHOLD', 10);
            foreach ($resolvedLines as $line) {
                if ($line['quantity'] > $threshold) {
                    return true;
                }
            }
        }
        return false;
    }

    private function queueStockOutRequest(array $payload, array $resolvedLines, string $reasonCode): array
    {
        $transactionNo = $this->nextTransactionNo('OUT');
        $request = InventoryStockRequest::create([
            'request_no' => $this->nextTransactionNo('SR'),
            'transaction_no' => $transactionNo,
            'reason_code' => $reasonCode,
            'status' => InventoryStockRequest::STATUS_PENDING,
            'request_payload' => \Illuminate\Support\Arr::except($payload, 'items'),
            'requested_by' => auth()->id(),
        ]);

        foreach ($resolvedLines as $line) {
            $request->items()->create([
                'inventory_item_id' => $line['item']->id,
                'quantity' => $line['quantity'],
                'batch_id' => $line['batch_id'],
                'line_details' => $line['line_details'],
            ]);
        }

        $message = sprintf(
            '%s requested "%s" stock-out for %d item(s) — %s',
            auth()->user()?->name ?? 'Staff',
            self::STOCK_OUT_REASONS[$reasonCode],
            count($resolvedLines),
            $request->request_no
        );
        $meta = ['request_no' => $request->request_no, 'reason_code' => $reasonCode];
        WorkflowNotifier::notifyRole('manager', 'Stock-Out Approval Requested', $message, 'warning', 'inventory_stock_request', $request->id, $meta);
        WorkflowNotifier::notifyRole('admin', 'Stock-Out Approval Requested', $message, 'warning', 'inventory_stock_request', $request->id, $meta);

        return [
            'queued' => true,
            'request' => $request->fresh(['items.item', 'requester']),
            'transaction_no' => $transactionNo,
            'reason_code' => $reasonCode,
        ];
    }

    /**
     * Approve a pending stock-out request and execute its deductions
     * atomically. Any line failing (e.g. stock dropped while pending) rolls
     * everything back — the request stays pending for retry or rejection.
     */
    public function approveStockRequest(int $requestId, ?string $remarks, User $reviewer): array
    {
        return DB::transaction(function () use ($requestId, $remarks, $reviewer) {
            $request = InventoryStockRequest::with('items')->lockForUpdate()->findOrFail($requestId);

            if ($request->status !== InventoryStockRequest::STATUS_PENDING) {
                throw ValidationException::withMessages(['request' => 'Only pending requests can be approved.']);
            }
            if ((int) $request->requested_by === (int) $reviewer->id) {
                throw ValidationException::withMessages(['request' => 'You cannot approve your own stock-out request.']);
            }

            $payload = (array) ($request->request_payload ?? []);
            $reasonCode = $request->reason_code;

            // Lock ordering: execute lines in item-id order, consistent with
            // recordStockOut/recordStockIn — prevents deadlocks between two
            // pending requests covering overlapping items.
            $requestItems = $request->items->sortBy('inventory_item_id');

            foreach ($requestItems as $line) {
                $item = InventoryItem::lockForUpdate()->findOrFail($line->inventory_item_id);
                $movement = $this->executeStockOutLine($item, (int) $line->quantity, $reasonCode, $payload, [
                    'transaction_no' => $request->transaction_no,
                    'reference_type' => 'stock_request',
                    'reference_id' => $request->id,
                    'batch_id' => $line->batch_id,
                    'line_details' => (array) ($line->line_details ?? []),
                ]);
                $line->update(['movement_id' => $movement->id]);
            }

            $request->update([
                'status' => InventoryStockRequest::STATUS_APPROVED,
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
                'review_remarks' => $remarks,
                'executed_at' => now(),
            ]);

            WorkflowNotifier::notifyUser(
                $request->requested_by,
                'Stock-Out Request Approved',
                "{$request->request_no} (" . (self::STOCK_OUT_REASONS[$reasonCode] ?? $reasonCode) . ") was approved by {$reviewer->name} and stock was deducted.",
                'success',
                'inventory_stock_request',
                $request->id
            );

            return ['request' => $request->fresh(['items.item', 'requester', 'reviewer'])];
        });
    }

    /**
     * Reject a pending stock-out request. Never touches stock.
     */
    public function rejectStockRequest(int $requestId, string $remarks, User $reviewer): array
    {
        return DB::transaction(function () use ($requestId, $remarks, $reviewer) {
            $request = InventoryStockRequest::lockForUpdate()->findOrFail($requestId);

            if ($request->status !== InventoryStockRequest::STATUS_PENDING) {
                throw ValidationException::withMessages(['request' => 'Only pending requests can be rejected.']);
            }

            $request->update([
                'status' => InventoryStockRequest::STATUS_REJECTED,
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
                'review_remarks' => $remarks,
            ]);

            WorkflowNotifier::notifyUser(
                $request->requested_by,
                'Stock-Out Request Rejected',
                "{$request->request_no} was rejected by {$reviewer->name}: {$remarks}",
                'error',
                'inventory_stock_request',
                $request->id
            );

            return ['request' => $request->fresh(['items.item', 'requester', 'reviewer'])];
        });
    }

    /**
     * Execute one stock-out line. Correction lines apply their recorded
     * physical count (set-semantics through reconcileToStock); write-off
     * reasons deplete physical batches including expired lots; consumption
     * reasons deduct sellable batches FEFO like POS.
     */
    private function executeStockOutLine(InventoryItem $item, int $quantity, string $reasonCode, array $requestPayload, array $options): InventoryLog
    {
        $stockBefore = (int) $item->stock;
        $reasonLabel = self::STOCK_OUT_REASONS[$reasonCode] ?? $reasonCode;
        $lineDetails = (array) ($options['line_details'] ?? []);
        $referenceType = $options['reference_type'] ?? 'stock_out';
        $referenceId = $options['reference_id'] ?? null;
        $transactionNo = $options['transaction_no'];

        if ($reasonCode === 'correction') {
            $target = (int) ($lineDetails['physical_count'] ?? $item->stock);
            $reasonText = 'Inventory correction: ' . ($requestPayload['explanation'] ?? 'physical count adjustment');
            $this->reconcileToStock(
                $item->fresh(),
                $target,
                $reasonText,
                'stock_out',
                $referenceType,
                $referenceId,
                'CORR',
                [],
                [
                    'reason_code' => $reasonCode,
                    'transaction_no' => $transactionNo,
                    'details' => [
                        'physical_count' => $target,
                        'explanation' => $requestPayload['explanation'] ?? null,
                    ],
                ]
            );

            return $this->latestMovementFor($item);
        }

        $reasonText = $reasonLabel . $this->stockOutReasonSuffix($reasonCode, $requestPayload);
        $logExtra = [
            'movement_type' => 'stock_out',
            'type' => 'stock_out',
            'reason' => $reasonText,
            'reason_code' => $reasonCode,
            'transaction_no' => $transactionNo,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'details' => [
                'request' => \Illuminate\Support\Arr::except($requestPayload, 'items'),
                'line' => $lineDetails,
            ],
        ];

        if ($quantity > (int) $item->stock) {
            throw ValidationException::withMessages([
                'quantity' => "Only {$item->stock} units of {$item->name} are available.",
            ]);
        }

        if ($item->hasRealBatches() && !in_array($reasonCode, self::STOCK_OUT_WRITE_OFF_REASONS, true)) {
            // Sellable-batches FEFO — same path as POS deductions.
            $item->deductStockFefo($quantity, $reasonText, 'stock_out', $referenceType, $referenceId, $options['batch_id'] ?? null, $logExtra);
        } else {
            $batchWriteOffs = $item->hasRealBatches()
                ? $this->writeOffBatches($item, $quantity, $options['batch_id'] ?? null)
                : [];
            $item->decrement('stock', $quantity);
            $item = $item->fresh();
            InventoryLog::create(array_merge([
                'inventory_item_id' => $item->id,
                'delta' => -$quantity,
                'quantity' => $quantity,
                'stock_before' => $stockBefore,
                'stock_after' => $item->stock,
                'previous_stock' => $stockBefore,
                'new_stock' => $item->stock,
                'performed_by' => auth()->user()?->name,
                'role' => auth()->user()?->role,
                'user_id' => auth()->id(),
                'details' => json_encode(array_merge(['batch_writeoffs' => $batchWriteOffs], $logExtra['details'])),
            ], \Illuminate\Support\Arr::except($logExtra, 'details')));
        }

        $movement = $this->latestMovementFor($item);
        $fresh = $item->fresh();
        $this->checkAndCreateStockNotifications($fresh);
        $this->notifyInventoryMovement($fresh, -$quantity, $reasonText, $referenceType, $referenceId, $stockBefore, (int) $fresh->stock);

        return $movement;
    }

    private function stockOutReasonSuffix(string $reasonCode, array $payload): string
    {
        $fragments = match ($reasonCode) {
            'damaged' => [$payload['damage_details'] ?? null],
            'expired' => [$payload['disposal_details'] ?? null],
            'lost_missing' => [$payload['incident_details'] ?? null],
            'internal_usage' => [$payload['department'] ?? null, $payload['purpose'] ?? null],
            'service_consumption' => [$payload['service_reference'] ?? null],
            'supplier_return' => [$payload['supplier'] ?? null, $payload['return_reference'] ?? null],
            'disposal' => [$payload['disposal_method'] ?? null],
            'correction', 'other' => [$payload['explanation'] ?? null],
            default => [],
        };
        $fragments = array_filter($fragments, fn ($v) => $v !== null && trim((string) $v) !== '');

        return $fragments ? ': ' . implode(' — ', $fragments) : '';
    }

    /**
     * Write off up to $amount from physical batches (includes expired lots
     * awaiting disposal). Optional preferred batch first. Returns per-batch
     * write-off detail; a shortfall vs. the flat stock counter is tolerated —
     * the counter is authoritative and reconcile-stock reports the drift.
     */
    private function writeOffBatches(InventoryItem $item, int $amount, ?int $preferredBatchId = null): array
    {
        $writeOffs = [];
        $remaining = $amount;

        if ($preferredBatchId) {
            $batch = $item->batches()
                ->where('id', $preferredBatchId)
                ->where('remaining_quantity', '>', 0)
                ->whereNotIn('status', ['depleted', 'disposed'])
                ->first();
            if ($batch) {
                $take = min($batch->remaining_quantity, $remaining);
                $batch->remaining_quantity -= $take;
                if ($batch->remaining_quantity <= 0) {
                    $batch->status = 'depleted';
                }
                $batch->save();
                $writeOffs[] = ['batch_id' => $batch->id, 'batch_no' => $batch->batch_no, 'amount' => $take];
                $remaining -= $take;
            }
        }

        if ($remaining > 0) {
            $batches = $item->physicalBatches()
                ->when($preferredBatchId, fn ($q) => $q->where('id', '!=', $preferredBatchId))
                ->get();
            foreach ($batches as $batch) {
                if ($remaining <= 0) {
                    break;
                }
                $take = min($batch->remaining_quantity, $remaining);
                $batch->remaining_quantity -= $take;
                if ($batch->remaining_quantity <= 0) {
                    $batch->status = 'depleted';
                }
                $batch->save();
                $writeOffs[] = ['batch_id' => $batch->id, 'batch_no' => $batch->batch_no, 'amount' => $take];
                $remaining -= $take;
            }
        }

        return $writeOffs;
    }

    /**
     * Reverse part or all of a reversible stock movement. Direction follows
     * the original delta: a deduction is restored upward, an erroneous
     * stock-in is removed downward. Never deletes or rewrites the original.
     */
    public function reverseMovement(int $logId, int $quantity, string $reason): array
    {
        return DB::transaction(function () use ($logId, $quantity, $reason) {
            $original = InventoryLog::lockForUpdate()->findOrFail($logId);

            if (!in_array($original->movement_type, self::REVERSIBLE_MOVEMENT_TYPES, true)) {
                throw ValidationException::withMessages([
                    'movement' => 'This movement cannot be reversed. POS, order and service deductions are restored through their own workflows.',
                ]);
            }

            // Approval-bypass guard: a deduction that was executed through the
            // manager/admin approval queue must not be silently undone by the
            // requester — reversing it requires a manager or admin, so the
            // same tier that authorized the removal also authorizes restoring it.
            if ($original->reference_type === 'stock_request') {
                $role = strtolower((string) (auth()->user()?->role ?? ''));
                if (!in_array($role, ['manager', 'admin', 'super_admin'], true)) {
                    throw ValidationException::withMessages([
                        'movement' => 'This movement came from an approved stock-out request. Only a manager or admin can reverse it.',
                    ]);
                }
            }

            if ($quantity <= 0) {
                throw ValidationException::withMessages(['quantity' => 'Quantity must be greater than zero.']);
            }

            $reversibleBase = abs((int) ($original->delta ?? $original->quantity ?? 0));
            $remaining = $reversibleBase - (int) ($original->reversed_quantity ?? 0);
            if ($reversibleBase <= 0 || $remaining <= 0) {
                throw ValidationException::withMessages(['movement' => 'This movement has already been fully reversed.']);
            }
            if ($quantity > $remaining) {
                throw ValidationException::withMessages(['quantity' => "Only {$remaining} units remain reversible."]);
            }

            $item = InventoryItem::lockForUpdate()->findOrFail($original->inventory_item_id);
            $stockBefore = (int) $item->stock;
            $restore = (int) ($original->delta ?? 0) < 0; // deduction → restore upward
            $reasonText = "Reversal of movement #{$original->id}: {$reason}";
            $transactionNo = $this->nextTransactionNo('REV');
            $logExtra = [
                'movement_type' => 'stock_reversal',
                'type' => 'stock_reversal',
                'reason' => $reasonText,
                'reason_code' => 'reversal',
                'reference_type' => 'reversal',
                'reference_id' => $original->id,
                'original_movement_id' => $original->id,
                'transaction_no' => $transactionNo,
                'details' => [
                    'reversal_reason' => $reason,
                    'original_reason_code' => $original->reason_code,
                    'original_movement_type' => $original->movement_type,
                ],
            ];

            if ($restore) {
                if ($item->hasRealBatches() || $item->needsFefo()) {
                    $item->addBatchStock(
                        $quantity,
                        'REVR-' . strtoupper(Str::random(5)),
                        null,
                        $reasonText,
                        true,
                        null,
                        null,
                        null,
                        null,
                        now()->toDateString(),
                        $logExtra
                    );
                } else {
                    $item->increment('stock', $quantity);
                    $item = $item->fresh();
                    InventoryLog::create(array_merge([
                        'inventory_item_id' => $item->id,
                        'delta' => $quantity,
                        'quantity' => $quantity,
                        'stock_before' => $stockBefore,
                        'stock_after' => $item->stock,
                        'previous_stock' => $stockBefore,
                        'new_stock' => $item->stock,
                        'performed_by' => auth()->user()?->name,
                        'role' => auth()->user()?->role,
                        'user_id' => auth()->id(),
                        'details' => json_encode($logExtra['details']),
                    ], \Illuminate\Support\Arr::except($logExtra, 'details')));
                }
            } else {
                if ($quantity > (int) $item->stock) {
                    throw ValidationException::withMessages([
                        'quantity' => "Cannot reverse: only {$item->stock} units of {$item->name} remain in stock.",
                    ]);
                }
                $batchWriteOffs = $item->hasRealBatches() ? $this->writeOffBatches($item, $quantity) : [];
                $item->decrement('stock', $quantity);
                $item = $item->fresh();
                InventoryLog::create(array_merge([
                    'inventory_item_id' => $item->id,
                    'delta' => -$quantity,
                    'quantity' => $quantity,
                    'stock_before' => $stockBefore,
                    'stock_after' => $item->stock,
                    'previous_stock' => $stockBefore,
                    'new_stock' => $item->stock,
                    'performed_by' => auth()->user()?->name,
                    'role' => auth()->user()?->role,
                    'user_id' => auth()->id(),
                    'details' => json_encode(array_merge(['batch_writeoffs' => $batchWriteOffs], $logExtra['details'])),
                ], \Illuminate\Support\Arr::except($logExtra, 'details')));
            }

            $original->increment('reversed_quantity', $quantity);
            $movement = $this->latestMovementFor($item);

            $fresh = $item->fresh();
            $delta = $restore ? $quantity : -$quantity;
            $this->checkAndCreateStockNotifications($fresh);
            $this->notifyInventoryMovement($fresh, $delta, $reasonText, 'reversal', $original->id, $stockBefore, (int) $fresh->stock);

            return [
                'movement' => $movement,
                'original_movement' => $original->fresh(),
                'reversed' => $quantity,
                'remaining_reversible' => $remaining - $quantity,
            ];
        });
    }

    /*
    |----------------------------------------------------------------------
    | Customer product returns (inspection → disposition)
    |----------------------------------------------------------------------
    */

    public function createReturn(array $payload): array
    {
        return DB::transaction(function () use ($payload) {
            // Serialize source-quantity checks for this item so simultaneous
            // returns cannot both consume the same remaining sold quantity.
            $item = InventoryItem::lockForUpdate()->findOrFail($payload['inventory_item_id']);
            $this->validateReturnSource($payload, $item);

            $return = InventoryReturn::create([
                'return_no' => $this->nextTransactionNo('RET'),
                'source_type' => $payload['source_type'] ?? 'manual',
                'source_id' => $payload['source_id'] ?? null,
                'inventory_item_id' => $item->id,
                'quantity' => (int) $payload['quantity'],
                'return_reason' => $payload['return_reason'] ?? null,
                'photo' => $payload['photo'] ?? null,
                'received_by' => auth()->id(),
            ]);

            WorkflowNotifier::notifyRole(
                'inventory',
                'Product Return Received',
                "{$item->name}: {$return->quantity} unit(s) returned — pending inspection ({$return->return_no}).",
                'info',
                'inventory_return',
                $return->id
            );

            return ['return' => $return->fresh(['item', 'receiver'])];
        });
    }

    /**
     * Verify a source-linked return references a real sale/order and does not
     * exceed the returnable quantity. Every created return counts against the
     * sold quantity regardless of later disposition — the goods physically
     * came back — so restocked, quarantined, damaged and disposed returns all
     * reduce what can still be returned.
     */
    private function validateReturnSource(array $payload, InventoryItem $item): void
    {
        $sourceType = $payload['source_type'] ?? 'manual';
        $sourceId = $payload['source_id'] ?? null;
        if ($sourceType === 'manual' || !$sourceId) {
            return;
        }

        $quantity = (int) $payload['quantity'];

        $sold = match ($sourceType) {
            'sale' => (int) DB::table('sale_items')
                ->where('sale_id', $sourceId)
                ->where('item_type', 'product')
                ->where('product_id', $item->id)
                ->sum('quantity'),
            'customer_order' => (int) DB::table('customer_order_items')
                ->where('customer_order_id', $sourceId)
                ->where('inventory_item_id', $item->id)
                ->sum('quantity'),
            default => -1,
        };

        if ($sold === -1) {
            throw ValidationException::withMessages(['source_type' => 'Unsupported return source type.']);
        }
        if ($sold === 0) {
            throw ValidationException::withMessages([
                'source_id' => "This item was not part of {$sourceType} #{$sourceId}.",
            ]);
        }

        // Locking read: the item row lock acquired above serializes returns
        // for this item, but a plain consistent read would still use the
        // transaction's pre-lock snapshot and miss a just-committed return.
        $alreadyReturned = (int) InventoryReturn::where('source_type', $sourceType)
            ->where('source_id', $sourceId)
            ->where('inventory_item_id', $item->id)
            ->lockForUpdate()
            ->sum('quantity');

        $remaining = $sold - $alreadyReturned;
        if ($quantity > $remaining) {
            throw ValidationException::withMessages([
                'quantity' => $remaining > 0
                    ? "Only {$remaining} unit(s) can still be returned from {$sourceType} #{$sourceId}."
                    : "All {$sold} unit(s) from {$sourceType} #{$sourceId} have already been returned.",
            ]);
        }
    }

    /**
     * Apply an inspection disposition to a return. Only `restock` changes
     * stock (a linked stock-in movement); quarantine/damaged/dispose write a
     * zero-delta tracking entry so the physical goods stay out of sellable
     * stock but remain auditable.
     */
    public function setReturnDisposition(int $id, string $disposition, ?string $notes, User $inspector, ?string $photo = null): array
    {
        return DB::transaction(function () use ($id, $disposition, $notes, $inspector, $photo) {
            $return = InventoryReturn::lockForUpdate()->findOrFail($id);

            $allowed = match ($return->status) {
                InventoryReturn::STATUS_PENDING => ['restock', 'quarantine', 'damaged', 'dispose'],
                InventoryReturn::STATUS_QUARANTINED => ['restock', 'dispose'],
                default => [],
            };
            if (!in_array($disposition, $allowed, true)) {
                throw ValidationException::withMessages([
                    'disposition' => "This return cannot be dispositioned as \"{$disposition}\" (current status: {$return->status}).",
                ]);
            }

            $item = InventoryItem::lockForUpdate()->findOrFail($return->inventory_item_id);
            $movement = null;

            if ($disposition === 'restock') {
                $reasonText = "Customer return {$return->return_no} approved for restock";
                $logExtra = [
                    'movement_type' => 'customer_return_restock',
                    'type' => 'customer_return',
                    'reason' => $reasonText,
                    'reason_code' => 'customer_return',
                    'reference_type' => 'inventory_return',
                    'reference_id' => $return->id,
                    'details' => [
                        'return_no' => $return->return_no,
                        'source_type' => $return->source_type,
                        'source_id' => $return->source_id,
                        'inspection_notes' => $notes,
                    ],
                ];
                if ($item->hasRealBatches() || $item->needsFefo()) {
                    $item->addBatchStock(
                        (int) $return->quantity,
                        'RET-' . strtoupper(Str::random(5)),
                        null,
                        $reasonText,
                        true,
                        null,
                        null,
                        null,
                        null,
                        now()->toDateString(),
                        $logExtra
                    );
                } else {
                    $stockBefore = (int) $item->stock;
                    $item->increment('stock', (int) $return->quantity);
                    $item = $item->fresh();
                    InventoryLog::create(array_merge([
                        'inventory_item_id' => $item->id,
                        'delta' => (int) $return->quantity,
                        'quantity' => (int) $return->quantity,
                        'stock_before' => $stockBefore,
                        'stock_after' => $item->stock,
                        'previous_stock' => $stockBefore,
                        'new_stock' => $item->stock,
                        'performed_by' => $inspector->name,
                        'role' => $inspector->role,
                        'user_id' => $inspector->id,
                        'details' => json_encode($logExtra['details']),
                    ], \Illuminate\Support\Arr::except($logExtra, 'details')));
                }
                $movement = $this->latestMovementFor($item);
                $newStatus = InventoryReturn::STATUS_RESTOCKED;
            } else {
                $movement = InventoryLog::create([
                    'inventory_item_id' => $item->id,
                    'delta' => 0,
                    'quantity' => (int) $return->quantity,
                    'type' => 'return_disposition',
                    'movement_type' => 'return_disposition',
                    'reason' => "Return {$return->return_no} disposition: {$disposition}" . ($notes ? " — {$notes}" : ''),
                    'reason_code' => 'return_' . $disposition,
                    'reference_type' => 'inventory_return',
                    'reference_id' => $return->id,
                    'stock_before' => $item->stock,
                    'stock_after' => $item->stock,
                    'previous_stock' => $item->stock,
                    'new_stock' => $item->stock,
                    'performed_by' => $inspector->name,
                    'role' => $inspector->role,
                    'user_id' => $inspector->id,
                    'details' => json_encode([
                        'return_no' => $return->return_no,
                        'disposition' => $disposition,
                        'inspection_notes' => $notes,
                    ]),
                ]);
                $newStatus = match ($disposition) {
                    'quarantine' => InventoryReturn::STATUS_QUARANTINED,
                    'damaged' => InventoryReturn::STATUS_DAMAGED,
                    default => InventoryReturn::STATUS_DISPOSED,
                };
            }

            $return->update([
                'status' => $newStatus,
                'disposition' => $disposition,
                'inspection_notes' => $notes,
                'photo' => $photo ?? $return->photo,
                'inspected_by' => $inspector->id,
                'inspected_at' => now(),
                'movement_id' => $movement?->id,
            ]);

            WorkflowNotifier::notifyRole(
                'inventory',
                'Return Dispositioned',
                "{$item->name}: {$return->quantity} unit(s) — {$disposition} ({$return->return_no}).",
                'info',
                'inventory_return',
                $return->id
            );

            return ['return' => $return->fresh(['item', 'receiver', 'inspector', 'movement']), 'movement' => $movement];
        });
    }

    /**
     * Check stock levels and create notifications for admin/inventory users
     */
    private function checkAndCreateStockNotifications(InventoryItem $item): void
    {
        $newStock = $item->stock;
        $reorderLevel = $item->reorder_level ?? 10;

        // Only notify if stock is low or out
        if ($newStock > $reorderLevel) {
            return;
        }

        // Inventory staff, managers and admins (including composite roles)
        $users = User::whereIn('role', ['admin', 'manager', 'inventory', 'super_receptionist'])
            ->where('is_active', true)
            ->get();

        $title = $newStock <= 0 ? 'Out of Stock Alert' : 'Low Stock Alert';
        $type = $newStock <= 0 ? 'error' : 'warning';
        $message = $newStock <= 0
            ? "{$item->name} is now OUT OF STOCK."
            : "{$item->name} is running low ({$newStock} left, reorder at {$reorderLevel}).";

        foreach ($users as $user) {
            // Deduplicate: skip if this user already has an unread alert for the
            // same item at the same severity level (prevents spam on repeat
            // deductions while stock stays below the reorder level).
            $alreadyNotified = Notification::where('user_id', $user->id)
                ->where('related_type', 'inventory')
                ->where('related_id', $item->id)
                ->where('title', $title)
                ->where('read', false)
                ->exists();

            if ($alreadyNotified) {
                continue;
            }

            Notification::create([
                'user_id' => $user->id,
                'title' => $title,
                'message' => $message,
                'type' => $type,
                'related_type' => 'inventory',
                'related_id' => $item->id,
            ]);
        }
    }
}
