<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\InventoryMonthlyAudit;
use App\Services\InventoryService;
use App\Services\WorkflowNotifier;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DashboardController extends Controller
{
    private InventoryService $inventoryService;

    public function __construct(InventoryService $inventoryService)
    {
        $this->inventoryService = $inventoryService;
    }
    public function overview()
    {
        $summary = $this->inventoryService->getSummary();
        $today = Carbon::today();

        $recentLogs = InventoryLog::with('inventoryItem')
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn ($log) => $this->formatLog($log));

        $criticalItems = InventoryItem::where('status', '!=', 'archived')
            ->whereColumn('stock', '<=', 'reorder_level')
            ->orderBy('stock', 'asc')
            ->limit(5)
            ->get();

        $totalInventoryValue = InventoryItem::where('status', '!=', 'archived')
            ->selectRaw('SUM(stock * price) as total_value')
            ->value('total_value') ?? 0;

        return response()->json([
            'total_items' => $summary['total_items'],
            'low_stock_items' => $summary['low_stock_count'],
            'out_of_stock_items' => $summary['out_of_stock_count'],
            'expiring_soon' => $summary['expiring_soon_count'],
            'total_stock_value' => $summary['total_stock_value'],
            'total_inventory_value' => round((float) $totalInventoryValue, 2),
            'category_breakdown' => $summary['category_breakdown'] ?? [],
            'recent_transactions' => $recentLogs,
            'critical_items' => $criticalItems,
            'inventory_changes_today' => InventoryLog::whereDate('created_at', $today)->count(),
        ]);
    }

    public function dashboardOverview()
    {
        $summary = $this->inventoryService->getSummary();

        return response()->json([
            'data' => [
                'total_items' => $summary['total_items'],
                'total_inventory_value' => $summary['total_stock_value'],
                'low_stock_count' => $summary['low_stock_count'],
                'out_of_stock_count' => $summary['out_of_stock_count'],
                'category_breakdown' => $summary['category_breakdown'],
                'recent_activity' => InventoryLog::with('item')
                    ->where(function ($query) {
                        $query->whereNull('reference_type')
                            ->orWhere('reference_type', '!=', 'initial');
                    })
                    ->latest()
                    ->limit(10)
                    ->get(),
            ],
        ]);
    }

    public function lowStockDashboard()
    {
        $items = InventoryItem::where('status', 'active')
            ->where('stock', '>', 0)
            ->whereColumn('stock', '<=', 'reorder_level')
            ->orderBy('stock')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function recentActivity()
    {
        $logs = InventoryLog::with('item')
            ->where(function ($query) {
                $query->whereNull('reference_type')
                    ->orWhere('reference_type', '!=', 'initial');
            })
            ->latest()
            ->limit(10)
            ->get();

        return response()->json(['data' => $logs]);
    }

    public function items(Request $request)
    {
        $status = $request->query('status');
        $query = InventoryItem::query()->orderBy('name');

        if ($status === 'archived') {
            $query->where('status', 'archived');
        } else {
            $query->where('status', '!=', 'archived')
                ->whereNull('archived_at');
        }

        return response()->json([
            'success' => true,
            'items' => $query->get(),
        ]);
    }

    public function logs(Request $request)
    {
        $query = InventoryLog::with('inventoryItem', 'user')->latest();

        if ($request->filled('movement_type')) {
            $query->where('movement_type', $request->movement_type);
        }

        if ($request->filled('itemId')) {
            $query->where('inventory_item_id', $request->itemId);
        }

        if ($request->filled('item_id')) {
            $query->where('inventory_item_id', $request->item_id);
        }

        return response()->json([
            'success' => true,
            'logs' => $query
                ->get()
                ->map(fn ($log) => $this->formatLog($log)),
        ]);
    }

    public function reports(Request $request)
    {
        $summary = $this->inventoryService->getSummary();
        $logs = InventoryLog::with('inventoryItem')
            ->when($request->startDate, fn ($query) => $query->whereDate('created_at', '>=', $request->startDate))
            ->when($request->endDate, fn ($query) => $query->whereDate('created_at', '<=', $request->endDate))
            ->latest()
            ->limit(100)
            ->get();

        return response()->json([
            'summary' => $summary,
            'items' => InventoryItem::orderBy('name')->get(),
            'logs' => $logs,
            'generated_at' => now()->toIso8601String(),
        ]);
    }

    public function history(Request $request)
    {
        $query = InventoryLog::with('inventoryItem')->latest();

        if ($request->filled('itemId')) {
            $query->where('inventory_item_id', $request->itemId);
        }

        if ($request->filled('item_id')) {
            $query->where('inventory_item_id', $request->item_id);
        }

        if ($request->filled('action')) {
            $query->where('reference_type', $request->action);
        }

        if ($request->filled('startDate')) {
            $query->whereDate('created_at', '>=', $request->startDate);
        }

        if ($request->filled('endDate')) {
            $query->whereDate('created_at', '<=', $request->endDate);
        }

        $history = $query->paginate($request->integer('per_page', 50));
        $items = collect($history->items())->map(fn ($log) => $this->formatLog($log))->values();

        return response()->json([
            'history' => $items,
            'data' => $items,
            'meta' => [
                'current_page' => $history->currentPage(),
                'total' => $history->total(),
                'per_page' => $history->perPage(),
            ],
        ]);
    }

    public function lowStock()
    {
        $result = $this->inventoryService->getLowStockItems();

        return response()->json([
            'success' => true,
            'items' => $result['items'] ?? [],
            'count' => $result['count'] ?? 0,
        ]);
    }

    public function expiryAlerts()
    {
        $dateColumn = Schema::hasColumn('inventory_items', 'expiry_date')
            ? 'expiry_date'
            : (Schema::hasColumn('inventory_items', 'expiration_date') ? 'expiration_date' : null);

        if (!$dateColumn) {
            return response()->json([
                'success' => true,
                'alerts' => [],
                'data' => [],
                'count' => 0,
            ]);
        }

        $today = now()->toDateString();
        $soon = now()->addDays(30)->toDateString();
        $items = InventoryItem::whereNotNull($dateColumn)
            ->whereDate($dateColumn, '<=', $soon)
            ->orderBy($dateColumn)
            ->get()
            ->map(function ($item) use ($dateColumn, $today) {
                $expiryDate = Carbon::parse($item->{$dateColumn});

                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'sku' => $item->sku,
                    'stock' => (int) ($item->stock ?? 0),
                    'expiry_date' => $expiryDate->toDateString(),
                    'days_until_expiry' => now()->startOfDay()->diffInDays($expiryDate, false),
                    'status' => $expiryDate->lt(Carbon::parse($today)) ? 'expired' : 'expiring_soon',
                ];
            })
            ->values();

        return response()->json([
            'success' => true,
            'alerts' => $items,
            'data' => $items,
            'count' => $items->count(),
        ]);
    }

    public function monthlyAudit(Request $request)
    {
        $month = $request->query('month', now()->format('Y-m'));

        $items = InventoryItem::orderBy('name')
            ->get()
            ->map(function ($item) use ($month) {
                $audit = InventoryMonthlyAudit::where('inventory_item_id', $item->id)
                    ->where('audit_month', $month)
                    ->first();

                return [
                    'id' => $item->id,
                    'inventory_item_id' => $item->id,
                    'name' => $item->name,
                    'sku' => $item->sku,
                    'category' => $item->category,
                    'system_stock' => (int) ($audit?->system_stock ?? $item->stock ?? 0),
                    'actual_stock' => $audit ? (int) $audit->actual_stock : '',
                    'variance' => $audit ? (int) $audit->variance : 0,
                    'audit_status' => $audit?->status ?? 'pending',
                    'status' => $audit?->status ?? 'pending',
                    'reason' => $audit?->reason ?? '',
                    'checked_by' => $audit?->checked_by,
                ];
            })
            ->values();

        return response()->json([
            'success' => true,
            'month' => $month,
            'items' => $items,
            'data' => $items,
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

        $checkedBy = $request->user()?->name ?? 'System';
        $saved = collect($validated['items'])->map(function ($row) use ($validated, $checkedBy) {
            $item = InventoryItem::findOrFail($row['inventory_item_id']);
            $systemStock = (int) ($item->stock ?? 0);
            $actualStock = (int) $row['actual_stock'];
            $variance = $actualStock - $systemStock;

            return InventoryMonthlyAudit::updateOrCreate(
                [
                    'inventory_item_id' => $item->id,
                    'audit_month' => $validated['audit_month'],
                ],
                [
                    'system_stock' => $systemStock,
                    'actual_stock' => $actualStock,
                    'variance' => $variance,
                    'status' => $variance === 0 ? 'matched' : 'discrepancy',
                    'reason' => $row['reason'] ?? null,
                    'checked_by' => $checkedBy,
                ]
            );
        });

        return response()->json([
            'success' => true,
            'message' => 'Monthly inventory audit saved successfully.',
            'audits' => $saved,
        ]);
    }

    public function monthlyAuditReport(Request $request)
    {
        $month = $request->query('month', now()->format('Y-m'));
        $audits = InventoryMonthlyAudit::with('item')
            ->where('audit_month', $month)
            ->orderBy('inventory_item_id')
            ->get();

        $summary = [
            'total_items' => $audits->count(),
            'matched_items' => $audits->where('status', 'matched')->count(),
            'discrepancy_items' => $audits->where('status', 'discrepancy')->count(),
            'total_variance' => (int) $audits->sum('variance'),
        ];

        return response()->json([
            'success' => true,
            'month' => $month,
            'summary' => $summary,
            'items' => $audits->map(fn ($audit) => $this->formatAudit($audit))->values(),
            'data' => $audits->map(fn ($audit) => $this->formatAudit($audit))->values(),
        ]);
    }

    public function auditAnalytics(Request $request)
    {
        $months = max(1, min(24, (int) $request->query('months', 6)));
        $startMonth = now()->startOfMonth()->subMonths($months - 1)->format('Y-m');

        $monthly = InventoryMonthlyAudit::select(
                'audit_month',
                DB::raw('COUNT(*) as total_items'),
                DB::raw("SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) as matched_items"),
                DB::raw("SUM(CASE WHEN status = 'discrepancy' THEN 1 ELSE 0 END) as discrepancy_items"),
                DB::raw('SUM(variance) as total_variance')
            )
            ->where('audit_month', '>=', $startMonth)
            ->groupBy('audit_month')
            ->orderBy('audit_month')
            ->get();

        return response()->json([
            'success' => true,
            'months' => $months,
            'trends' => $monthly,
            'data' => $monthly,
        ]);
    }

    public function discrepancyReasons()
    {
        $reasons = InventoryMonthlyAudit::select('reason', DB::raw('COUNT(*) as count'))
            ->where('status', 'discrepancy')
            ->whereNotNull('reason')
            ->where('reason', '!=', '')
            ->groupBy('reason')
            ->orderByDesc('count')
            ->get();

        return response()->json([
            'success' => true,
            'reasons' => $reasons,
            'data' => $reasons,
        ]);
    }

    public function adjustStock(Request $request, $id)
    {
        $validated = $request->validate([
            'type' => 'required|in:add,remove,set',
            'quantity' => 'required|integer|min:0',
            'reason' => 'nullable|string|max:255',
        ]);

        $item = InventoryItem::findOrFail($id);
        $current = (int) $item->stock;
        $quantity = (int) $validated['quantity'];

        $newStock = match ($validated['type']) {
            'add' => $current + $quantity,
            'remove' => max(0, $current - $quantity),
            default => $quantity,
        };

        $item->update(['stock' => $newStock]);

        InventoryLog::create([
            'inventory_item_id' => $item->id,
            'delta' => $newStock - $current,
            'quantity' => abs($newStock - $current),
            'type' => $validated['type'],
            'movement_type' => 'manual_adjustment',
            'reason' => $validated['reason'] ?? 'Manual stock adjustment',
            'reference_type' => $validated['type'],
            'stock_before' => $current,
            'stock_after' => $newStock,
            'previous_stock' => $current,
            'new_stock' => $newStock,
            'performed_by' => $request->user()?->name,
            'role' => $request->user()?->role,
            'user_id' => $request->user()?->id,
        ]);

        WorkflowNotifier::notifyRole('inventory', 'Stock Adjustment Made', "{$item->name}: {$current} -> {$newStock}", 'info', 'inventory_item', $item->id);
        ActivityLog::log($request->user()?->id, 'inventory_adjusted', "Inventory adjusted {$item->name}", [
            'category' => 'inventory',
            'reference_type' => 'inventory_item',
            'reference_id' => $item->id,
            'metadata' => ['previous_stock' => $current, 'new_stock' => $newStock],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Stock adjusted successfully',
            'item' => $item->fresh(),
            'previous_stock' => $current,
            'new_stock' => $newStock,
            'adjustment' => $newStock - $current,
        ]);
    }

    private function formatLog(InventoryLog $log): array
    {
        return [
            'id' => $log->id,
            'inventory_item_id' => $log->inventory_item_id,
            'item_name' => $log->inventoryItem?->name,
            'item_sku' => $log->inventoryItem?->sku,
            'movement_type' => $log->movement_type ?? $log->reference_type ?? $log->type,
            'action' => $log->movement_type ?? $log->reference_type ?? $log->type,
            'quantity_change' => $log->delta ?? 0,
            'quantity' => $log->quantity ?? abs($log->delta ?? 0),
            'previous_stock' => $log->previous_stock ?? $log->stock_before,
            'new_stock' => $log->new_stock ?? $log->stock_after,
            'stock_before' => $log->stock_before ?? $log->previous_stock,
            'stock_after' => $log->stock_after ?? $log->new_stock,
            'reason' => $log->reason,
            'performed_by' => $log->performed_by ?? $log->user?->name,
            'user_name' => $log->performed_by ?? $log->user?->name,
            'role' => $log->role,
            'created_at' => $log->created_at,
        ];
    }

    private function formatAudit(InventoryMonthlyAudit $audit): array
    {
        return [
            'id' => $audit->id,
            'inventory_item_id' => $audit->inventory_item_id,
            'name' => $audit->item?->name,
            'sku' => $audit->item?->sku,
            'category' => $audit->item?->category,
            'system_stock' => (int) $audit->system_stock,
            'actual_stock' => (int) $audit->actual_stock,
            'variance' => (int) $audit->variance,
            'status' => $audit->status,
            'reason' => $audit->reason,
            'checked_by' => $audit->checked_by,
            'audit_month' => $audit->audit_month,
            'created_at' => $audit->created_at,
            'updated_at' => $audit->updated_at,
        ];
    }

    public function reorderRequest(Request $request)
    {
        $payload = $request->validate([
            'item_id' => 'required|integer|exists:inventory_items,id',
            'item_name' => 'nullable|string|max:255',
            'sku' => 'nullable|string|max:255',
            'suggested_quantity' => 'nullable|integer|min:1',
            'current_stock' => 'nullable|integer|min:0',
            'reorder_level' => 'nullable|integer|min:0',
            'priority' => 'nullable|string|max:50',
            'status' => 'nullable|string|max:50',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Reorder request recorded',
            'request' => array_merge($payload, [
                'id' => 'RR-' . now()->format('YmdHis'),
                'status' => $payload['status'] ?? 'pending',
                'created_at' => now()->toIso8601String(),
            ]),
        ], 201);
    }

    public function showItem($id)
    {
        $item = InventoryItem::findOrFail($id);
        return response()->json([
            'success' => true,
            'item' => $item,
        ]);
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

    public function storeItem(Request $request)
    {
        try {
            $data = $this->handlePhotoUpload($request, $request->all());
            $result = $this->inventoryService->createItem($data);
            return response()->json($result, 201);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    public function updateItem(Request $request, $id)
    {
        try {
            $data = $this->handlePhotoUpload($request, $request->all());
            $result = $this->inventoryService->updateItem($id, $data);
            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    public function destroyItem($id)
    {
        try {
            $result = $this->inventoryService->deleteItem($id);
            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * PUBLIC ENDPOINTS - Available to all authenticated users (customers, cashiers, etc.)
     * Read-only access for store browsing and POS
     */

    /**
     * Get all active inventory items for public view (Customer Store, POS)
     * Filters: category, search, in_stock_only
     */
    public function publicItems(Request $request)
    {
        $filters = [
            'category' => $request->category,
            'search' => $request->search,
            'in_stock_only' => $request->boolean('in_stock_only'),
        ];
        return response()->json($this->inventoryService->getPublicItems($filters));
    }

    /**
     * Get available categories for public browsing
     */
    public function categories()
    {
        $categories = InventoryItem::where('status', 'active')
            ->select('category')
            ->distinct()
            ->orderBy('category')
            ->pluck('category');

        return response()->json([
            'categories' => $categories,
            'count' => $categories->count(),
        ]);
    }

    /**
     * Get single item details for public view
     */
    public function showPublicItem($id)
    {
        $item = InventoryItem::where('id', $id)
            ->where('status', 'active')
            ->firstOrFail();

        return response()->json([
            'item' => $item,
            'in_stock' => $item->stock > 0,
            'stock_status' => $item->stock > 0 ? 'available' : 'out_of_stock',
        ]);
    }

    /**
     * Search products for Cashier POS
     * Search by name or SKU
     */
    public function searchProducts(Request $request)
    {
        $query = $request->get('q', '');

        $products = InventoryItem::where('status', 'active')
            ->where(function ($q) use ($query) {
                $q->where('name', 'like', "%{$query}%")
                  ->orWhere('sku', 'like', "%{$query}%");
            })
            ->limit(20)
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'sku' => $item->sku,
                    'price' => $item->price,
                    'stock' => $item->stock,
                ];
            });

        return response()->json($products);
    }

    /**
     * Lookup product by barcode for Cashier POS.
     *
     * Server-side barcode lookup. The POS scanner calls this endpoint; it does
     * NOT deduct stock. Stock deduction happens only inside the existing
     * POS checkout transaction (POSController::processTransaction).
     *
     * Safety rules enforced here:
     *  - barcode is normalized (trimmed) before comparison
     *  - only active, non-archived items are returned
     *  - sellability is reported so the POS can block non-sellable items
     *  - stock is reported so the POS can block out-of-stock items
     *  - unknown barcodes fail safely with 404 (no item creation, no stock change)
     */
    public function lookupBarcode($barcode)
    {
        // Normalize: remove leading/trailing whitespace and any trailing newline
        // characters that HID scanners may append.
        $normalized = trim((string) $barcode);

        if ($normalized === '') {
            return response()->json([
                'success' => false,
                'message' => 'Barcode not found.',
            ], 404);
        }

        $product = InventoryItem::where('barcode', $normalized)
            ->where('status', 'active')
            ->whereNull('archived_at')
            ->first();

        if (!$product) {
            return response()->json([
                'success' => false,
                'message' => 'Barcode not found.',
            ], 404);
        }

        $sellable = (bool) $product->is_sellable;
        $inStock = (int) $product->stock > 0;

        return response()->json([
            'success' => true,
            'item' => [
                'id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'barcode' => $product->barcode,
                'category' => $product->category,
                'price' => (float) $product->price,
                'selling_price' => (float) $product->price,
                'stock' => (int) $product->stock,
                'available_stock' => (int) $product->stock,
                'is_sellable' => $sellable,
                'sellable' => $sellable,
                'in_stock' => $inStock,
                'item_type' => 'product',
                'type' => 'product',
            ],
        ]);
    }
}
