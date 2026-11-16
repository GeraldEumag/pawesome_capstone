<?php

namespace App\Http\Controllers\Receptionist;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CustomerOrderController extends Controller
{
    public function workflowDisabled(Request $request, $id = null)
    {
        return response()->json([
            'success' => false,
            'message' => 'Customer store order processing is disabled.',
        ], 410);
    }

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
                'proof_url' => $order->payment_proof ? url('/api/files/payment-proofs/customer-order/' . $order->id . '/view') : null,
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
}
