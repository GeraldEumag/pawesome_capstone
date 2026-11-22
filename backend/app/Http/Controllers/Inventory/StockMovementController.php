<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\InventoryLog;
use App\Models\InventoryReturn;
use App\Models\InventoryStockRequest;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Stock Movement & Control endpoints: dedicated Stock In / Stock Out,
 * multi-item transactions, the sensitive stock-out approval queue,
 * movement reversals and customer product returns.
 *
 * Every stock-changing route delegates to InventoryService — nothing here
 * mutates quantities directly.
 */
class StockMovementController extends Controller
{
    public function __construct(private InventoryService $inventoryService)
    {
    }

    /**
     * GET /inventory/items/search?q= — compact payload for the quick
     * item selector (name, SKU, barcode, brand, generic name).
     */
    public function searchItems(Request $request)
    {
        return response()->json($this->inventoryService->searchItems($request->query('q')));
    }

    /**
     * POST /inventory/stock-in — multi-item receiving transaction.
     */
    public function stockIn(Request $request)
    {
        $validated = $request->validate([
            'transaction_type' => 'required|string',
            'description' => 'nullable|string|max:1000',
            'supplier' => 'nullable|string|max:255',
            'reference' => 'nullable|string|max:255',
            'items' => 'required|array|min:1',
            'items.*.inventory_item_id' => 'required|integer|exists:inventory_items,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.batch_no' => 'nullable|string|max:50',
            'items.*.received_date' => 'nullable|date',
            'items.*.manufacturing_date' => 'nullable|date',
            'items.*.expiration_date' => 'nullable|date',
            'items.*.supplier' => 'nullable|string|max:255',
            'items.*.unit_cost' => 'nullable|numeric|min:0',
        ]);

        try {
            $result = $this->inventoryService->recordStockIn($validated);
            return response()->json(['success' => true, ...$result], 201);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * POST /inventory/stock-out — multi-item withdrawal. Sensitive reasons
     * queue an approval request (queued=true, stock untouched); the rest
     * execute immediately (queued=false).
     */
    public function stockOut(Request $request)
    {
        $validated = $request->validate([
            'reason_code' => 'required|string',
            'photo' => ['nullable', 'string', 'max:255', $this->evidencePathRule()],
            'damage_details' => 'nullable|string|max:1000',
            'disposal_details' => 'nullable|string|max:1000',
            'incident_details' => 'nullable|string|max:1000',
            'department' => 'nullable|string|max:255',
            'purpose' => 'nullable|string|max:500',
            'service_reference' => 'nullable|string|max:255',
            'supplier' => 'nullable|string|max:255',
            'return_reference' => 'nullable|string|max:255',
            'disposal_method' => 'nullable|string|max:255',
            'explanation' => 'nullable|string|max:1000',
            'items' => 'required|array|min:1',
            'items.*.inventory_item_id' => 'required|integer|exists:inventory_items,id',
            'items.*.quantity' => 'nullable|integer|min:0',
            'items.*.physical_count' => 'nullable|integer|min:0',
            'items.*.batch_id' => 'nullable|integer|exists:inventory_batches,id',
            'items.*.notes' => 'nullable|string|max:500',
        ]);

        try {
            $result = $this->inventoryService->recordStockOut($validated);
            return response()->json(['success' => true, ...$result], !empty($result['queued']) ? 202 : 201);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * GET /inventory/movements — the stock ledger with the new filter set.
     */
    public function movements(Request $request)
    {
        $query = InventoryLog::with(['inventoryItem', 'user'])->latest('inventory_logs.id');

        if ($request->filled('item_id')) {
            $query->where('inventory_item_id', $request->item_id);
        }
        if ($request->filled('movement_type')) {
            $query->where('movement_type', $request->movement_type);
        }
        if ($request->filled('reason_code')) {
            $query->where('reason_code', $request->reason_code);
        }
        if ($request->filled('transaction_no')) {
            $query->where('transaction_no', $request->transaction_no);
        }
        if ($request->filled('performed_by')) {
            $query->where('performed_by', 'like', '%' . $request->performed_by . '%');
        }
        if ($request->filled('reference')) {
            $ref = $request->reference;
            $query->where(function ($q) use ($ref) {
                $q->where('reference', 'like', "%{$ref}%")
                  ->orWhere('reference_id', $ref)
                  ->orWhere('transaction_no', 'like', "%{$ref}%");
            });
        }
        if ($request->filled('startDate')) {
            $query->whereDate('created_at', '>=', $request->startDate);
        }
        if ($request->filled('endDate')) {
            $query->whereDate('created_at', '<=', $request->endDate);
        }

        $movements = $query->paginate($request->integer('per_page', 50));

        $items = collect($movements->items())->map(fn (InventoryLog $log) => $this->formatMovement($log))->values();

        return response()->json([
            'movements' => $items,
            'data' => $items,
            'meta' => [
                'current_page' => $movements->currentPage(),
                'last_page' => $movements->lastPage(),
                'total' => $movements->total(),
                'per_page' => $movements->perPage(),
            ],
        ]);
    }

    /**
     * GET /inventory/movements/{id} — single movement with its reversals.
     */
    public function showMovement($id)
    {
        $log = InventoryLog::with(['inventoryItem', 'user'])->findOrFail($id);
        $reversals = InventoryLog::where('original_movement_id', $log->id)->latest('id')->get();

        return response()->json([
            'success' => true,
            'movement' => $this->formatMovement($log),
            'reversals' => $reversals->map(fn (InventoryLog $r) => $this->formatMovement($r))->values(),
        ]);
    }

    /**
     * POST /inventory/movements/{id}/reverse — linked reversal stock-in/out.
     */
    public function reverseMovement(Request $request, $id)
    {
        $validated = $request->validate([
            'quantity' => 'required|integer|min:1',
            'reason' => 'required|string|max:500',
        ]);

        try {
            $result = $this->inventoryService->reverseMovement((int) $id, (int) $validated['quantity'], $validated['reason']);
            return response()->json(['success' => true, ...$result]);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /*
    |----------------------------------------------------------------------
    | Stock-out approval queue
    |----------------------------------------------------------------------
    */

    /**
     * GET /inventory/stock-requests — admin, inventory and manager can list
     * requests (managers reach it for the approvals UI).
     */
    public function stockRequests(Request $request)
    {
        $query = InventoryStockRequest::with(['items.item', 'requester', 'reviewer'])->latest('id');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('reason_code')) {
            $query->where('reason_code', $request->reason_code);
        }
        if ($request->boolean('mine')) {
            $query->where('requested_by', $request->user()?->id);
        }

        $requests = $query->paginate($request->integer('per_page', 20));

        return response()->json([
            'success' => true,
            'requests' => collect($requests->items())->map(fn ($r) => $this->formatRequest($r))->values(),
            'meta' => [
                'current_page' => $requests->currentPage(),
                'last_page' => $requests->lastPage(),
                'total' => $requests->total(),
            ],
        ]);
    }

    public function showStockRequest($id)
    {
        $request = InventoryStockRequest::with(['items.item', 'requester', 'reviewer'])->findOrFail($id);

        return response()->json(['success' => true, 'request' => $this->formatRequest($request)]);
    }

    /**
     * POST /manager/inventory/stock-requests/{id}/approve — role:manager,admin.
     * Executes the deduction atomically; never runs twice on one request.
     */
    public function approveStockRequest(Request $request, $id)
    {
        $validated = $request->validate([
            'remarks' => 'nullable|string|max:1000',
        ]);

        try {
            $result = $this->inventoryService->approveStockRequest((int) $id, $validated['remarks'] ?? null, $request->user());
            return response()->json(['success' => true, ...$result]);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * POST /manager/inventory/stock-requests/{id}/reject — role:manager,admin.
     */
    public function rejectStockRequest(Request $request, $id)
    {
        $validated = $request->validate([
            'remarks' => 'required|string|max:1000',
        ]);

        try {
            $result = $this->inventoryService->rejectStockRequest((int) $id, $validated['remarks'], $request->user());
            return response()->json(['success' => true, ...$result]);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /*
    |----------------------------------------------------------------------
    | Customer product returns
    |----------------------------------------------------------------------
    */

    public function returns(Request $request)
    {
        $query = InventoryReturn::with(['item', 'receiver', 'inspector'])->latest('id');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('item_id')) {
            $query->where('inventory_item_id', $request->item_id);
        }
        if ($request->filled('search')) {
            $term = $request->search;
            $query->where(function ($q) use ($term) {
                $q->where('return_no', 'like', "%{$term}%")
                  ->orWhere('return_reason', 'like', "%{$term}%");
            });
        }

        $returns = $query->paginate($request->integer('per_page', 20));

        return response()->json([
            'success' => true,
            'returns' => $returns->items(),
            'meta' => [
                'current_page' => $returns->currentPage(),
                'last_page' => $returns->lastPage(),
                'total' => $returns->total(),
            ],
        ]);
    }

    public function storeReturn(Request $request)
    {
        $validated = $request->validate([
            'inventory_item_id' => 'required|integer|exists:inventory_items,id',
            'quantity' => 'required|integer|min:1',
            'source_type' => 'nullable|in:sale,customer_order,manual',
            'source_id' => 'required_if:source_type,sale,customer_order|nullable|integer',
            'return_reason' => 'required|string|max:500',
            'photo' => ['nullable', 'string', 'max:255', $this->evidencePathRule()],
        ]);

        try {
            $result = $this->inventoryService->createReturn($validated);
            return response()->json(['success' => true, ...$result], 201);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /**
     * POST /inventory/returns/{id}/disposition — inspect and disposition a
     * return. `restock` adds sellable stock; `quarantine`, `damaged` and
     * `dispose` keep it out of stock. Quarantined returns can later be
     * restocked or disposed through the same endpoint.
     */
    public function dispositionReturn(Request $request, $id)
    {
        $validated = $request->validate([
            'disposition' => 'required|in:restock,quarantine,damaged,dispose',
            'inspection_notes' => 'nullable|string|max:1000',
            'photo' => ['nullable', 'string', 'max:255', $this->evidencePathRule()],
        ]);

        try {
            $result = $this->inventoryService->setReturnDisposition(
                (int) $id,
                $validated['disposition'],
                $validated['inspection_notes'] ?? null,
                $request->user(),
                $validated['photo'] ?? null
            );
            return response()->json(['success' => true, ...$result]);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    /*
    |----------------------------------------------------------------------
    | Evidence photo upload / secure view
    |----------------------------------------------------------------------
    */

    private const EVIDENCE_DIR = 'inventory-evidence';

    /**
     * Validation rule for `photo` fields. Paths under inventory-evidence/
     * must point at a real uploaded file on the private disk; anything else
     * is treated as a legacy/manual reference string (kept for compatibility).
     */
    private function evidencePathRule(): \Closure
    {
        return function (string $attribute, $value, \Closure $fail) {
            if (str_starts_with((string) $value, self::EVIDENCE_DIR . '/')
                && !\Illuminate\Support\Facades\Storage::disk('private')->exists($value)) {
                $fail('The referenced evidence file does not exist.');
            }
        };
    }

    /**
     * POST /inventory/evidence — store a damage/expiry/incident/inspection
     * photo on the private disk. Returns the stored path; callers attach it
     * to a stock-out request or return via the `photo` field.
     */
    public function uploadEvidence(Request $request)
    {
        $request->validate([
            'photo' => 'required|file|image|mimes:jpg,jpeg,png,webp|max:4096',
        ]);

        $file = $request->file('photo');
        $filename = 'evd_' . now()->format('Ymd_His') . '_' . \Illuminate\Support\Str::random(12)
            . '.' . $file->extension();
        $path = $file->storeAs(self::EVIDENCE_DIR, $filename, 'private');

        return response()->json([
            'success' => true,
            'path' => $path,
            'url' => url('/api/inventory/evidence/' . basename($path)),
        ], 201);
    }

    /**
     * GET /inventory/evidence/{filename} — authenticated staff-only viewer
     * for evidence photos on the private disk. Strict basename validation
     * prevents path traversal.
     */
    public function viewEvidence(string $filename)
    {
        if (!preg_match('/^[A-Za-z0-9._-]+$/', $filename) || str_contains($filename, '..')) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $path = self::EVIDENCE_DIR . '/' . $filename;
        if (!\Illuminate\Support\Facades\Storage::disk('private')->exists($path)) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $mime = [
            'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png', 'webp' => 'image/webp',
        ][strtolower(pathinfo($filename, PATHINFO_EXTENSION))] ?? 'application/octet-stream';

        return response(\Illuminate\Support\Facades\Storage::disk('private')->get($path), 200, [
            'Content-Type' => $mime,
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    /*
    |----------------------------------------------------------------------
    | Formatting
    |----------------------------------------------------------------------
    */

    private function formatMovement(InventoryLog $log): array
    {
        $reversibleBase = abs((int) ($log->delta ?? $log->quantity ?? 0));
        $reversed = (int) ($log->reversed_quantity ?? 0);
        $remaining = max(0, $reversibleBase - $reversed);
        $reversible = $remaining > 0 && in_array($log->movement_type, [
            'stock_out', 'stock_in', 'stock_adjustment_decrement', 'stock_adjustment_set', 'batch_disposal',
        ], true);

        return [
            'id' => $log->id,
            'inventory_item_id' => $log->inventory_item_id,
            'item_name' => $log->inventoryItem?->name,
            'item_sku' => $log->inventoryItem?->sku,
            'movement_type' => $log->movement_type ?? $log->type,
            'reason_code' => $log->reason_code,
            'transaction_no' => $log->transaction_no,
            'quantity' => $log->quantity ?? abs($log->delta ?? 0),
            'delta' => $log->delta,
            'previous_stock' => $log->previous_stock ?? $log->stock_before,
            'new_stock' => $log->new_stock ?? $log->stock_after,
            'reason' => $log->reason,
            'reference_type' => $log->reference_type,
            'reference_id' => $log->reference_id,
            'reference' => $log->reference,
            'original_movement_id' => $log->original_movement_id,
            'reversed_quantity' => $reversed,
            'remaining_reversible' => $remaining,
            'reversible' => $reversible,
            'performed_by' => $log->performed_by ?? $log->user?->name,
            'role' => $log->role,
            'details' => $log->details ? json_decode($log->details, true) : null,
            'created_at' => $log->created_at,
        ];
    }

    private function formatRequest(InventoryStockRequest $request): array
    {
        return [
            'id' => $request->id,
            'request_no' => $request->request_no,
            'transaction_no' => $request->transaction_no,
            'reason_code' => $request->reason_code,
            'reason_label' => InventoryService::STOCK_OUT_REASONS[$request->reason_code] ?? $request->reason_code,
            'status' => $request->status,
            'request_payload' => $request->request_payload,
            'requested_by' => $request->requested_by,
            'requested_by_name' => $request->requester?->name,
            'reviewed_by' => $request->reviewed_by,
            'reviewed_by_name' => $request->reviewer?->name,
            'reviewed_at' => $request->reviewed_at,
            'review_remarks' => $request->review_remarks,
            'executed_at' => $request->executed_at,
            'created_at' => $request->created_at,
            'items' => $request->items->map(fn ($line) => [
                'id' => $line->id,
                'inventory_item_id' => $line->inventory_item_id,
                'item_name' => $line->item?->name,
                'item_sku' => $line->item?->sku,
                'current_stock' => $line->item?->stock,
                'quantity' => $line->quantity,
                'batch_id' => $line->batch_id,
                'line_details' => $line->line_details,
                'movement_id' => $line->movement_id,
            ])->values(),
        ];
    }
}
