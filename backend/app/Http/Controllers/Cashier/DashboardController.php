<?php

namespace App\Http\Controllers\Cashier;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\Appointment;
use App\Models\InventoryItem;
use App\Models\ActivityLog;
use App\Services\WorkflowNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use App\Services\PaymentVerificationService;

class DashboardController extends Controller
{
    private function overviewData(): array
    {
        $today = Carbon::today();
        $user = auth()->user();

        $lowStockItems = InventoryItem::whereColumn('stock', '<=', 'threshold')
            ->where('stock', '>', 0)
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'sku' => $item->sku,
                    'stock' => $item->stock,
                    'threshold' => $item->threshold,
                ];
            });

        $topSellingProducts = Sale::selectRaw('product_id, COUNT(*) as units_sold, SUM(amount) as revenue')
            ->whereNotNull('product_id')
            ->whereMonth('created_at', $today->month)
            ->groupBy('product_id')
            ->orderByDesc('units_sold')
            ->limit(5)
            ->get()
            ->map(function ($sale) {
                $product = InventoryItem::find($sale->product_id);
                return [
                    'id' => $sale->product_id,
                    'name' => $product ? $product->name : 'Unknown',
                    'units_sold' => $sale->units_sold,
                    'revenue' => $sale->revenue,
                ];
            });

        $pendingOrders = Appointment::where('status', 'confirmed')
            ->with(['pet', 'customer'])
            ->limit(5)
            ->get()
            ->map(function ($appointment) {
                $waitingTime = $appointment->scheduled_at
                    ? Carbon::parse($appointment->scheduled_at)->diffInMinutes(now()) . ' min'
                    : '0 min';
                return [
                    'id' => $appointment->id,
                    'customer' => $appointment->customer ? $appointment->customer->name : 'Guest',
                    'total' => $appointment->service ? $appointment->service->price : 0,
                    'waiting_time' => $waitingTime,
                ];
            });

        // Count service requests by logged-in customer
        $pendingServiceRequests = \App\Models\ServiceRequest::where('customer_email', $user->email)
            ->where('status', 'pending')
            ->count();

        $approvedServiceRequests = \App\Models\ServiceRequest::where('customer_email', $user->email)
            ->where('status', 'approved')
            ->count();

        $paymentPendingServiceRequests = \App\Models\ServiceRequest::where('customer_email', $user->email)
            ->where('payment_status', 'pending')
            ->count();

        $paidServiceRequests = \App\Models\ServiceRequest::where('customer_email', $user->email)
            ->where('payment_status', 'paid')
            ->count();

        $salesByType = Sale::selectRaw('payment_type, COUNT(*) as count, SUM(amount) as total')
            ->whereDate('created_at', $today)
            ->groupBy('payment_type')
            ->get()
            ->map(function ($sale) {
                return [
                    'type' => $sale->payment_type ?? 'cash',
                    'count' => $sale->count,
                    'total' => $sale->total,
                ];
            });

        return [
            'today_sales' => Sale::whereDate('created_at', $today)->sum('amount'),
            'today_transactions' => Sale::whereDate('created_at', $today)->count(),
            'monthly_sales' => Sale::whereMonth('created_at', $today->month)->sum('amount'),
            'monthly_transactions' => Sale::whereMonth('created_at', $today->month)->count(),
            'pending_payments' => Appointment::where('status', 'confirmed')->count(),
            'completed_payments' => Sale::where('type', 'appointment')->count(),
            'recent_sales' => Sale::latest()->limit(10)->get(),
            'sales_by_type' => $salesByType,
            'low_stock_items' => $lowStockItems,
            'top_selling_products' => $topSellingProducts,
            'pending_orders' => $pendingOrders,
            'pending_service_requests' => $pendingServiceRequests,
            'approved_service_requests' => $approvedServiceRequests,
            'payment_pending' => $paymentPendingServiceRequests,
            'payment_paid' => $paidServiceRequests,
        ];
    }

    public function overview()
    {
        return response()->json($this->overviewData());
    }

    public function overviewWrapped()
    {
        return response()->json(['data' => $this->overviewData()]);
    }

    public function sales()
    {
        return response()->json(
            Sale::latest()->get()
        );
    }

    public function transactions(?Request $request = null)
    {
        $perPage = $request ? (int) $request->get('per_page', 50) : 50;
        $page    = $request ? (int) $request->get('page', 1) : 1;
        $search  = $request ? trim((string) $request->get('search', '')) : '';
        $method  = $request ? $request->get('method', 'all') : 'all';
        $dateFilter = $request ? $request->get('date_filter', 'all') : 'all';

        // Get traditional sales (POS transactions)
        $sales = Sale::latest()->limit(200)->get()->map(function ($sale) {
            return [
                'id' => 'SALE-' . $sale->id,
                'transaction_id' => $sale->id,
                'customer' => $sale->customer ? $sale->customer->name : 'Walk-in Customer',
                'customer_name' => $sale->customer ? $sale->customer->name : 'Walk-in Customer',
                'amount' => $sale->amount,
                'method' => $sale->payment_type ?? 'cash',
                'payment_method' => $sale->payment_type ?? 'cash',
                'type' => 'pos_sale',
                'source' => 'pos',
                'date' => $sale->created_at,
                'created_at' => $sale->created_at,
                'status' => $sale->status ?? 'completed',
            ];
        });

        // Get online payments from customer orders
        $customerOrders = DB::table('customer_orders')
            ->where('payment_status', 'paid')
            ->orderBy('paid_at', 'desc')
            ->limit(50)
            ->get()
            ->map(function ($order) {
                return [
                    'id' => 'ORDER-' . $order->id,
                    'transaction_id' => $order->id,
                    'customer' => $order->customer_name ?? 'Customer #' . $order->customer_id,
                    'customer_name' => $order->customer_name ?? 'Customer #' . $order->customer_id,
                    'amount' => $order->total_amount,
                    'method' => $order->payment_method ?? 'Online Payment',
                    'payment_method' => $order->payment_method ?? 'Online Payment',
                    'type' => 'online_order',
                    'source' => 'customer_order',
                    'date' => $order->paid_at ?? $order->updated_at,
                    'created_at' => $order->paid_at ?? $order->updated_at,
                    'status' => $order->status,
                    'payment_reference' => $order->payment_reference,
                    'receipt_number' => $order->receipt_number,
                ];
            });

        // Get veterinary/service payments from service requests
        $serviceRequests = DB::table('service_requests')
            ->where('payment_status', 'paid')
            ->orderBy('paid_at', 'desc')
            ->limit(50)
            ->get()
            ->map(function ($request) {
                return [
                    'id' => 'SERVICE-' . $request->id,
                    'transaction_id' => $request->id,
                    'customer' => $request->customer_name ?? 'Customer',
                    'customer_name' => $request->customer_name ?? 'Customer',
                    'amount' => $request->total_amount ?? $request->price ?? $request->service_price ?? 500,
                    'method' => $request->payment_method ?? 'Service Payment',
                    'payment_method' => $request->payment_method ?? 'Service Payment',
                    'type' => 'service_payment',
                    'source' => 'service_request',
                    'service_type' => $request->request_type ?? 'service',
                    'service_name' => $request->service_name ?? 'Service',
                    'pet_name' => $request->pet_name,
                    'date' => $request->paid_at ?? $request->updated_at,
                    'created_at' => $request->paid_at ?? $request->updated_at,
                    'status' => $request->status,
                    'payment_reference' => $request->payment_reference,
                    'receipt_number' => $request->receipt_number,
                ];
            });

        // Combine all transactions and sort by date (most recent first)
        $allTransactions = $sales
            ->concat($customerOrders)
            ->concat($serviceRequests)
            ->sortByDesc('date')
            ->values();

        // Apply search filter
        if ($search) {
            $keyword = strtolower($search);
            $allTransactions = $allTransactions->filter(function ($t) use ($keyword) {
                return str_contains(strtolower($t['customer'] ?? ''), $keyword)
                    || str_contains(strtolower($t['id'] ?? ''), $keyword)
                    || str_contains(strtolower($t['method'] ?? ''), $keyword);
            })->values();
        }

        // Apply payment method filter
        if ($method && $method !== 'all') {
            $allTransactions = $allTransactions->filter(function ($t) use ($method) {
                return strtolower($t['method'] ?? '') === strtolower($method);
            })->values();
        }

        // Apply date filter
        if ($dateFilter && $dateFilter !== 'all') {
            $now = now();
            $allTransactions = $allTransactions->filter(function ($t) use ($dateFilter, $now) {
                $date = \Carbon\Carbon::parse($t['date'] ?? null);
                if (!$date) return false;
                if ($dateFilter === 'today')  return $date->isToday();
                if ($dateFilter === 'week')   return $date->gte($now->copy()->subDays(7));
                if ($dateFilter === 'month')  return $date->gte($now->copy()->subDays(30));
                return true;
            })->values();
        }

        $total = $allTransactions->count();
        $offset = ($page - 1) * $perPage;
        $paginated = $allTransactions->slice($offset, $perPage)->values();

        return response()->json([
            'transactions' => $paginated,
            'data' => $paginated,
            'meta' => [
                'total'        => $total,
                'per_page'     => $perPage,
                'current_page' => $page,
                'last_page'    => max(1, (int) ceil($total / $perPage)),
            ],
        ]);
    }

    public function history(?Request $request = null)
    {
        return $this->transactions($request);
    }

    public function searchTransactions(Request $request)
    {
        $query = $request->get('q', '');

        $transactions = Sale::where('id', 'like', "%{$query}%")
            ->orWhereHas('customer', function ($q) use ($query) {
                $q->where('name', 'like', "%{$query}%");
            })
            ->orWhere('amount', 'like', "%{$query}%")
            ->with(['customer'])
            ->limit(20)
            ->get()
            ->map(function ($sale) {
                return [
                    'id' => $sale->id,
                    'customer' => $sale->customer ? $sale->customer->name : 'Guest',
                    'payment_type' => $sale->payment_type ?? 'cash',
                    'amount' => $sale->amount,
                    'date' => $sale->created_at->format('Y-m-d'),
                ];
            });

        return response()->json($transactions);
    }

    public function refund(Request $request)
    {
        $validated = $request->validate([
            'transaction_id' => 'required',
            'amount' => 'nullable|numeric|min:0',
            'refund_amount' => 'nullable|numeric|min:0',
            'reason' => 'required|string',
            'cashier_name' => 'required|string',
        ]);

        // Create refund record
        $refund = Sale::create([
            'amount' => $validated['amount'] ?? $validated['refund_amount'] ?? 0,
            'type' => 'refund',
            'status' => 'completed',
            'payment_type' => 'refund',
            'notes' => 'Refund for ' . $validated['transaction_id'] . ': ' . $validated['reason'],
        ]);

        return response()->json([
            'success' => true,
            'refund_id' => $refund->id,
        ]);
    }

    public function multiPayment(Request $request)
    {
        $validated = $request->validate([
            'cash_amount' => 'required|numeric|min:0',
            'card_amount' => 'required|numeric|min:0',
            'total_amount' => 'required|numeric|min:0',
            'transaction_id' => 'nullable',
        ]);

        // Create multi-payment record
        $payment = Sale::create([
            'amount' => $validated['total_amount'],
            'type' => 'multi_payment',
            'status' => 'completed',
            'payment_type' => 'multi',
            'cash_amount' => $validated['cash_amount'],
            'card_amount' => $validated['card_amount'],
            'notes' => isset($validated['transaction_id']) ? 'Split payment for ' . $validated['transaction_id'] : null,
        ]);

        return response()->json([
            'success' => true,
            'transaction_id' => $payment->id,
        ]);
    }

    public function applyDiscount(Request $request)
    {
        $validated = $request->validate([
            'code' => 'required|string',
            'transaction_id' => 'nullable',
        ]);

        // Simple discount logic - in production, check against discount codes table
        $discountAmount = 0;
        $discountPercent = 0;

        // Example discount codes
        switch (strtoupper($validated['code'])) {
            case 'DISCOUNT10':
                $discountPercent = 10;
                break;
            case 'SAVE20':
                $discountPercent = 20;
                break;
            case 'WELCOME':
                $discountPercent = 15;
                break;
        }

        // Get transaction amount
        $transaction = isset($validated['transaction_id']) ? Sale::find($validated['transaction_id']) : null;
        if ($transaction) {
            $discountAmount = ($transaction->amount * $discountPercent) / 100;
            $newTotal = $transaction->amount - $discountAmount;
        } else {
            $newTotal = 0;
        }

        return response()->json([
            'success' => true,
            'discount_amount' => $discountAmount,
            'new_total' => $newTotal,
        ]);
    }

    public function generateReceipt($id)
    {
        $transaction = Sale::with(['customer', 'items'])->find($id);

        if (!$transaction) {
            return response()->json(['error' => 'Transaction not found'], 404);
        }

        return response()->json([
            'transaction_id' => $transaction->id,
            'items' => $transaction->items ?? [],
            'total' => $transaction->amount,
            'date' => $transaction->created_at->format('Y-m-d H:i:s'),
            'customer' => $transaction->customer ? $transaction->customer->name : 'Guest',
            'payment_type' => $transaction->payment_type ?? 'cash',
        ]);
    }

    public function handover(Request $request)
    {
        $validated = $request->validate([
            'note' => 'required|string',
            'cashier_name' => 'required|string',
        ]);

        ActivityLog::logForAuthUser('cashier_handover', $validated['note'], [
            'category' => 'cashier',
            'subcategory' => 'handover',
            'reference_type' => 'cashier_handover',
            'reference_id' => auth()->id(),
            'metadata' => [
                'cashier_name' => $validated['cashier_name'],
                'shift_date' => now()->toIso8601String(),
            ],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Handover note saved successfully',
        ]);
    }

    public function getLastHandover()
    {
        $lastHandover = ActivityLog::where('action', 'cashier_handover')
            ->where('user_id', auth()->id())
            ->latest()
            ->first();

        return response()->json([
            'success' => true,
            'handover' => $lastHandover ? [
                'note' => $lastHandover->description,
                'cashier_name' => $lastHandover->metadata['cashier_name'] ?? null,
                'shift_date' => $lastHandover->metadata['shift_date'] ?? null,
                'created_at' => $lastHandover->created_at->toIso8601String(),
            ] : null,
        ]);
    }

    public function endShift(Request $request)
    {
        $data = $request->validate([
            'cashier_name' => 'nullable|string',
            'shift_date' => 'nullable|date',
            'total_sales' => 'nullable|numeric|min:0',
            'total_transactions' => 'nullable|integer|min:0',
            'cash_collected' => 'nullable|numeric|min:0',
            'expected_cash' => 'nullable|numeric|min:0',
            'actual_cash' => 'nullable|numeric|min:0',
            'cash_difference' => 'nullable|numeric',
            'note' => 'nullable|string',
        ]);

        ActivityLog::logForAuthUser('cashier_end_shift', $data['note'] ?? 'Shift ended', [
            'category' => 'cashier',
            'subcategory' => 'end_shift',
            'reference_type' => 'cashier_shift',
            'reference_id' => auth()->id(),
            'metadata' => array_merge($data, [
                'submitted_at' => now()->toIso8601String(),
            ]),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Shift report submitted successfully',
            'shift_report' => array_merge($data, [
                'id' => 'SHIFT-' . now()->format('YmdHis'),
                'submitted_at' => now()->toIso8601String(),
            ]),
        ]);
    }

    public function getLastShiftReport()
    {
        $lastShift = ActivityLog::where('action', 'cashier_end_shift')
            ->where('user_id', auth()->id())
            ->latest()
            ->first();

        return response()->json([
            'success' => true,
            'shift_report' => $lastShift ? array_merge(
                $lastShift->metadata ?? [],
                ['created_at' => $lastShift->created_at->toIso8601String()]
            ) : null,
        ]);
    }

    public function voidTransaction(Request $request)
    {
        $validated = $request->validate([
            'transaction_id' => 'required',
            'reason' => 'required|string',
            'cashier_name' => 'required|string',
        ]);

        // Strip common prefixes to get numeric ID
        $rawId = $validated['transaction_id'];
        $numericId = preg_replace('/^(SALE-|TRX-|ORDER-|SERVICE-)/i', '', $rawId);

        // Find and void the transaction
        $transaction = Sale::find($numericId);
        if (!$transaction) {
            return response()->json([
                'success' => false,
                'message' => 'Transaction not found.',
            ], 404);
        }

        $transaction->status = 'voided';
        $transaction->void_reason = $validated['reason'];
        $transaction->voided_by = $validated['cashier_name'];
        $transaction->voided_at = now();
        $transaction->save();

        return response()->json([
            'success' => true,
            'message' => 'Transaction voided successfully.',
        ]);
    }

    // Payment Verification Methods
    public function getPaymentRequests()
    {
        // Get store order payments
        $orders = DB::table('customer_orders')
            ->where('status', 'approved')
            ->where('payment_status', 'pending')
            ->orderBy('updated_at', 'desc')
            ->get()
            ->map(function ($order) {
                $items = DB::table('customer_order_items')
                    ->where('customer_order_id', $order->id)
                    ->get();

                return [
                    'id' => $order->id,
                    'payable_type' => 'customer_order',
                    'customer_name' => $order->customer_name ?? 'Customer #' . $order->customer_id,
                    'customer_email' => $order->customer_email ?? null,
                    'request_type' => 'Store Order',
                    'service_name' => 'Order #' . $order->id,
                    'items' => $items,
                    'amount' => $order->total_amount,
                    'payment_method' => $order->payment_method,
                    'payment_reference' => $order->payment_reference ?? null,
                    'payment_proof' => $order->payment_proof ?? null,
                    'proof_url' => $order->payment_proof ? url('/api/files/payment-proofs/customer-order/' . $order->id . '/view') : null,
                    'request_date' => $order->updated_at,
                    'status' => $order->status,
                    'payment_status' => $order->payment_status ?? 'pending',
                ];
            });

        // Get service request payments
        $serviceRequests = DB::table('service_requests')
            ->where('status', 'approved')
            ->where('payment_status', 'pending')
            ->whereNotNull('payment_proof')
            ->orderBy('updated_at', 'desc')
            ->get()
            ->map(function ($request) {
                return [
                    'id' => $request->id,
                    'payable_type' => 'service_request',
                    'type' => 'service_request',
                    'source' => 'service_request',
                    'payment_source' => 'service_request',
                    'customer_name' => $request->customer_name ?? 'Customer',
                    'customer_email' => $request->customer_email,
                    'pet_name' => $request->pet_name,
                    'request_type' => $request->request_type ?? $request->service_type ?? 'Service',
                    'service_name' => $request->service_name ?? $request->request_type ?? 'Service Request',
                    'amount' => $request->total_amount ?? $request->price ?? $request->service_price ?? 500,
                    'payment_method' => $request->payment_method,
                    'payment_reference' => $request->payment_reference ?? null,
                    'payment_proof' => $request->payment_proof,
                    'proof_url' => $request->payment_proof ? url('/api/files/payment-proofs/service-request/' . $request->id . '/view') : null,
                    'request_date' => $request->updated_at,
                    'status' => $request->status,
                    'payment_status' => $request->payment_status,
                ];
            });

        $boardings = DB::table('boardings')
            ->whereIn('status', ['approved', 'scheduled', 'checked_in', 'in_care', 'ready_for_pickup'])
            ->where('payment_status', 'pending')
            ->whereNotNull('payment_proof')
            ->orderBy('updated_at', 'desc')
            ->get()
            ->map(function ($boarding) {
                return [
                    'id' => $boarding->id,
                    'payable_type' => 'boarding',
                    'type' => 'boarding',
                    'source' => 'boarding',
                    'payment_source' => 'boarding',
                    'customer_name' => $boarding->customer_name ?? 'Customer',
                    'customer_email' => $boarding->customer_email,
                    'pet_name' => $boarding->pet_name,
                    'request_type' => 'Pet Boarding',
                    'service_name' => 'Pet Hotel Boarding #' . $boarding->id,
                    'amount' => $boarding->total_amount,
                    'payment_method' => $boarding->payment_method,
                    'payment_reference' => $boarding->payment_reference,
                    'payment_proof' => $boarding->payment_proof,
                    'proof_url' => $boarding->payment_proof ? url('/api/files/payment-proofs/boarding/' . $boarding->id . '/view') : null,
                    'request_date' => $boarding->updated_at,
                    'status' => $boarding->status,
                    'payment_status' => $boarding->payment_status,
                ];
            });

        $confinements = DB::table('medical_confinements')
            ->where('payment_status', 'pending')
            ->whereNotNull('payment_proof')
            ->orderBy('updated_at', 'desc')
            ->get()
            ->map(function ($confinement) {
                return [
                    'id' => $confinement->id,
                    'payable_type' => 'medical_confinement',
                    'type' => 'medical_confinement',
                    'source' => 'medical_confinement',
                    'payment_source' => 'medical_confinement',
                    'customer_name' => $confinement->customer_name ?? 'Customer',
                    'customer_email' => $confinement->customer_email,
                    'pet_name' => $confinement->pet_name,
                    'request_type' => 'Medical Confinement',
                    'service_name' => 'Medical Confinement #' . $confinement->id,
                    'amount' => $confinement->final_amount ?? $confinement->estimated_cost ?? 0,
                    'payment_method' => $confinement->payment_method,
                    'payment_reference' => $confinement->payment_reference,
                    'payment_proof' => $confinement->payment_proof,
                    'proof_url' => $confinement->payment_proof ? url('/api/files/payment-proofs/medical_confinement/' . $confinement->id . '/view') : null,
                    'request_date' => $confinement->updated_at,
                    'status' => $confinement->status,
                    'payment_status' => $confinement->payment_status,
                ];
            });

        $allPayments = $orders->concat($serviceRequests)->concat($boardings)->concat($confinements);

        return response()->json(['payments' => $allPayments]);
    }

    public function verifyPayment(Request $request, $id)
    {
        $type = $request->input('type', $request->route('type', 'customer_order'));
        $svc = new PaymentVerificationService();
        $result = $svc->verify($type, (int) $id, $request);
        $status = $result['status'] ?? 200;
        return response()->json($result, $status);
    }

    private function verifyServiceRequestPayment(Request $request, $id)
    {
        try {
            $serviceRequest = DB::table('service_requests')->where('id', $id)->first();

            if (!$serviceRequest) {
                return response()->json(['message' => 'Service request not found'], 404);
            }

            if ($serviceRequest->payment_status !== 'pending') {
                return response()->json([
                    'message' => 'Only pending payment proofs can be verified',
                    'current_status' => $serviceRequest->payment_status
                ], 422);
            }

            $receiptNumber = 'SR-REC-' . now()->format('YmdHis') . '-' . $id;

            DB::table('service_requests')
                ->where('id', $id)
                ->update([
                    'payment_status' => 'paid',
                    'paid_at' => now(),
                    'verified_by' => auth()->id(),
                    'cashier_remarks' => $request->input('cashier_remarks', 'Payment verified by cashier'),
                    'receipt_number' => $receiptNumber,
                ]);

            ActivityLog::log(auth()->id(), 'payment_verified', "Cashier verified payment for service request #{$id}", [
                'category' => 'payment',
                'reference_type' => 'service_request',
                'reference_id' => $id,
                'metadata' => ['receipt_number' => $receiptNumber],
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Service request payment verified successfully.',
                'receipt_number' => $receiptNumber,
                'request' => $serviceRequest,
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to verify payment: ' . $e->getMessage()
            ], 500);
        }
    }

    private function verifyCustomerOrderPayment(Request $request, $id)
    {
        $order = DB::table('customer_orders')->where('id', $id)->first();

        if (!$order) {
            return response()->json(['message' => 'Payment request not found'], 404);
        }

        if (($order->payment_status ?? 'unpaid') !== 'pending') {
            return response()->json(['message' => 'Only pending payment proofs can be verified'], 422);
        }

        $receiptNumber = $order->receipt_number ?? ('REC-' . now()->format('YmdHis') . '-' . $order->id);

        // Note: Stock deduction should happen during receptionist order approval, not during payment verification
        // Cashier only updates payment status and generates receipt

        DB::table('customer_orders')
            ->where('id', $id)
            ->update([
                'payment_status' => 'paid',
                'paid_at' => now(),
                'verified_by' => auth()->id(),
                'cashier_remarks' => $request->input('cashier_remarks'),
                'receipt_number' => $receiptNumber,
                'updated_at' => now(),
            ]);

        WorkflowNotifier::notifyUser(
            $order->customer_id,
            'Payment Verified',
            "Payment for order #{$id} was verified. Receipt: {$receiptNumber}.",
            'success',
            'customer_order',
            $id,
            ['receipt_number' => $receiptNumber]
        );

        ActivityLog::log(auth()->id(), 'payment_verified', "Cashier verified payment for order #{$id}", [
            'category' => 'payment',
            'reference_type' => 'customer_order',
            'reference_id' => $id,
            'metadata' => ['receipt_number' => $receiptNumber],
        ]);

        return response()->json([
            'message' => 'Payment verified successfully',
            'payment_status' => 'paid',
            'receipt_number' => $receiptNumber,
        ]);
    }

    public function rejectPayment(Request $request, $id)
    {
        $type = $request->input('type', $request->route('type', 'customer_order'));
        $svc = new PaymentVerificationService();
        $result = $svc->reject($type, (int) $id, $request);
        $status = $result['status'] ?? 200;
        return response()->json($result, $status);
    }

    private function rejectServiceRequestPayment(Request $request, $id)
    {
        try {
            $serviceRequest = DB::table('service_requests')->where('id', $id)->first();

            if (!$serviceRequest) {
                return response()->json(['message' => 'Service request not found'], 404);
            }

            if ($serviceRequest->payment_status !== 'pending') {
                return response()->json([
                    'message' => 'Only pending payment proofs can be rejected',
                    'current_status' => $serviceRequest->payment_status
                ], 422);
            }

            $rejectionReason = $request->input('rejection_reason');

            DB::table('service_requests')
                ->where('id', $id)
                ->update([
                    'payment_status' => 'rejected',
                    'rejected_by' => auth()->id(),
                    'rejected_at' => now(),
                    'rejection_reason' => $rejectionReason,
                ]);

            ActivityLog::log(auth()->id(), 'payment_rejected', "Cashier rejected payment for service request #{$id}", [
                'category' => 'payment',
                'reference_type' => 'service_request',
                'reference_id' => $id,
                'metadata' => ['rejection_reason' => $rejectionReason],
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Service request payment rejected',
                'request' => $serviceRequest,
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to reject payment: ' . $e->getMessage()
            ], 500);
        }
    }

    private function rejectCustomerOrderPayment(Request $request, $id)
    {
        $order = DB::table('customer_orders')->where('id', $id)->first();

        if (!$order) {
            return response()->json(['message' => 'Payment request not found'], 404);
        }

        if (($order->payment_status ?? 'unpaid') !== 'pending') {
            return response()->json(['message' => 'Only pending payment proofs can be rejected'], 422);
        }

        $rejectionReason = $request->input('rejection_reason');

        DB::table('customer_orders')
            ->where('id', $id)
            ->update([
                'payment_status' => 'rejected',
                'rejected_by' => auth()->id(),
                'rejected_at' => now(),
                'rejection_reason' => $rejectionReason,
            ]);

        ActivityLog::log(auth()->id(), 'payment_rejected', "Cashier rejected payment for order #{$id}", [
            'category' => 'payment',
            'reference_type' => 'customer_order',
            'reference_id' => $id,
            'metadata' => ['rejection_reason' => $rejectionReason],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payment rejected',
            'order' => $order,
        ]);
    }

    public function customerOrderReceipt($id)
    {
        $order = DB::table('customer_orders')->where('id', $id)->first();

        if (!$order) {
            return response()->json(['message' => 'Receipt not found'], 404);
        }

        if (($order->payment_status ?? 'unpaid') !== 'paid') {
            return response()->json(['message' => 'Receipt is available only after payment verification'], 422);
        }

        $items = DB::table('customer_order_items')
            ->where('customer_order_id', $id)
            ->get();

        $verifiedBy = $order->verified_by
            ? DB::table('users')->where('id', $order->verified_by)->value('name')
            : null;

        return response()->json([
            'receipt' => [
                'order_id' => $order->id,
                'receipt_number' => $order->receipt_number,
                'customer_name' => $order->customer_name,
                'customer_email' => $order->customer_email,
                'items' => $items,
                'total_amount' => $order->total_amount,
                'payment_method' => $order->payment_method,
                'payment_reference' => $order->payment_reference ?? null,
                'paid_at' => $order->paid_at,
                'verified_by' => $verifiedBy,
                'cashier_remarks' => $order->cashier_remarks,
            ],
        ]);
    }
}
