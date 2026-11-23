<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Support\EmailContent;
use App\Support\ReceiptBreakdown;

class CustomerStoreController extends Controller
{
    private function orderWorkflowsDisabled()
    {
        return response()->json([
            'success' => false,
            'message' => 'Customer store order workflows are disabled.',
        ], 410);
    }

    public function checkout(Request $request)
    {
        return $this->orderWorkflowsDisabled();
    }

    public function orders(Request $request)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $orders = DB::table('customer_orders')
            ->where(function ($query) use ($user) {
                // Use AND logic to ensure we only get the current customer's orders
                if (Schema::hasColumn('customer_orders', 'customer_id')) {
                    $query->where('customer_id', $user->id);
                } elseif (Schema::hasColumn('customer_orders', 'user_id')) {
                    $query->where('user_id', $user->id);
                } elseif (Schema::hasColumn('customer_orders', 'customer_email') && $user->email) {
                    $query->where('customer_email', $user->email);
                } else {
                    // Fallback: no orders if no proper customer identification field exists
                    $query->whereRaw('1 = 0');
                }
            })
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($order) {
                $orderId = $order->id;

                $itemsQuery = DB::table('customer_order_items');

                if (Schema::hasColumn('customer_order_items', 'customer_order_id')) {
                    $itemsQuery->where('customer_order_id', $orderId);
                } elseif (Schema::hasColumn('customer_order_items', 'order_id')) {
                    $itemsQuery->where('order_id', $orderId);
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
                    'payment_method' => $order->payment_method ?? null,
                    'payment_proof' => $order->payment_proof ?? null,
                    'payment_status' => $order->payment_status ?? 'pending',
                    'status' => $order->status ?? 'pending',
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

    public function show(Request $request, $id)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $order = DB::table('customer_orders')
            ->where('id', $id)
            ->where(function ($q) use ($user) {
                if (Schema::hasColumn('customer_orders', 'customer_id')) {
                    $q->where('customer_id', $user->id);
                }
                if (Schema::hasColumn('customer_orders', 'user_id')) {
                    $q->orWhere('user_id', $user->id);
                }
                if (Schema::hasColumn('customer_orders', 'customer_email') && $user->email) {
                    $q->orWhere('customer_email', $user->email);
                }
            })
            ->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $orderId = $order->id;
        $itemsQuery = DB::table('customer_order_items');
        if (Schema::hasColumn('customer_order_items', 'customer_order_id')) {
            $itemsQuery->where('customer_order_id', $orderId);
        } elseif (Schema::hasColumn('customer_order_items', 'order_id')) {
            $itemsQuery->where('order_id', $orderId);
        }
        $items = $itemsQuery->get();

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $order->id,
                'order_number' => $order->order_number ?? null,
                'reference_number' => $order->reference_number ?? null,
                'customer_name' => $order->customer_name ?? null,
                'customer_email' => $order->customer_email ?? null,
                'subtotal' => (float) ($order->subtotal ?? 0),
                'discount_amount' => (float) ($order->discount_amount ?? 0),
                'total_amount' => (float) ($order->total_amount ?? $order->total ?? 0),
                'payment_method' => $order->payment_method ?? null,
                'payment_proof' => $order->payment_proof ?? null,
                'payment_status' => $order->payment_status ?? 'pending',
                'status' => $order->status ?? 'pending',
                'created_at' => $order->created_at,
                'updated_at' => $order->updated_at,
                'items' => $items,
            ],
        ]);
    }

    public function uploadPaymentProof(Request $request, $id)
    {
        return $this->orderWorkflowsDisabled();
    }

    public function receipt(Request $request, $id)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $order = DB::table('customer_orders')
            ->where('id', $id)
            ->where('customer_id', $user->id)
            ->first();

        if (!$order) {
            return response()->json(['message' => 'Receipt not found'], 404);
        }

        if (($order->payment_status ?? 'unpaid') !== 'paid') {
            return response()->json(['message' => 'Receipt is available only after cashier verification'], 422);
        }

        $items = DB::table('customer_order_items')
            ->where('customer_order_id', $id)
            ->get();

        $verifiedBy = $order->verified_by
            ? DB::table('users')->where('id', $order->verified_by)->value('name')
            : null;

        $totalAmount = (float) ($order->total_amount ?? 0);
        $vatAmount = EmailContent::vatInclusivePortion($totalAmount);

        return response()->json([
            'receipt' => [
                'order_id' => $order->id,
                'receipt_number' => $order->receipt_number,
                'customer_name' => $order->customer_name,
                'customer_email' => $order->customer_email,
                'items' => $items,
                'net_amount' => $vatAmount !== null ? round($totalAmount - $vatAmount, 2) : null,
                'vat_amount' => $vatAmount,
                'vat_rate' => 0.12,
                'total_amount' => $order->total_amount,
                'payment_method' => $order->payment_method,
                'payment_reference' => $order->reference_number ?? $order->payment_reference ?? null,
                'paid_at' => $order->paid_at,
                'verified_by' => $verifiedBy,
                'cashier_remarks' => $order->cashier_remarks,
                'breakdown' => ReceiptBreakdown::forSettleable(
                    'customer_order',
                    (int) $order->id,
                    $totalAmount,
                    0,
                    [
                        'method' => $order->payment_method,
                        'amount' => $totalAmount,
                        'reference_number' => $order->reference_number ?? $order->payment_reference ?? null,
                        'receipt_number' => $order->receipt_number,
                        'paid_at' => $order->paid_at,
                    ]
                ),
            ],
        ]);
    }

    public function cancel(Request $request, $id)
    {
        return $this->orderWorkflowsDisabled();
    }

}