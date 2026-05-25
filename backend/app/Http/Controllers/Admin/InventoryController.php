<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\InventoryItem;
use App\Models\InventoryBatch;
use App\Models\InventoryLog;
use App\Models\InventoryMonthlyAudit;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Str;
use Illuminate\Validation\ValidationException;

class InventoryController extends Controller
{
    private InventoryService $inventoryService;

    public function __construct(InventoryService $inventoryService)
    {
        $this->inventoryService = $inventoryService;
    }
    /**
     * Display a listing of inventory items with optional filtering
     */
    public function index(Request $request)
    {
        $query = InventoryItem::query();

        // Filter by category
        if ($request->has('category')) {
            $query->where('category', $request->category);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by stock level
        if ($request->has('stock_level')) {
            switch ($request->stock_level) {
                case 'low':
                    $query->whereRaw('stock <= reorder_level')->where('stock', '>', 0);
                    break;
                case 'out':
                    $query->where('stock', 0);
                    break;
                case 'in_stock':
                    $query->where('stock', '>', 0);
                    break;
            }
        }

        // Search by name or SKU
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('sku', 'like', "%{$search}%");
            });
        }

        $items = $query->orderBy('name')->paginate($request->per_page ?? 20);

        return response()->json(array_merge($items->toArray(), [
            'items' => $items->items(),
        ]));
    }

    /**
     * Handle photo file upload for inventory items
     */
    private function handlePhotoUpload(Request $request, array $data): array
    {
        if ($request->hasFile('photo')) {
            $file = $request->file('photo');
            if ($file->isValid()) {
                $uploadDir = public_path('uploads/inventory');
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0755, true);
                }
                $filename = 'inv_' . time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
                $file->move($uploadDir, $filename);
                $data['photo'] = 'uploads/inventory/' . $filename;
            }
        }
        return $data;
    }

    /**
     * Store a newly created inventory item
     */
    public function store(Request $request)
    {
        try {
            $data = $this->handlePhotoUpload($request, $request->all());
            $result = $this->inventoryService->createItem($data);
            return response()->json($result, 201);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * Display the specified inventory item
     */
    public function show($id)
    {
        $item = InventoryItem::with(['logs' => function ($query) {
            $query->latest()->limit(20);
        }])->findOrFail($id);

        return response()->json(['item' => $item]);
    }

    /**
     * Update the specified inventory item
     */
    public function update(Request $request, $id)
    {
        try {
            $data = $this->handlePhotoUpload($request, $request->all());
            $result = $this->inventoryService->updateItem($id, $data);
            return response()->json($result);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * Archive the specified inventory item (replaces delete)
     */
    public function destroy($id)
    {
        try {
            $reason = (string) request('reason', 'Archived via inventory management');
            $result = $this->inventoryService->archiveItem($id, $reason);
            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * Archive an inventory item with explicit reason
     */
    public function archive(Request $request, $id)
    {
        $validated = $request->validate([
            'reason' => 'required|string|max:255',
        ]);

        try {
            $result = $this->inventoryService->archiveItem($id, $validated['reason']);
            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * Get archived inventory items
     */
    public function archived(Request $request)
    {
        $query = InventoryItem::where('status', 'archived')
            ->with(['archivedBy'])
            ->orderBy('archived_at', 'desc');

        // Search functionality
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('sku', 'like', "%{$search}%");
            });
        }

        $items = $query->paginate($request->per_page ?? 20);

        return response()->json(array_merge($items->toArray(), [
            'items' => $items->items(),
        ]));
    }

    /**
     * Unarchive an inventory item
     */
    public function unarchive(Request $request, $id)
    {
        try {
            $item = InventoryItem::findOrFail($id);
            
            if ($item->status !== 'archived') {
                return response()->json([
                    'success' => false,
                    'message' => 'Item is not archived'
                ], 422);
            }

            $item->update([
                'status' => 'active',
                'archived_at' => null,
                'archived_by' => null,
                'archive_reason' => null,
            ]);

            InventoryLog::create([
                'inventory_item_id' => $item->id,
                'delta' => 0,
                'quantity' => 0,
                'type' => 'restore',
                'movement_type' => 'restore',
                'reason' => 'Item restored from archive',
                'reference_type' => 'restore',
                'stock_before' => $item->stock,
                'stock_after' => $item->stock,
                'previous_stock' => $item->stock,
                'new_stock' => $item->stock,
                'performed_by' => auth()->user()?->name,
                'role' => auth()->user()?->role,
                'user_id' => auth()->id(),
                'details' => json_encode([
                    'restored_at' => now()->toIso8601String(),
                    'previous_status' => 'archived',
                    'new_status' => 'active',
                ]),
            ]);

            // Log the unarchiving action
            ActivityLog::create([
                'user_id' => auth()->id(),
                'action' => 'unarchived',
                'subject_type' => 'InventoryItem',
                'subject_id' => $item->id,
                'description' => "Unarchived inventory item: {$item->name}",
                'properties' => [
                    'old_status' => 'archived',
                    'new_status' => 'active',
                ],
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Inventory item unarchived successfully',
                'item' => $item->fresh()
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Adjust stock for an item
     */
    public function adjustStock(Request $request, $id)
    {
        $validated = $request->validate([
            'type' => 'nullable|in:add,remove,set,increment,decrement',
            'adjustment_type' => 'nullable|in:increment,decrement,set,add,remove',
            'quantity' => 'required|integer|min:1',
            'reason' => 'required|string|max:255',
            'expiration_date' => 'nullable|date',
        ]);

        $type = $validated['adjustment_type'] ?? $validated['type'] ?? 'increment';
        $type = match ($type) {
            'add' => 'increment',
            'remove' => 'decrement',
            default => $type,
        };

        try {
            $result = $this->inventoryService->adjustStock(
                $id,
                (int) $validated['quantity'],
                $validated['reason'],
                [
                    'adjustment_type' => $type,
                    'type' => $type,
                    'performed_by' => $request->user()?->name,
                    'role' => $request->user()?->role,
                    'user_id' => $request->user()?->id,
                    'expiration_date' => $validated['expiration_date'] ?? null,
                ]
            );
            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * Simple stock update (for PATCH /inventory/{id}/stock)
     */
    public function updateStock(Request $request, $id)
    {
        $validated = $request->validate([
            'type' => 'required|in:add,remove,set',
            'quantity' => 'required|integer|min:0',
            'reason' => 'nullable|string|max:255',
            'expiration_date' => 'nullable|date',
        ]);

        try {
            $item = InventoryItem::findOrFail($id);
            $current = (int) ($item->quantity ?? $item->stock ?? 0);
            $qty = (int) $validated['quantity'];
            $expirationDate = $validated['expiration_date'] ?? null;

            // Category-based expiry validation
            $expiryRequiredCategories = [
                'food',
                'medicine',
                'vitamins',
                'health',
                'grooming',
                'shampoo',
                'treats',
            ];

            $category = strtolower($item->category ?? '');
            $requiresExpiry = collect($expiryRequiredCategories)->contains(function ($key) use ($category) {
                return str_contains($category, $key);
            });

            // Enforce expiry requirement for add operations
            if ($validated['type'] === 'add' && $qty > 0 && $requiresExpiry && !$expirationDate) {
                return response()->json([
                    'success' => false,
                    'message' => 'Expiration date is required for this item category.',
                ], 422);
            }

            if ($validated['type'] === 'add') {
                $newStock = $current + $qty;
                
                // Create new batch if expiration date is provided or required
                if (($expirationDate || $requiresExpiry) && $qty > 0) {
                    $this->deductFromBatches($id, $qty); // Use existing method for batch logic
                    $item->addBatchStock($qty, null, $requiresExpiry ? $expirationDate : $expirationDate, 'Stock adjustment');
                } else {
                    // Simple stock addition without batch
                    if (Schema::hasColumn($item->getTable(), 'stock')) {
                        $item->stock = $newStock;
                    }
                    $item->quantity = $newStock;
                    $item->save();
                }
            } elseif ($validated['type'] === 'remove') {
                $newStock = max(0, $current - $qty);
                
                // Deduct from batches using FEFO
                if ($qty > 0) {
                    $this->deductFromBatches($id, $qty);
                }
            } else {
                $newStock = $qty;
                $item->quantity = $newStock;
                if (Schema::hasColumn($item->getTable(), 'stock')) {
                    $item->stock = $newStock;
                }
                $item->save();
            }

            // Refresh item to get updated stock
            $item = $item->fresh();

            // Log the adjustment
            InventoryLog::create([
                'inventory_item_id' => $item->id,
                'delta' => $newStock - $current,
                'reason' => $validated['reason'] ?? 'Manual stock adjustment',
                'reference_type' => $validated['type'],
                'previous_stock' => $current,
                'new_stock' => $newStock,
                'performed_by' => auth()->user()->name ?? 'System',
                'role' => auth()->user()->role ?? 'Staff',
                'user_id' => auth()->id(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Stock adjusted successfully',
                'item' => $item->fresh(),
                'previous_stock' => $current,
                'new_stock' => $newStock,
                'adjustment' => $newStock - $current,
            ]);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * Get low stock items (reorder alerts)
     */
    public function lowStock()
    {
        return response()->json($this->inventoryService->getLowStockItems());
    }

    /**
     * Get out of stock items
     */
    public function outOfStock()
    {
        return response()->json($this->inventoryService->getOutOfStockItems());
    }

    /**
     * Get stock movement history for a specific item
     */
    public function stockHistory($id)
    {
        $item = InventoryItem::findOrFail($id);
        $logs = InventoryLog::where('inventory_item_id', $id)
            ->with('inventoryItem')
            ->latest()
            ->paginate(50);

        return response()->json([
            'item' => $item,
            'history' => $logs,
            'logs' => $logs->items(),
        ]);
    }

    /**
     * Get all stock history (for history page)
     */
    public function getHistory(Request $request)
    {
        $query = DB::table('inventory_logs')
            ->leftJoin('inventory_items', function ($join) {
                $join->on('inventory_logs.inventory_item_id', '=', 'inventory_items.id')
                     ->orOn('inventory_logs.item_id', '=', 'inventory_items.id');
            })
            ->select(
                'inventory_logs.*',
                'inventory_items.name as item_name',
                'inventory_items.sku as item_sku',
                'inventory_items.category as item_category'
            )
            ->orderBy('inventory_logs.created_at', 'desc');

        // Filter by item
        if ($request->has('item_id')) {
            $query->where('inventory_logs.inventory_item_id', $request->item_id);
        }

        // Filter by action type
        if ($request->has('action')) {
            $query->where('inventory_logs.reference_type', $request->action);
        }

        // Filter by date range
        if ($request->has('startDate')) {
            $query->whereDate('inventory_logs.created_at', '>=', $request->startDate);
        }
        if ($request->has('endDate')) {
            $query->whereDate('inventory_logs.created_at', '<=', $request->endDate);
        }

        $history = $query->paginate($request->per_page ?? 50);

        return response()->json([
            'history' => $history->items(),
            'meta' => [
                'current_page' => $history->currentPage(),
                'total' => $history->total(),
                'per_page' => $history->perPage(),
            ],
        ]);
    }

    /**
     * Get inventory summary/stats
     */
    public function summary()
    {
        return response()->json($this->inventoryService->getSummary());
    }

    /**
     * Deduct stock from batches using FEFO (First Expired, First Out) logic
     */
    public function deductFromBatches($itemId, $qty)
    {
        $needed = (int) $qty;

        $batches = \App\Models\InventoryBatch::where('inventory_item_id', $itemId)
            ->where('status', 'active')
            ->where('remaining_quantity', '>', 0)
            ->orderByRaw('expiration_date IS NULL, expiration_date ASC')
            ->orderBy('received_date', 'asc')
            ->lockForUpdate()
            ->get();

        foreach ($batches as $batch) {
            /** @var \App\Models\InventoryBatch $batch */
            if ($needed <= 0) break;

            $deduct = min($batch->remaining_quantity, $needed);
            $batch->remaining_quantity -= $deduct;

            if ($batch->remaining_quantity <= 0) {
                $batch->status = 'depleted';
            }

            $batch->save();
            $needed -= $deduct;
        }

        if ($needed > 0) {
            throw new \Exception('Not enough stock available.');
        }

        $total = \App\Models\InventoryBatch::where('inventory_item_id', $itemId)
            ->where('status', 'active')
            ->sum('remaining_quantity');

        \App\Models\InventoryItem::where('id', $itemId)->update([
            'stock' => $total,
        ]);
    }

    /**
     * Get expiry alerts for batches expiring within 30 days or already expired
     */
    public function expiryAlerts()
    {
        $today = now()->toDateString();
        $soon = now()->addDays(30)->toDateString();

        $alerts = DB::table('inventory_batches')
            ->join('inventory_items', 'inventory_batches.inventory_item_id', '=', 'inventory_items.id')
            ->where('inventory_batches.remaining_quantity', '>', 0)
            ->whereNotNull('inventory_batches.expiration_date')
            ->where(function ($q) use ($today, $soon) {
                $q->whereDate('inventory_batches.expiration_date', '<=', $today)
                  ->orWhereBetween('inventory_batches.expiration_date', [$today, $soon]);
            })
            ->select(
                'inventory_batches.id as batch_id',
                'inventory_batches.batch_no',
                'inventory_batches.expiration_date',
                'inventory_batches.remaining_quantity',
                'inventory_items.id as item_id',
                'inventory_items.name as item_name',
                'inventory_items.sku as item_sku',
                DB::raw("DATEDIFF(inventory_batches.expiration_date, CURDATE()) as days_left")
            )
            ->orderBy('inventory_batches.expiration_date', 'asc')
            ->get()
            ->map(function ($batch) {
                $batch->alert_level = $batch->days_left <= 0
                    ? 'expired'
                    : ($batch->days_left <= 7 ? 'critical' : 'warning');

                return $batch;
            });

        return response()->json([
            'success' => true,
            'alerts' => $alerts,
        ]);
    }

    /**
     * Get sellable products for POS and Customer Store
     * Only returns items that are sellable, active, and have stock > 0
     */
    public function sellable()
    {
        $items = InventoryItem::where('is_sellable', true)
            ->where('status', 'active')
            ->where('stock', '>', 0)
            ->orderBy('name')
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'category' => $item->category,
                    'description' => $item->description,
                    'price' => (float) $item->price,
                    'stock' => $item->stock,
                    'reorder_level' => $item->reorder_level,
                    'status' => $item->status,
                    'is_sellable' => $item->is_sellable,
                    'brand' => $item->brand,
                    'supplier' => $item->supplier,
                    'photo_url' => $item->photo_url,
                ];
            });

        return response()->json([
            'success' => true,
            'products' => $items,
            'count' => $items->count(),
        ]);
    }

    /**
     * Get inventory cost report for admin
     */
    public function costReport()
    {
        $items = InventoryItem::where('status', 'active')
            ->with('supplierModel')
            ->get();

        $itemsWithCost = $items->whereNotNull('cost');
        $itemsWithoutCost = $items->whereNull('cost');

        $totalCostValue = $itemsWithCost->sum(function ($item) {
            return $item->stock * $item->cost;
        });

        $totalRetailValue = $items->sum(function ($item) {
            return $item->stock * $item->price;
        });

        $overallMargin = $totalRetailValue > 0
            ? (($totalRetailValue - $totalCostValue) / $totalRetailValue) * 100
            : 0;

        // Per-category breakdown
        $categoryBreakdown = $items->groupBy('category')->map(function ($categoryItems) {
            $catCost = $categoryItems->whereNotNull('cost')->sum(function ($item) {
                return $item->stock * $item->cost;
            });
            $catRetail = $categoryItems->sum(function ($item) {
                return $item->stock * $item->price;
            });
            $catMargin = $catRetail > 0 ? (($catRetail - $catCost) / $catRetail) * 100 : 0;

            return [
                'category' => $categoryItems->first()->category,
                'item_count' => $categoryItems->count(),
                'total_stock' => $categoryItems->sum('stock'),
                'cost_value' => round($catCost, 2),
                'retail_value' => round($catRetail, 2),
                'profit' => round($catRetail - $catCost, 2),
                'margin_percent' => round($catMargin, 2),
            ];
        })->values();

        // Top 10 highest margin items
        $topMargins = $itemsWithCost->map(function ($item) {
            $profit = $item->price - $item->cost;
            $margin = $item->price > 0 ? ($profit / $item->price) * 100 : 0;
            return [
                'id' => $item->id,
                'name' => $item->name,
                'sku' => $item->sku,
                'category' => $item->category,
                'cost' => (float) $item->cost,
                'price' => (float) $item->price,
                'stock' => $item->stock,
                'profit_per_unit' => round($profit, 2),
                'margin_percent' => round($margin, 2),
            ];
        })->sortByDesc('margin_percent')->take(10)->values();

        // Bottom 10 lowest margin items
        $bottomMargins = $itemsWithCost->map(function ($item) {
            $profit = $item->price - $item->cost;
            $margin = $item->price > 0 ? ($profit / $item->price) * 100 : 0;
            return [
                'id' => $item->id,
                'name' => $item->name,
                'sku' => $item->sku,
                'category' => $item->category,
                'cost' => (float) $item->cost,
                'price' => (float) $item->price,
                'stock' => $item->stock,
                'profit_per_unit' => round($profit, 2),
                'margin_percent' => round($margin, 2),
            ];
        })->sortBy('margin_percent')->take(10)->values();

        return response()->json([
            'success' => true,
            'summary' => [
                'total_items' => $items->count(),
                'items_with_cost' => $itemsWithCost->count(),
                'items_without_cost' => $itemsWithoutCost->count(),
                'total_cost_value' => round($totalCostValue, 2),
                'total_retail_value' => round($totalRetailValue, 2),
                'total_profit' => round($totalRetailValue - $totalCostValue, 2),
                'overall_margin_percent' => round($overallMargin, 2),
            ],
            'category_breakdown' => $categoryBreakdown,
            'top_margins' => $topMargins,
            'bottom_margins' => $bottomMargins,
        ]);
    }

    /**
     * Get all batches for an inventory item
     */
    public function getItemBatches($id)
    {
        try {
            $result = $this->inventoryService->getItemBatches($id);
            return response()->json([
                'success' => true,
                ...$result,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 404);
        }
    }

    /**
     * Add a new batch to an inventory item
     */
    public function addBatch(Request $request, $id)
    {
        try {
            $validated = $request->validate([
                'batch_no' => 'nullable|string|max:50',
                'received_date' => 'required|date',
                'expiration_date' => 'nullable|date|after_or_equal:received_date',
                'quantity' => 'required|integer|min:1',
                'notes' => 'nullable|string',
            ]);

            $item = InventoryItem::findOrFail($id);
            $batch = $item->addBatchStock(
                $validated['quantity'],
                $validated['batch_no'] ?? null,
                $validated['expiration_date'] ?? null,
                $validated['notes'] ?? 'Batch restock'
            );

            return response()->json([
                'success' => true,
                'message' => 'Batch added successfully',
                'batch' => $batch,
                'item' => $item->fresh(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Dispose of an expired or damaged batch
     */
    public function disposeBatch(Request $request, $batchId)
    {
        try {
            $validated = $request->validate([
                'reason' => 'nullable|string|max:255',
            ]);

            $result = $this->inventoryService->disposeBatch($batchId, $validated['reason'] ?? 'Expired');

            return response()->json([
                'success' => true,
                ...$result,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Adjust batch stock quantity
     */
    public function adjustBatch(Request $request, $batchId)
    {
        try {
            $validated = $request->validate([
                'quantity' => 'required|integer|min:0',
                'reason' => 'nullable|string|max:255',
            ]);

            $batch = InventoryBatch::findOrFail($batchId);
            $oldQuantity = $batch->remaining_quantity;
            $newQuantity = $validated['quantity'];
            $delta = $newQuantity - $oldQuantity;

            // Update batch
            $batch->remaining_quantity = $newQuantity;
            if ($newQuantity <= 0) {
                $batch->status = 'depleted';
            }
            $batch->save();

            // Update item stock
            $item = $batch->inventoryItem;
            $item->stock += $delta;
            $item->save();

            // Log the adjustment
            InventoryLog::create([
                'inventory_item_id' => $item->id,
                'delta' => $delta,
                'reason' => $validated['reason'] ?? 'Batch adjustment',
                'reference_type' => 'adjustment',
                'details' => json_encode([
                    'batch_id' => $batch->id,
                    'batch_no' => $batch->batch_no,
                    'old_quantity' => $oldQuantity,
                    'new_quantity' => $newQuantity,
                ]),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Batch adjusted successfully',
                'batch' => $batch->fresh(),
                'item' => $item->fresh(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    public function getMonthlyAuditItems(Request $request)
    {
        $month = $request->query('month', now()->format('Y-m'));

        $items = InventoryItem::query()
            ->orderBy('name')
            ->get()
            ->map(function ($item) use ($month) {
                $existingAudit = InventoryMonthlyAudit::where('inventory_item_id', $item->id)
                    ->where('audit_month', $month)
                    ->first();

                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'sku' => $item->sku,
                    'category' => $item->category,
                    'brand' => $item->brand,
                    'system_stock' => (int) ($item->quantity ?? $item->stock ?? 0),
                    'actual_stock' => $existingAudit ? (int) $existingAudit->actual_stock : '',
                    'variance' => $existingAudit ? (int) $existingAudit->variance : 0,
                    'audit_status' => $existingAudit ? $existingAudit->status : 'pending',
                    'reason' => $existingAudit ? $existingAudit->reason : '',
                ];
            });

        return response()->json([
            'success' => true,
            'month' => $month,
            'items' => $items,
        ]);
    }

    public function saveMonthlyAudit(Request $request)
    {
        $validated = $request->validate([
            'audit_month' => 'required|string',
            'items' => 'required|array',
            'items.*.inventory_item_id' => 'required|exists:inventory_items,id',
            'items.*.actual_stock' => 'required|integer|min:0',
            'items.*.reason' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($validated) {
            $checkedBy = auth()->user()->name ?? 'Inventory Manager';
            $saved = [];

            foreach ($validated['items'] as $row) {
                $item = InventoryItem::lockForUpdate()->findOrFail($row['inventory_item_id']);

                $systemStock = (int) ($item->quantity ?? $item->stock ?? 0);
                $actualStock = (int) $row['actual_stock'];
                $variance = $actualStock - $systemStock;

                $status = $variance === 0 ? 'matched' : 'discrepancy';

                $audit = InventoryMonthlyAudit::updateOrCreate(
                    [
                        'inventory_item_id' => $item->id,
                        'audit_month' => $validated['audit_month'],
                    ],
                    [
                        'system_stock' => $systemStock,
                        'actual_stock' => $actualStock,
                        'variance' => $variance,
                        'status' => $status,
                        'reason' => $row['reason'] ?? null,
                        'checked_by' => $checkedBy,
                    ]
                );

                if ($variance !== 0) {
                    $before = $systemStock;
                    $after = $actualStock;

                    InventoryBatch::create([
                        'inventory_item_id' => $item->id,
                        'batch_no' => 'AUDIT-' . strtoupper(uniqid()),
                        'received_date' => now(),
                        'expiration_date' => null,
                        'quantity' => $variance > 0 ? $variance : 0,
                        'remaining_quantity' => $variance > 0 ? $variance : 0,
                        'status' => $variance > 0 ? 'active' : 'audit_adjusted',
                        'notes' => 'Monthly inventory audit adjustment',
                    ]);

                    $stockUpdate = ['stock' => $actualStock];
                    if (Schema::hasColumn('inventory_items', 'quantity')) {
                        $stockUpdate['quantity'] = $actualStock;
                    }

                    DB::table('inventory_items')
                        ->where('id', $item->id)
                        ->update($stockUpdate);

                    InventoryLog::create([
                        'inventory_item_id' => $item->id,
                        'action' => 'monthly_audit',
                        'quantity_before' => $before,
                        'quantity_after' => $after,
                        'quantity_change' => $variance,
                        'reason' => $row['reason'] ?? 'Monthly inventory count correction',
                        'user_name' => $checkedBy,
                    ]);
                }

                $saved[] = $audit;
            }

            return response()->json([
                'success' => true,
                'message' => 'Monthly inventory audit saved successfully.',
                'audits' => $saved,
            ]);
        });
    }
}
