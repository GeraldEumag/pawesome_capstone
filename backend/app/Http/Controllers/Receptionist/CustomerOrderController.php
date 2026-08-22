<?php

namespace App\Http\Controllers\Receptionist;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Services\WorkflowNotifier;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class CustomerOrderController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        
        if (!$user || !$user->hasRoleAccess('receptionist', 'admin')) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $status = $request->get('status', 'all');
        $paymentStatus = $request->get('payment_status', 'all');

        $query = DB::table('customer_orders')
            ->orderBy('created_at', 'desc');

        if ($status !== 'all') {
            $query->where('status', $status);
        }

        if ($paymentStatus !== 'all') {
            $query->where('payment_status', $paymentStatus);
        }

        $orders = $query->get()->map(function ($order) {
            $itemsQuery = DB::table('customer_order_items');

            if (Schema::hasColumn('customer_order_items', 'customer_order_id')) {
                $itemsQuery->where('customer_order_id', $order->id);
            } elseif (Schema::hasColumn('customer_order_items', 'order_id')) {
                $itemsQuery->where('order_id', $order->id);
            }

            $items = $itemsQuery->get();

            return [
                'id' => $order->id,
                'order_number' => $order->order_number ?? null,
                'reference_number' => $order->reference_number ?? null,
                'customer_name' => $order->customer_name ?? null,
                'customer_email' => $order->customer_email ?? null,
                'subtotal' => (float) ($order->subtotal ?? 0),
                'discount_amount' => (float) ($order->discount_amount ?? 0),
                'total_amount' => (float) ($order->total_amount ?? $order->total ?? 0),
                'order_type' => $order->order_type ?? 'Pick-up',
                'payment_method' => $order->payment_method ?? null,
                'payment_reference' => $order->payment_reference ?? null,
                'payment_proof' => $order->payment_proof ?? null,
                'proof_url' => $order->payment_proof ? asset('storage/' . $order->payment_proof) : null,
                'payment_status' => $order->payment_status ?? 'unpaid',
                'status' => $order->status ?? 'pending',
                'approved_by' => $order->approved_by ?? null,
                'approved_at' => $order->approved_at ?? null,
                'rejected_by' => $order->rejected_by ?? null,
                'rejected_at' => $order->rejected_at ?? null,
                'rejection_reason' => $order->rejection_reason ?? null,
                'created_at' => $order->created_at,
                'updated_at' => $order->updated_at,
                'items' => $items,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $orders,
        ]);
    }

    public function pending(Request $request)
    {
        return $this->index($request->merge(['status' => 'pending']));
    }

    public function approvalHistory(Request $request)
    {
        return $this->index($request->merge(['status' => 'approved']));
    }

    public function show($id)
    {
        $user = Auth::user();
        
        if (!$user || !$user->hasRoleAccess('receptionist', 'admin')) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $order = DB::table('customer_orders')->where('id', $id)->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $itemsQuery = DB::table('customer_order_items');

        if (Schema::hasColumn('customer_order_items', 'customer_order_id')) {
            $itemsQuery->where('customer_order_id', $order->id);
        } elseif (Schema::hasColumn('customer_order_items', 'order_id')) {
            $itemsQuery->where('order_id', $order->id);
        }

        $items = $itemsQuery->get();

        // Get current stock for each item
        $itemsWithStock = $items->map(function ($item) {
            $inventoryItem = DB::table('inventory_items')
                ->where('id', $item->inventory_item_id)
                ->first();

            return [
                'id' => $item->id,
                'inventory_item_id' => $item->inventory_item_id,
                'product_name' => $item->product_name,
                'quantity' => $item->quantity,
                'price' => (float) $item->price,
                'subtotal' => (float) $item->subtotal,
                'current_stock' => $inventoryItem ? (int) $inventoryItem->stock : 0,
                'stock_available' => $inventoryItem ? ((int) $inventoryItem->stock >= (int) $item->quantity) : false,
            ];
        });

        $orderData = [
            'id' => $order->id,
            'order_number' => $order->order_number ?? null,
            'reference_number' => $order->reference_number ?? null,
            'customer_name' => $order->customer_name ?? null,
            'customer_email' => $order->customer_email ?? null,
            'subtotal' => (float) ($order->subtotal ?? 0),
            'discount_amount' => (float) ($order->discount_amount ?? 0),
            'total_amount' => (float) ($order->total_amount ?? $order->total ?? 0),
            'order_type' => $order->order_type ?? 'Pick-up',
            'payment_method' => $order->payment_method ?? null,
            'payment_status' => $order->payment_status ?? 'unpaid',
            'status' => $order->status ?? 'pending',
            'approved_by' => $order->approved_by ?? null,
            'approved_at' => $order->approved_at ?? null,
            'rejected_by' => $order->rejected_by ?? null,
            'rejected_at' => $order->rejected_at ?? null,
            'rejection_reason' => $order->rejection_reason ?? null,
            'created_at' => $order->created_at,
            'updated_at' => $order->updated_at,
            'items' => $itemsWithStock,
        ];

        return response()->json([
            'success' => true,
            'data' => $orderData,
        ]);
    }

    public function approve(Request $request, $id)
    {
        $user = Auth::user();
        
        if (!$user || !$user->hasRoleAccess('receptionist', 'admin')) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $order = DB::table('customer_orders')->where('id', $id)->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        if ($order->status !== 'pending') {
            return response()->json(['message' => 'Only pending orders can be approved'], 422);
        }

        try {
            DB::beginTransaction();

            // Get order items
            $itemsQuery = DB::table('customer_order_items');

            if (Schema::hasColumn('customer_order_items', 'customer_order_id')) {
                $itemsQuery->where('customer_order_id', $order->id);
            } elseif (Schema::hasColumn('customer_order_items', 'order_id')) {
                $itemsQuery->where('order_id', $order->id);
            }

            $items = $itemsQuery->get();

            // Check stock availability for all items
            $insufficientStockItems = [];
            foreach ($items as $item) {
                $inventoryItem = DB::table('inventory_items')
                    ->where('id', $item->inventory_item_id)
                    ->first();

                if (!$inventoryItem) {
                    DB::rollBack();
                    return response()->json([
                        'success' => false,
                        'message' => "Product not found: {$item->product_name}",
                    ], 422);
                }

                $availableStock = (int) ($inventoryItem->stock ?? 0);
                $requiredQuantity = (int) $item->quantity;

                if ($availableStock < $requiredQuantity) {
                    $insufficientStockItems[] = [
                        'product_name' => $item->product_name,
                        'required' => $requiredQuantity,
                        'available' => $availableStock,
                    ];
                }
            }

            if (!empty($insufficientStockItems)) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Insufficient stock for some items',
                    'insufficient_stock' => $insufficientStockItems,
                ], 422);
            }

            // Deduct stock and create inventory logs
            foreach ($items as $item) {
                $inventoryItem = DB::table('inventory_items')
                    ->where('id', $item->inventory_item_id)
                    ->first();

                $previousStock = (int) $inventoryItem->stock;
                $quantity = (int) $item->quantity;
                $newStock = $previousStock - $quantity;

                // Update inventory stock
                DB::table('inventory_items')
                    ->where('id', $item->inventory_item_id)
                    ->update(['stock' => $newStock]);

                // Create inventory log
                InventoryLog::create([
                    'inventory_item_id' => $item->inventory_item_id,
                    'delta' => -$quantity,
                    'quantity' => $quantity,
                    'type' => 'sale',
                    'movement_type' => 'customer_order',
                    'reason' => "Customer order #{$order->id} approved",
                    'reference_type' => 'customer_order',
                    'reference_id' => $order->id,
                    'previous_stock' => $previousStock,
                    'new_stock' => $newStock,
                    'stock_before' => $previousStock,
                    'stock_after' => $newStock,
                    'performed_by' => $user->name,
                    'role' => $user->role,
                    'user_id' => $user->id,
                ]);
            }

            // Update order status
            $updateData = [
                'status' => 'approved',
                'payment_status' => 'unpaid',
                'approved_by' => $user->id,
                'approved_at' => now(),
                'updated_at' => now(),
            ];

            if (Schema::hasColumn('customer_orders', 'approved_by')) {
                $updateData['approved_by'] = $user->id;
            }
            if (Schema::hasColumn('customer_orders', 'approved_at')) {
                $updateData['approved_at'] = now();
            }

            DB::table('customer_orders')->where('id', $order->id)->update($updateData);

            DB::commit();

            // Notify customer
            $orderNumber = $order->order_number ?? $order->order_id ?? $order->reference_number ?? $order->id;

            if ($order->customer_email) {
                WorkflowNotifier::notifyUser(
                    $order->customer_id ?? null,
                    'Order Approved',
                    "Your order #{$orderNumber} has been approved. Please proceed with payment.",
                    'success',
                    'customer_order',
                    $order->id,
                    ['order_number' => $orderNumber]
                );
            }

            // Log activity
            ActivityLog::log($user->id, 'customer_order_approved', "Approved customer order #{$order->id}", [
                'category' => 'order',
                'reference_type' => 'customer_order',
                'reference_id' => $order->id,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Order approved successfully',
                'order_id' => $order->id,
                'order_number' => $orderNumber,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Customer order approval error', [
                'order_id' => $id,
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to approve order. Please try again.',
            ], 500);
        }
    }

    public function reject(Request $request, $id)
    {
        $user = Auth::user();
        
        if (!$user || !$user->hasRoleAccess('receptionist', 'admin')) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'rejection_reason' => 'required|string|max:500',
        ]);

        $order = DB::table('customer_orders')->where('id', $id)->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        if ($order->status === 'completed') {
            return response()->json(['message' => 'Completed orders cannot be rejected'], 422);
        }

        try {
            DB::beginTransaction();

            // If order was already approved, restore stock
            if ($order->status === 'approved') {
                $itemsQuery = DB::table('customer_order_items');

                if (Schema::hasColumn('customer_order_items', 'customer_order_id')) {
                    $itemsQuery->where('customer_order_id', $order->id);
                } elseif (Schema::hasColumn('customer_order_items', 'order_id')) {
                    $itemsQuery->where('order_id', $order->id);
                }

                $items = $itemsQuery->get();

                foreach ($items as $item) {
                    $inventoryItem = DB::table('inventory_items')
                        ->where('id', $item->inventory_item_id)
                        ->first();

                    if ($inventoryItem) {
                        $previousStock = (int) $inventoryItem->stock;
                        $quantity = (int) $item->quantity;
                        $newStock = $previousStock + $quantity;

                        // Restore inventory stock
                        DB::table('inventory_items')
                            ->where('id', $item->inventory_item_id)
                            ->update(['stock' => $newStock]);

                        // Create inventory log for stock restoration
                        InventoryLog::create([
                            'inventory_item_id' => $item->inventory_item_id,
                            'delta' => $quantity,
                            'quantity' => $quantity,
                            'type' => 'restock',
                            'movement_type' => 'customer_order_rejection',
                            'reason' => "Customer order #{$order->id} rejected - stock restored",
                            'reference_type' => 'customer_order',
                            'reference_id' => $order->id,
                            'previous_stock' => $previousStock,
                            'new_stock' => $newStock,
                            'stock_before' => $previousStock,
                            'stock_after' => $newStock,
                            'performed_by' => $user->name,
                            'role' => $user->role,
                            'user_id' => $user->id,
                        ]);
                    }
                }
            }

            // Update order status
            $updateData = [
                'status' => 'rejected',
                'rejected_by' => $user->id,
                'rejected_at' => now(),
                'rejection_reason' => $validated['rejection_reason'],
                'updated_at' => now(),
            ];

            if (Schema::hasColumn('customer_orders', 'rejected_by')) {
                $updateData['rejected_by'] = $user->id;
            }
            if (Schema::hasColumn('customer_orders', 'rejected_at')) {
                $updateData['rejected_at'] = now();
            }
            if (Schema::hasColumn('customer_orders', 'rejection_reason')) {
                $updateData['rejection_reason'] = $validated['rejection_reason'];
            }

            DB::table('customer_orders')->where('id', $order->id)->update($updateData);

            DB::commit();

            // Notify customer
            $orderNumber = $order->order_number ?? $order->order_id ?? $order->reference_number ?? $order->id;

            if ($order->customer_email) {
                WorkflowNotifier::notifyUser(
                    $order->customer_id ?? null,
                    'Order Rejected',
                    "Your order #{$orderNumber} has been rejected. Reason: {$validated['rejection_reason']}",
                    'error',
                    'customer_order',
                    $order->id,
                    ['rejection_reason' => $validated['rejection_reason']]
                );
            }

            // Log activity
            ActivityLog::log($user->id, 'customer_order_rejected', "Rejected customer order #{$order->id}", [
                'category' => 'order',
                'reference_type' => 'customer_order',
                'reference_id' => $order->id,
                'metadata' => ['rejection_reason' => $validated['rejection_reason']],
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Order rejected successfully',
                'order_id' => $order->id,
                'order_number' => $orderNumber,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Customer order rejection error', [
                'order_id' => $id,
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to reject order. Please try again.',
            ], 500);
        }
    }

    public function cancel(Request $request, $id)
    {
        $user = Auth::user();
        
        if (!$user || !$user->hasRoleAccess('receptionist', 'admin')) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'cancellation_reason' => 'required|string|max:500',
        ]);

        $order = DB::table('customer_orders')->where('id', $id)->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        if ($order->status === 'completed') {
            return response()->json(['message' => 'Completed orders cannot be cancelled'], 422);
        }

        if ($order->status === 'cancelled') {
            return response()->json(['message' => 'Order is already cancelled'], 422);
        }

        try {
            DB::beginTransaction();

            // If order was already approved, restore stock
            if ($order->status === 'approved') {
                $itemsQuery = DB::table('customer_order_items');

                if (Schema::hasColumn('customer_order_items', 'customer_order_id')) {
                    $itemsQuery->where('customer_order_id', $order->id);
                } elseif (Schema::hasColumn('customer_order_items', 'order_id')) {
                    $itemsQuery->where('order_id', $order->id);
                }

                $items = $itemsQuery->get();

                foreach ($items as $item) {
                    $inventoryItem = DB::table('inventory_items')
                        ->where('id', $item->inventory_item_id)
                        ->first();

                    if ($inventoryItem) {
                        $previousStock = (int) $inventoryItem->stock;
                        $quantity = (int) $item->quantity;
                        $newStock = $previousStock + $quantity;

                        // Restore inventory stock
                        DB::table('inventory_items')
                            ->where('id', $item->inventory_item_id)
                            ->update(['stock' => $newStock]);

                        // Create inventory log for stock restoration
                        InventoryLog::create([
                            'inventory_item_id' => $item->inventory_item_id,
                            'delta' => $quantity,
                            'quantity' => $quantity,
                            'type' => 'restock',
                            'movement_type' => 'customer_order_cancellation',
                            'reason' => "Customer order #{$order->id} cancelled - stock restored",
                            'reference_type' => 'customer_order',
                            'reference_id' => $order->id,
                            'previous_stock' => $previousStock,
                            'new_stock' => $newStock,
                            'stock_before' => $previousStock,
                            'stock_after' => $newStock,
                            'performed_by' => $user->name,
                            'role' => $user->role,
                            'user_id' => $user->id,
                        ]);
                    }
                }
            }

            // Update order status
            $updateData = [
                'status' => 'cancelled',
                'updated_at' => now(),
            ];

            // Add cancellation fields if they exist
            if (Schema::hasColumn('customer_orders', 'cancelled_by')) {
                $updateData['cancelled_by'] = $user->id;
            }
            if (Schema::hasColumn('customer_orders', 'cancelled_at')) {
                $updateData['cancelled_at'] = now();
            }
            if (Schema::hasColumn('customer_orders', 'cancellation_reason')) {
                $updateData['cancellation_reason'] = $validated['cancellation_reason'];
            }

            DB::table('customer_orders')->where('id', $order->id)->update($updateData);

            DB::commit();

            // Notify customer
            $orderNumber = $order->order_number ?? $order->order_id ?? $order->reference_number ?? $order->id;

            if ($order->customer_email) {
                WorkflowNotifier::notifyUser(
                    $order->customer_id ?? null,
                    'Order Cancelled',
                    "Your order #{$orderNumber} has been cancelled. Reason: {$validated['cancellation_reason']}",
                    'warning',
                    'customer_order',
                    $order->id,
                    ['cancellation_reason' => $validated['cancellation_reason']]
                );
            }

            // Log activity
            ActivityLog::log($user->id, 'customer_order_cancelled', "Cancelled customer order #{$order->id}", [
                'category' => 'order',
                'reference_type' => 'customer_order',
                'reference_id' => $order->id,
                'metadata' => ['cancellation_reason' => $validated['cancellation_reason']],
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Order cancelled successfully',
                'order_id' => $order->id,
                'order_number' => $orderNumber,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Customer order cancellation error', [
                'order_id' => $id,
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to cancel order. Please try again.',
            ], 500);
        }
    }
}
