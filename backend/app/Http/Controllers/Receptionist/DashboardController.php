<?php

namespace App\Http\Controllers\Receptionist;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Pet;
use App\Services\InventoryService;
use App\Services\WorkflowNotifier;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;

class DashboardController extends Controller
{
    public function overview()
    {
        $today = Carbon::today();
        
        return response()->json([
            'today_appointments' => Appointment::whereDate('scheduled_at', $today)->count(),
            'pending_appointments' => Appointment::where('status', 'scheduled')->count(),
            'confirmed_appointments' => Appointment::where('status', 'confirmed')->count(),
            'completed_appointments' => Appointment::where('status', 'completed')->count(),
            'total_customers' => Customer::count(),
            'total_pets' => Pet::count(),
            'check_ins_today' => Appointment::whereDate('scheduled_at', $today)
                ->where('status', 'confirmed')->count(),
            'upcoming_appointments' => Appointment::with(['customer', 'pet', 'service'])
                ->where('scheduled_at', '>=', $today)
                ->whereIn('status', ['scheduled', 'confirmed'])
                ->orderBy('scheduled_at')
                ->limit(5)
                ->get(),
            'recent_customers' => Customer::latest()->take(5)->get(),
        ]);
    }

    public function appointments()
    {
        return response()->json(
            Appointment::with(['customer', 'pet', 'service'])
                ->orderBy('scheduled_at')
                ->get()
        );
    }

    public function customers()
    {
        return response()->json(
            Customer::with(['pets', 'user'])->get()
        );
    }

    // Customer Order Management
    public function orders()
    {
        $orders = DB::table('customer_orders')
            ->join('users', 'customer_orders.customer_id', '=', 'users.id')
            ->select('customer_orders.*', 'users.name as customer_name', 'users.email as customer_email')
            ->orderBy('customer_orders.created_at', 'desc')
            ->get();

        // Get order items for each order
        foreach ($orders as $order) {
            $order->items = DB::table('customer_order_items')
                ->where('customer_order_id', $order->id)
                ->get();
        }

        return response()->json($orders);
    }

    public function updateOrderStatus(Request $request, $id)
    {
        $validated = $request->validate([
            'status' => 'required|in:pending,approved,completed,rejected,cancelled',
            'rejection_reason' => 'nullable|string|max:1000',
        ]);

        $user = Auth::user();

        return DB::transaction(function () use ($id, $validated, $user) {
            $inventoryService = new InventoryService();

            $order = DB::table('customer_orders')->where('id', $id)->lockForUpdate()->first();

            if (!$order) {
                return response()->json(['message' => 'Order not found'], 404);
            }

            $updateData = [
                'status' => $validated['status'],
                'updated_at' => now(),
            ];

            $orderItems = DB::table('customer_order_items')
                ->where('customer_order_id', $id)
                ->get();

            // Customer store orders deduct inventory exactly once: when pending is approved.
            if ($validated['status'] === 'approved' && $order->status === 'pending') {
                $updateData['approved_by'] = $user?->id;
                if (Schema::hasColumn('customer_orders', 'approved_at')) {
                    $updateData['approved_at'] = now();
                }
                if (Schema::hasColumn('customer_orders', 'payment_status')) {
                    $updateData['payment_status'] = 'unpaid';
                }

                foreach ($orderItems as $item) {
                    $inventoryService->deductStock(
                        $item->inventory_item_id,
                        $item->quantity,
                        "Customer Order #{$id} approved by Receptionist",
                        'customer_order',
                        $id
                    );
                }
            }

            // If an already approved order is rejected, return the previously deducted stock.
            if (in_array($validated['status'], ['rejected', 'cancelled'], true) && $order->status === 'approved') {
                foreach ($orderItems as $item) {
                    $inventoryService->addStock(
                        $item->inventory_item_id,
                        $item->quantity,
                        "Customer Order #{$id} rejected - stock restored",
                        'customer_order',
                        $id
                    );
                }
            }

            if (in_array($validated['status'], ['rejected', 'cancelled'], true)) {
                if (Schema::hasColumn('customer_orders', 'rejected_by')) {
                    $updateData['rejected_by'] = $user?->id;
                }
                if (Schema::hasColumn('customer_orders', 'rejected_at')) {
                    $updateData['rejected_at'] = now();
                }
                if (Schema::hasColumn('customer_orders', 'rejection_reason')) {
                    $updateData['rejection_reason'] = $validated['rejection_reason'] ?? null;
                }
            }

            DB::table('customer_orders')
                ->where('id', $id)
                ->update($updateData);

            $freshOrder = DB::table('customer_orders')->where('id', $id)->first();
            $customerUserId = $freshOrder->customer_id ?? null;
            $status = $validated['status'];
            $title = match ($status) {
                'approved' => 'Order Approved',
                'cancelled' => 'Order Cancelled',
                'rejected' => 'Order Rejected',
                default => 'Order Updated',
            };

            WorkflowNotifier::notifyUser(
                $customerUserId,
                $title,
                "Order #{$id} is now {$status}.",
                in_array($status, ['rejected', 'cancelled'], true) ? 'error' : 'success',
                'customer_order',
                $id,
                ['rejection_reason' => $validated['rejection_reason'] ?? null]
            );

            ActivityLog::log($user?->id, 'order_' . $status, "Receptionist set order #{$id} to {$status}", [
                'category' => 'orders',
                'reference_type' => 'customer_order',
                'reference_id' => $id,
                'metadata' => ['previous_status' => $order->status, 'new_status' => $status],
            ]);

            return response()->json(['message' => 'Order status updated']);
        });
    }

    // Appointment management
}
