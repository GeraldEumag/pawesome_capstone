<?php

namespace App\Http\Controllers;

use App\Models\ControlledDrugCount;
use App\Models\ControlledDrugEntry;
use App\Models\InventoryItem;
use App\Services\ControlledDrugService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Controlled-drug register + weekly two-person counts. Restricted to
 * inventory/manager/admin via route middleware.
 */
class ControlledDrugController extends Controller
{
    /** All controlled-drug items with their current register balance. */
    public function items(): JsonResponse
    {
        $items = InventoryItem::where('item_class', 'controlled_drug')
            ->orderBy('name')
            ->get()
            ->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->name,
                'sku' => $item->sku,
                'stock' => (int) $item->stock,
                'register_balance' => ControlledDrugService::balance($item->id),
                'balance_matches_stock' => ControlledDrugService::balance($item->id) === (int) $item->stock,
            ]);

        return response()->json(['items' => $items]);
    }

    /** Register entries for one item (append-only ledger). */
    public function register(int $itemId): JsonResponse
    {
        $item = InventoryItem::findOrFail($itemId);
        $entries = ControlledDrugEntry::with(['performedBy:id,name', 'witness:id,name', 'prescriber:id,name', 'pet:id,name'])
            ->where('inventory_item_id', $itemId)
            ->orderByDesc('id')
            ->limit(200)
            ->get();

        return response()->json([
            'item' => ['id' => $item->id, 'name' => $item->name, 'sku' => $item->sku, 'stock' => (int) $item->stock],
            'balance' => ControlledDrugService::balance($itemId),
            'entries' => $entries,
        ]);
    }

    /** Step one of the weekly two-person count. */
    public function submitCount(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'inventory_item_id' => 'required|exists:inventory_items,id',
            'counted_balance' => 'required|integer|min:0',
            'reason' => 'nullable|string|max:500',
            'week_of' => 'nullable|date',
        ]);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $count = ControlledDrugService::submitCount(
                InventoryItem::findOrFail($request->inventory_item_id),
                (int) $request->counted_balance,
                $request->input('reason'),
                $request->user()->id,
                $request->input('week_of', now()->startOfWeek()->toDateString())
            );
            return response()->json(['count' => $count], 201);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }
    }

    /** Step two: a different staff member verifies the count. */
    public function verifyCount(Request $request, int $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:500',
        ]);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $count = ControlledDrugService::verifyCount(
                ControlledDrugCount::findOrFail($id),
                $request->user()->id,
                $request->input('reason')
            );
            return response()->json(['count' => $count]);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }
    }

    /** Count history for an item (or all pending counts without a param). */
    public function counts(Request $request): JsonResponse
    {
        $query = ControlledDrugCount::with(['item:id,name,sku', 'countedBy:id,name', 'witnessedBy:id,name'])
            ->latest('week_of')->latest('id');

        if ($request->filled('inventory_item_id')) {
            $query->where('inventory_item_id', $request->inventory_item_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json(['counts' => $query->limit(200)->get()]);
    }
}
