<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CustomerReportController extends Controller
{
    /**
     * Get comprehensive customer reports
     */
    public function getCustomerReports(Request $request)
    {
        $startDate = $request->query('start_date') ?: $request->query('from');
        $endDate = $request->query('end_date') ?: $request->query('to');
        $start = $startDate ? Carbon::parse($startDate)->startOfDay() : Carbon::now()->startOfMonth();
        $end = $endDate ? Carbon::parse($endDate)->endOfDay() : Carbon::now()->endOfDay();

        $customersQuery = Customer::withCount('pets');

        if ($request->filled('status') && $request->query('status') !== 'all') {
            $status = $request->query('status');
            if (in_array($status, ['active', 'inactive'], true)) {
                $customersQuery->where('is_active', $status === 'active');
            }
        }

        if ($request->filled('customer_id')) {
            $customersQuery->where('id', $request->query('customer_id'));
        }

        if ($request->filled('search')) {
            $searchTerm = $request->query('search');
            $customersQuery->where(function ($query) use ($searchTerm) {
                $query->where('name', 'like', "%{$searchTerm}%")
                  ->orWhere('email', 'like', "%{$searchTerm}%")
                  ->orWhere('phone', 'like', "%{$searchTerm}%");
            });
        }

        $customers = $customersQuery->get();

        $reports = $customers->map(function ($customer) use ($start, $end) {
            $orders = $this->customerOrdersFor($customer, $start, $end)->get();
            $totalOrders = $orders->count();
            $totalOrderAmount = $orders->sum('total_amount');

            $orderIds = $orders->pluck('id')->filter()->values();
            $payments = $this->paymentsFor($customer, $orderIds, $start, $end)->get();
            $totalPayments = $payments->sum('amount');
            $paidPayments = $payments
                ->filter(fn ($payment) => in_array($payment->status, ['completed', 'verified', 'paid'], true))
                ->sum('amount');

            $orderStatuses = $orders->groupBy('status')->map(function ($group) {
                return [
                    'status' => $group->first()->status ?? 'unknown',
                    'count' => $group->count(),
                ];
            })->values();

            // Payment status breakdown
            $paymentStatuses = $payments->groupBy('status')->map(function ($group) {
                return [
                    'status' => $group->first()->status ?? 'unknown',
                    'count' => $group->count(),
                    'total' => $group->sum('amount'),
                ];
            })->values();

            $serviceRequests = $this->serviceRequestsFor($customer, $start, $end)->get();
            $serviceStatuses = $serviceRequests->groupBy('status')->map(function ($group) {
                return [
                    'status' => $group->first()->status ?? 'unknown',
                    'count' => $group->count(),
                ];
            })->values();

            return [
                'customer_id' => $customer->id,
                'name' => $customer->name,
                'email' => $customer->email,
                'phone' => $customer->phone,
                'status' => $customer->is_active ? 'active' : 'inactive',
                'is_active' => (bool) $customer->is_active,
                'created_at' => $customer->created_at,
                'last_order_date' => $orders->max('created_at'),
                'total_orders' => $totalOrders,
                'total_order_amount' => (float) $totalOrderAmount,
                'total_payments' => (float) $totalPayments,
                'paid_amount' => (float) $paidPayments,
                'balance_amount' => (float) ($totalOrderAmount - $paidPayments),
                'order_statuses' => $orderStatuses,
                'payment_statuses' => $paymentStatuses,
                'service_requests' => [
                    'total' => $serviceRequests->count(),
                    'statuses' => $serviceStatuses,
                ],
                'loyalty_points' => $customer->loyalty_points ?? 0,
                'pets_count' => $customer->pets_count ?? $customer->pets()->count(),
            ];
        });

        $summary = [
            'total_customers' => $customers->count(),
            'active_customers' => $customers->where('is_active', true)->count(),
            'total_orders' => $reports->sum('total_orders'),
            'total_revenue' => $reports->sum('total_order_amount'),
            'total_payments' => $reports->sum('total_payments'),
            'outstanding_balance' => $reports->sum('balance_amount'),
            'report_period' => [
                'start_date' => $start->format('Y-m-d'),
                'end_date' => $end->format('Y-m-d'),
                'days' => $start->diffInDays($end) + 1,
            ],
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => $summary,
                'customers' => $reports,
                'filters' => [
                    'start_date' => $start->format('Y-m-d'),
                    'end_date' => $end->format('Y-m-d'),
                    'status' => $request->query('status', 'all'),
                    'search' => $request->query('search'),
                ],
            ],
            'generated_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * Get customer detailed report by ID
     */
    public function getCustomerDetail(Request $request, $id)
    {
        $customer = Customer::with('pets')->findOrFail($id);
        $orders = $this->customerOrdersFor($customer)->latest('created_at')->get();
        $paymentsByOrder = $this->paymentsFor($customer, $orders->pluck('id')->filter()->values())
            ->get()
            ->groupBy('order_id');
        $serviceRequests = $this->serviceRequestsFor($customer)->latest('created_at')->get();

        $customerDetail = [
            'customer_info' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'email' => $customer->email,
                'phone' => $customer->phone,
                'address' => $customer->address,
                'status' => $customer->is_active ? 'active' : 'inactive',
                'is_active' => (bool) $customer->is_active,
                'loyalty_points' => $customer->loyalty_points ?? 0,
                'pets_count' => $customer->pets->count(),
                'created_at' => $customer->created_at,
                'updated_at' => $customer->updated_at,
            ],
            'order_history' => $orders->map(function ($order) use ($paymentsByOrder) {
                $items = $this->tableExists('customer_order_items')
                    ? DB::table('customer_order_items')->where('customer_order_id', $order->id)->get()
                    : collect();

                return [
                    'id' => $order->id,
                    'order_number' => $order->receipt_number ?? "ORD-{$order->id}",
                    'total_amount' => (float) $order->total_amount,
                    'payment_status' => $order->payment_status,
                    'status' => $order->status,
                    'created_at' => $order->created_at,
                    'items' => $items,
                    'payments' => $paymentsByOrder->get($order->id, collect())->values(),
                ];
            }),
            'service_requests' => $serviceRequests->map(function ($request) {
                return [
                    'id' => $request->id,
                    'service_type' => $request->service_type ?? $request->request_type,
                    'service_name' => $request->service_name ?? $request->request_type,
                    'status' => $request->status,
                    'payment_status' => $request->payment_status ?? null,
                    'created_at' => $request->created_at,
                    'notes' => $request->notes,
                ];
            }),
            'pets' => $customer->pets->map(function ($pet) {
                return [
                    'id' => $pet->id,
                    'name' => $pet->name,
                    'type' => $pet->type,
                    'breed' => $pet->breed,
                    'age' => $pet->age,
                    'created_at' => $pet->created_at,
                ];
            }),
        ];

        return response()->json([
            'success' => true,
            'customer' => $customerDetail,
        ]);
    }

    /**
     * Export customer reports to CSV
     */
    public function exportCustomerReports(Request $request)
    {
        $reports = $this->getCustomerReports($request);
        $data = json_decode($reports->getContent(), true);
        
        if (!$data['success']) {
            return response()->json(['success' => false, 'message' => 'Failed to generate report']);
        }

        $filename = 'customer_reports_' . date('Y-m-d_H-i-s') . '.csv';
        
        $callback = function () use ($data) {
            $file = fopen('php://output', 'w');
            
            // Define CSV headers
            $headers = [
                'Customer ID', 'Name', 'Email', 'Phone', 'Status',
                'Total Orders', 'Total Order Amount', 'Total Payments', 'Balance',
                'Last Order Date', 'Loyalty Points', 'Pets Count'
            ];
            
            // Add CSV headers
            fputcsv($file, $headers);
            
            // Add customer data (sanitize user-controlled text against CSV
            // formula injection — values starting with = + - @ tab/CR would
            // otherwise execute as formulas when opened in Excel)
            foreach (($data['data']['customers'] ?? []) as $customer) {
                fputcsv($file, [
                    $customer['customer_id'],
                    $this->sanitizeCsvCell($customer['name']),
                    $this->sanitizeCsvCell($customer['email']),
                    $this->sanitizeCsvCell($customer['phone']),
                    $customer['status'],
                    $customer['total_orders'],
                    $customer['total_order_amount'],
                    $customer['total_payments'],
                    $customer['balance_amount'],
                    $customer['last_order_date'],
                    $customer['loyalty_points'],
                    $customer['pets_count'],
                ]);
            }
            
            fclose($file);
        };

        return response()->stream($callback, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    /**
     * Neutralize spreadsheet formula injection in CSV exports: prefix values
     * beginning with =, +, -, @, tab or CR so Excel renders them literally.
     */
    private function sanitizeCsvCell($value)
    {
        if ($value === null || !is_string($value)) {
            return $value;
        }

        return preg_match('/^[\s]*[=+\-@\t\r]/', $value) ? "'" . $value : $value;
    }

    public function exportCustomerReportsPdf(Request $request)
    {
        $reports = $this->getCustomerReports($request);
        $data = json_decode($reports->getContent(), true);

        return response()->json([
            'success' => true,
            'title' => 'Customer Reports',
            'columns' => [
                ['key' => 'customer_id', 'label' => 'Customer ID'],
                ['key' => 'name', 'label' => 'Name'],
                ['key' => 'email', 'label' => 'Email'],
                ['key' => 'status', 'label' => 'Status'],
                ['key' => 'total_orders', 'label' => 'Orders'],
                ['key' => 'total_order_amount', 'label' => 'Order Amount'],
                ['key' => 'total_payments', 'label' => 'Payments'],
                ['key' => 'balance_amount', 'label' => 'Balance'],
            ],
            'rows' => $data['data']['customers'] ?? [],
            'summary' => $data['data']['summary'] ?? [],
            'generated_at' => now()->toIso8601String(),
        ]);
    }

    private function customerOrdersFor(Customer $customer, ?Carbon $start = null, ?Carbon $end = null)
    {
        if (!$this->tableExists('customer_orders')) {
            return DB::query()->fromSub('select null as id where 1 = 0', 'customer_orders');
        }

        $query = DB::table('customer_orders')->where(function ($nested) use ($customer) {
            if ($customer->user_id && Schema::hasColumn('customer_orders', 'customer_id')) {
                $nested->orWhere('customer_id', $customer->user_id);
            }
            if ($customer->email && Schema::hasColumn('customer_orders', 'customer_email')) {
                $nested->orWhere('customer_email', $customer->email);
            }
        });

        if ($start) {
            $query->whereDate('created_at', '>=', $start);
        }
        if ($end) {
            $query->whereDate('created_at', '<=', $end);
        }

        return $query;
    }

    private function paymentsFor(Customer $customer, $orderIds, ?Carbon $start = null, ?Carbon $end = null)
    {
        if (!$this->tableExists('payments')) {
            return DB::query()->fromSub('select null as id where 1 = 0', 'payments');
        }

        if (!Schema::hasColumn('payments', 'customer_id') && !Schema::hasColumn('payments', 'order_id')) {
            return DB::query()->fromSub('select null as id where 1 = 0', 'payments');
        }

        $query = DB::table('payments')->where(function ($nested) use ($customer, $orderIds) {
            if (Schema::hasColumn('payments', 'customer_id')) {
                $nested->orWhere('customer_id', $customer->id);
            }
            if (Schema::hasColumn('payments', 'order_id') && $orderIds->count() > 0) {
                $nested->orWhereIn('order_id', $orderIds);
            }
        });

        if ($start) {
            $query->whereDate('created_at', '>=', $start);
        }
        if ($end) {
            $query->whereDate('created_at', '<=', $end);
        }

        return $query;
    }

    private function serviceRequestsFor(Customer $customer, ?Carbon $start = null, ?Carbon $end = null)
    {
        if (!$this->tableExists('service_requests')) {
            return DB::query()->fromSub('select null as id where 1 = 0', 'service_requests');
        }

        $query = DB::table('service_requests')->where(function ($nested) use ($customer) {
            if (Schema::hasColumn('service_requests', 'customer_id')) {
                $nested->orWhere('customer_id', $customer->id);
            }
            if ($customer->email && Schema::hasColumn('service_requests', 'customer_email')) {
                $nested->orWhere('customer_email', $customer->email);
            }
        });

        if ($start) {
            $query->whereDate('created_at', '>=', $start);
        }
        if ($end) {
            $query->whereDate('created_at', '<=', $end);
        }

        return $query;
    }

    private function tableExists(string $table): bool
    {
        return Schema::hasTable($table);
    }
}
