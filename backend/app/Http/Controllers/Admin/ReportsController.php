<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\Sale;
use App\Models\User;
use App\Services\RevenueService;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReportsController extends Controller
{
    public function sales(Request $request)
    {
        try {
            $query = $this->dateRange(DB::table('sales'), $request);

            $this->applyExactFilter($query, $request, 'status', 'sales.status');

            $salesperson = $request->query('salesperson_id') ?: $request->query('cashier_id');
            if ($salesperson && $salesperson !== 'all' && Schema::hasColumn('sales', 'cashier_id')) {
                $query->where('sales.cashier_id', $salesperson);
            }

            $search = trim((string) $request->query('search', ''));
            if ($search !== '') {
                $query->where(function ($nested) use ($search) {
                    foreach (['transaction_number', 'type', 'payment_type', 'payment_method', 'notes'] as $column) {
                        if (Schema::hasColumn('sales', $column)) {
                            $nested->orWhere("sales.$column", 'like', "%$search%");
                        }
                    }
                });
            }

            $rows = $query
                ->leftJoin('users as cashiers', 'cashiers.id', '=', 'sales.cashier_id')
                ->select([
                    'sales.*',
                    DB::raw('COALESCE(cashiers.name, "Unassigned") as salesperson_name'),
                    DB::raw('DATE(sales.created_at) as date'),
                ])
                ->latest('sales.created_at')
                ->limit($request->integer('limit', 500))
                ->get();

            $trend = $rows->groupBy('date')->map(fn ($group, $date) => [
                'date' => $date,
                'revenue' => (float) $group->sum(fn ($sale) => (float) ($sale->amount ?? $sale->total_amount ?? 0)),
                'orders' => $group->count(),
            ])->values();

            $message = null;
            if ($rows->isEmpty()) {
                $message = 'No records found for selected date range.';
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'summary' => [
                        'total_revenue' => (float) $rows->sum(fn ($sale) => (float) ($sale->amount ?? $sale->total_amount ?? 0)),
                        'total_orders' => $rows->count(),
                        'completed_orders' => $rows->where('status', 'completed')->count(),
                        'pending_orders' => $rows->where('status', 'pending')->count(),
                    ],
                    'sales' => $rows,
                    'transactions' => $rows,
                    'trend' => $trend,
                    'salespeople' => User::whereIn('role', ['cashier', 'admin', 'manager'])->orderBy('name')->get(['id', 'name', 'role']),
                    'generated_at' => now()->toIso8601String(),
                ],
                'message' => $message,
            ]);
        } catch (\Exception $e) {
            // Return empty results on any error to prevent 500
            return response()->json([
                'success' => true,
                'data' => [
                    'summary' => [
                        'total_revenue' => 0,
                        'total_orders' => 0,
                        'completed_orders' => 0,
                        'pending_orders' => 0,
                    ],
                    'sales' => collect(),
                    'transactions' => collect(),
                    'trend' => collect(),
                    'salespeople' => User::whereIn('role', ['cashier', 'admin', 'manager'])->orderBy('name')->get(['id', 'name', 'role']),
                    'generated_at' => now()->toIso8601String(),
                ],
                'message' => 'No records found for selected date range.',
            ]);
        }
    }

    public function summary()
    {
        $today = Carbon::today();
        $year = Carbon::now()->year;

        $dbDriver = DB::getDriverName();
        if ($dbDriver === 'sqlite') {
            $monthlyRevenue = Sale::selectRaw('CAST(strftime("%m", created_at) AS INTEGER) as month, SUM(amount) as total')
                ->whereRaw('strftime("%Y", created_at) = ?', [$year])
                ->groupBy('month')
                ->orderBy('month')
                ->get();
        } else {
            $monthlyRevenue = Sale::selectRaw('MONTH(created_at) as month, SUM(amount) as total')
                ->whereYear('created_at', $year)
                ->groupBy('month')
                ->orderByRaw('month')
                ->get();
        }

        $topServices = Appointment::selectRaw('service_id, COUNT(*) as count')
            ->with('service')
            ->groupBy('service_id')
            ->orderByDesc('count')
            ->limit(3)
            ->get()
            ->map(fn ($item) => [
                'service' => $item->service?->name ?? 'Unknown Service',
                'count' => $item->count,
            ]);

        $topCustomers = Appointment::selectRaw('customer_id, COUNT(*) as count')
            ->with('customer')
            ->groupBy('customer_id')
            ->orderByDesc('count')
            ->limit(3)
            ->get()
            ->map(fn ($item) => [
                'customer' => $item->customer?->name ?? 'Unknown Customer',
                'visits' => $item->count,
            ]);

        return response()->json([
            'success' => true,
            'timestamp' => now()->toIso8601String(),
            'data' => [
                'total_revenue' => Sale::sum('amount'),
                'today_revenue' => Sale::whereDate('created_at', $today)->sum('amount'),
                'total_transactions' => Sale::count(),
                'today_transactions' => Sale::whereDate('created_at', $today)->count(),
                'total_customers' => Customer::count(),
                'new_customers' => Customer::where('created_at', '>=', Carbon::now()->subMonth())->count(),
                'total_users' => User::count(),
                'total_appointments' => Appointment::count(),
                'completed_appointments' => Appointment::where('status', 'completed')->count(),
                'total_pets' => Pet::count(),
                'total_inventory_items' => InventoryItem::whereNull('archived_at')->count(),
                'low_stock_items' => $this->lowStockCount(),
                'out_of_stock_items' => InventoryItem::whereNull('archived_at')->where('stock', 0)->count(),
                'monthly_revenue' => $monthlyRevenue,
                'top_services' => $topServices,
                'top_customers' => $topCustomers,
            ],
        ]);
    }

    public function overview(Request $request)
    {
        // Real 7-day revenue trend for the chart
        $revenueTrend = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = Carbon::now()->subDays($i);
            $dayRevenue = (float) Sale::whereDate('created_at', $date)->sum('amount') ?? 0;
            $dayOrders = Sale::whereDate('created_at', $date)->count();
            $revenueTrend[] = [
                'date' => $date->format('M d'),
                'revenue' => $dayRevenue,
                'orders' => $dayOrders,
            ];
        }

        $payload = [
            'summary' => $this->overviewMetrics($request),
            'recent_actions' => $this->recentActions($request),
            'transactions' => $this->overviewTransactions($request),
            'appointments' => $this->overviewAppointments($request),
            'users' => $this->overviewUsers($request),
            'low_stock_alerts' => $this->lowStockAlerts($request),
            'pending_operations' => $this->pendingOperations($request),
            'trend' => $revenueTrend,
        ];

        return response()->json([
            'success' => true,
            'section' => 'overview',
            'last_updated' => now()->format('Y-m-d H:i:s'),
            'summary' => $payload['summary'],
            'data' => $payload,
            'charts' => [
                'trend' => $revenueTrend,
            ],
            'filters' => $this->activeFilters($request),
            'message' => null,
        ]);
    }

    public function cashier(Request $request)
    {
        $orders = $this->customerOrdersBase($request);
        $boardingPayments = $this->paymentRowsFromTable($request, 'boardings', 'boarding', 'Boarding');
        $confinementPayments = $this->paymentRowsFromTable($request, 'medical_confinements', 'medical_confinement', 'Medical Confinement');
        $orderPayments = $this->customerOrdersBase($request)
            ->select([
                'customer_orders.id',
                DB::raw('CONCAT("ORDER-", customer_orders.id) as payment_number'),
                DB::raw('COALESCE(customer_orders.customer_name, customer_orders.customer_email, CONCAT("Customer #", customer_orders.customer_id)) as customer_name'),
                DB::raw('"order" as source'),
                'customer_orders.total_amount as amount',
                'customer_orders.payment_status',
                'customer_orders.payment_method',
                'customer_orders.payment_reference',
                'customer_orders.receipt_number',
                'customer_orders.payment_proof',
                'customer_orders.cashier_remarks',
                'customer_orders.paid_at',
                'customer_orders.created_at',
            ])
            ->latest('customer_orders.created_at')
            ->limit(250)
            ->get();
        $paymentRows = $orderPayments
            ->concat($boardingPayments)
            ->concat($confinementPayments)
            ->sortByDesc('created_at')
            ->values();
        $rows = $this->customerOrdersBase($request)
            ->leftJoin('users as verifier', 'verifier.id', '=', 'customer_orders.verified_by')
            ->select([
                'customer_orders.id',
                'customer_orders.customer_id',
                'customer_orders.customer_email',
                'customer_orders.customer_name',
                'customer_orders.total_amount',
                'customer_orders.status',
                'customer_orders.payment_status',
                'customer_orders.payment_method',
                'customer_orders.payment_reference',
                'customer_orders.payment_proof',
                'customer_orders.receipt_number',
                'customer_orders.paid_at',
                'customer_orders.cashier_remarks',
                'customer_orders.created_at',
                DB::raw('COALESCE(verifier.name, customer_orders.verified_by) as verified_by_name'),
            ])
            ->latest('customer_orders.created_at')
            ->limit(250)
            ->get();

        $posRevenue = $this->dateRange(DB::table('sales'), $request)
            ->whereNotIn('type', ['refund', 'multi_payment'])
            ->whereNotIn('status', ['voided', 'cancelled'])
            ->sum('amount');
        $salesRows = $this->salesRows($request);

        $message = null;
        if ($paymentRows->isEmpty() && $rows->isEmpty()) {
            $message = 'No records found for selected date range.';
        }

        return response()->json([
            'success' => true,
            'summary' => [
                'total_revenue' => $this->unifiedRevenue($request),
                'total_cashier_transactions' => $this->dateRange(DB::table('sales'), $request)->count(),
                'pos_sales' => (float) $posRevenue,
                'pending_payment_proofs' => $paymentRows->where('payment_status', 'pending')->count(),
                'verified_payments' => $paymentRows->whereIn('payment_status', ['paid', 'completed', 'verified'])->count(),
                'rejected_payments' => $paymentRows->where('payment_status', 'rejected')->count(),
                'receipt_count' => $paymentRows->filter(fn ($row) => !empty($row->receipt_number))->count(),
            ],
            'data' => [
                'summary' => [
                    'total_revenue' => $this->unifiedRevenue($request),
                    'paid_orders' => (clone $orders)->where('payment_status', 'paid')->count(),
                    'pending_payment_proofs' => $paymentRows->where('payment_status', 'pending')->count(),
                    'rejected_payment_proofs' => $paymentRows->where('payment_status', 'rejected')->count(),
                    'refunds' => $this->tableExists('payments')
                        ? $this->dateRange(DB::table('payments')->where('status', 'refunded'), $request)->count()
                        : 0,
                    'pos_revenue' => (float) $posRevenue,
                ],
                'orders' => $rows,
                'payment_verifications' => $paymentRows,
                'transactions' => $salesRows,
                'salespeople' => User::whereIn('role', ['cashier', 'admin', 'manager'])->orderBy('name')->get(['id', 'name', 'role']),
            ],
            'charts' => [
                'trend' => $this->dailyTrend($salesRows),
                'payment_methods' => $paymentRows->groupBy(fn ($row) => $row->payment_method ?: 'Unspecified')
                    ->map(fn ($group, $method) => ['method' => $method, 'count' => $group->count(), 'amount' => (float) $group->sum('amount')])
                    ->values(),
            ],
            'filters' => $this->activeFilters($request),
            'message' => $message,
        ]);
    }

    public function inventory(Request $request)
    {
        $items = $this->inventoryItemsBase($request);
        $logs = $this->inventoryLogsBase($request)
            ->leftJoin('inventory_items', 'inventory_items.id', '=', 'inventory_logs.inventory_item_id')
            ->select([
                'inventory_logs.id',
                'inventory_logs.inventory_item_id',
                DB::raw('COALESCE(inventory_items.name, "Unknown Item") as item_name'),
                DB::raw($this->columnSelect('inventory_logs', 'movement_type', 'inventory_logs.type', 'movement_type')),
                DB::raw($this->columnSelect('inventory_logs', 'quantity', 'ABS(inventory_logs.delta)', 'quantity')),
                DB::raw($this->columnSelect('inventory_logs', 'previous_stock', 'inventory_logs.stock_before', 'previous_stock')),
                DB::raw($this->columnSelect('inventory_logs', 'new_stock', 'inventory_logs.stock_after', 'new_stock')),
                'inventory_logs.reason',
                DB::raw($this->columnSelect('inventory_logs', 'performed_by', 'inventory_logs.user_id', 'performed_by')),
                'inventory_logs.created_at',
            ])
            ->latest('inventory_logs.created_at')
            ->limit(300)
            ->get();

        $stockValue = (clone $items)->sum(DB::raw('stock * price'));
        $topBrand = $this->topBrand($request);

        $message = null;
        if ($logs->isEmpty() && $items->count() === 0) {
            $message = 'No records found for selected date range.';
        }

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'total_items' => (clone $items)->count(),
                    'low_stock_items' => $this->lowStockCount($request),
                    'out_of_stock_items' => (clone $items)->where('stock', '<=', 0)->count(),
                    'stock_value' => (float) $stockValue,
                    'stock_deductions' => $this->logMovementCount($request, 'deduct'),
                    'stock_restorations' => $this->logMovementCount($request, 'restore'),
                    'manual_adjustments' => $this->logMovementCount($request, 'adjust'),
                    'top_brand' => $topBrand ?: 'No brand data',
                ],
                'items' => $items->latest('created_at')->limit(300)->get(),
                'logs' => $logs,
                'fast_moving_products' => $this->fastMovingProducts($request),
            ],
            'message' => $message,
        ]);
    }

    public function manager(Request $request)
    {
        return response()->json([
            'success' => true,
            'data' => [
                'summary' => array_merge($this->overviewMetrics($request), [
                    'inventory_value' => (float) $this->inventoryItemsBase($request)->sum(DB::raw('stock * price')),
                ]),
                'top_products' => $this->fastMovingProducts($request),
                'top_services' => $this->serviceBreakdown($request),
                'transactions' => $this->salesRows($request),
                'staff_activity' => $this->recentActions($request),
            ],
        ]);
    }

    public function payrollReports(Request $request)
    {
        $payroll = Payroll::with(['user', 'employee'])->latest('pay_period_start')->limit(300)->get();
        $attendance = Attendance::with(['user', 'employee'])->latest('date')->limit(300)->get();

        $payrollRows = $payroll->map(fn ($record) => [
            'id' => $record->id,
            'employee_name' => $record->user?->name ?? $record->employee?->name ?? $record->employee_name ?? 'Unknown Employee',
            'employee_id' => $record->user_id ?? $record->employee_id,
            'person_type' => $record->employee_id ? 'employee' : 'account',
            'employee_no' => $record->employee?->employee_no ?? $record->user?->employee_no,
            'department' => $record->department ?? $record->user?->department ?? $record->employee?->department ?? 'Unassigned',
            'role' => $record->user?->role ?? $record->employee?->position ?? 'Staff',
            'payroll_period' => trim(($record->pay_period_start ?? '') . ' - ' . ($record->pay_period_end ?? '')),
            'attendance_days' => (float) ($record->attendance_days ?? $record->days_worked ?? 0),
            'overtime_pay' => (float) ($record->overtime_pay ?? 0),
            'gross_pay' => (float) ($record->gross_pay ?? $record->total_gross_pay ?? 0),
            'total_deductions' => (float) ($record->total_deductions ?? $record->deductions ?? 0),
            'net_pay' => (float) ($record->net_pay ?? $record->total_net_pay ?? 0),
            'status' => $record->status ?? 'pending',
            'created_at' => $record->created_at,
            'updated_at' => $record->updated_at,
        ]);

        $attendanceRows = $attendance->map(fn ($record) => [
            'id' => $record->id,
            'employee_name' => $record->user?->name ?? $record->employee?->name ?? 'Unknown Employee',
            'employee_id' => $record->user_id ?? $record->employee_id,
            'person_type' => $record->employee_id ? 'employee' : 'account',
            'employee_no' => $record->user?->employee_no ?? $record->employee?->employee_no,
            'department' => $record->user?->department ?? $record->employee?->department ?? 'Unassigned',
            'role' => $record->user?->role ?? $record->employee?->position ?? 'Staff',
            'date' => $record->date,
            'status' => $record->status,
            'time_in' => $record->check_in,
            'time_out' => $record->check_out,
            'overtime_hours' => (float) ($record->overtime_hours ?? 0),
            'created_at' => $record->created_at,
        ]);

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'payroll_records' => $payrollRows->count(),
                    'attendance_records' => $attendanceRows->count(),
                    'gross_pay' => (float) $payrollRows->sum('gross_pay'),
                    'deductions' => (float) $payrollRows->sum('total_deductions'),
                    'net_pay' => (float) $payrollRows->sum('net_pay'),
                    'pending_payroll' => $payrollRows->where('status', 'pending')->count(),
                    'approved_payroll' => $payrollRows->whereIn('status', ['approved', 'released', 'paid'])->count(),
                ],
                'payroll' => $payrollRows,
                'records' => $payrollRows,
                'attendance' => $attendanceRows,
            ],
            'message' => $payrollRows->isEmpty() ? 'No payroll records found.' : null,
        ]);
    }

    public function managerAttendance(Request $request)
    {
        $query = Attendance::with(['user', 'employee'])->latest('date');

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('date', [$request->query('start_date'), $request->query('end_date')]);
        }

        $records = $query->get();

        $byStatus = $records->groupBy('status')->map->count();
        $byDepartment = $records->groupBy(fn ($r) => $r->user?->department ?? 'Unassigned')->map->count();

        return response()->json([
            'success' => true,
            'data' => [
                'attendance' => $records->map(fn ($r) => [
                    'id' => $r->id,
                    'user_id' => $r->user_id,
                    'employee_name' => $r->user?->name ?? $r->employee?->name ?? 'Unknown',
                    'employee_id' => $r->user_id ?? $r->employee_id,
                    'employee_no' => $r->user?->employee_no ?? $r->employee?->employee_no,
                    'person_type' => $r->employee_id ? 'employee' : 'account',
                    'department' => $r->user?->department ?? $r->employee?->department ?? 'Unassigned',
                    'role' => $r->user?->role ?? $r->employee?->position ?? 'Staff',
                    'date' => $r->date?->toDateString(),
                    'time_in' => $r->check_in,
                    'time_out' => $r->check_out,
                    'status' => $r->status,
                    'is_late' => $r->is_late,
                    'is_early_leave' => $r->is_early_leave,
                    'overtime_hours' => (float) $r->overtime_hours,
                    'total_hours' => (float) $r->total_hours,
                    'location' => $r->location,
                    'source' => $r->source ?? 'manual',
                    'biometric_id' => $r->biometric_id,
                    'notes' => $r->notes,
                ]),
                'summary' => [
                    'total_records' => $records->count(),
                    'present' => $byStatus->get('present', 0),
                    'late' => $byStatus->get('late', 0),
                    'absent' => $byStatus->get('absent', 0),
                    'early_leave' => $byStatus->get('early_leave', 0),
                    'total_overtime_hours' => (float) $records->sum('overtime_hours'),
                    'total_late_count' => $records->where('is_late', true)->count(),
                    'biometric_punches' => $records->where('source', 'biometric')->count(),
                ],
                'by_department' => $byDepartment,
                'by_status' => $byStatus,
            ],
        ]);
    }

    public function managerPayroll(Request $request)
    {
        $computation = app(\App\Services\Payroll\PayrollComputationService::class);

        // Resolve the reporting period from `period` or explicit start/end dates.
        [$periodStart, $periodEnd, $periodKey] = $this->resolvePayrollPeriod($request);

        $personType = $request->query('person_type', 'all');

        $savedQuery = Payroll::with(['user', 'employee'])
            ->where(function ($q) use ($periodStart, $periodEnd) {
                $q->whereBetween('pay_period_start', [$periodStart, $periodEnd])
                  ->orWhereBetween('pay_period_end', [$periodStart, $periodEnd]);
            })
            ->latest('pay_period_start');

        if ($personType === 'account') {
            $savedQuery->whereNotNull('user_id')->whereNull('employee_id');
        } elseif ($personType === 'employee') {
            $savedQuery->whereNotNull('employee_id');
        }

        if ($request->filled('department') && $request->department !== 'all') {
            $savedQuery->where('department', $request->department);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $savedQuery->where(function ($q) use ($search) {
                $q->where('payroll_id', 'like', "%{$search}%")
                  ->orWhere('employee_name', 'like', "%{$search}%")
                  ->orWhereHas('user', fn ($uq) => $uq->where('name', 'like', "%{$search}%"));
            });
        }

        $saved = $savedQuery->get();

        $savedRows = $saved->map(fn ($r) => $this->payrollRow($r) + ['is_preview' => false]);

        // Live-compute payroll from attendance for people without a saved
        // record — account users and non-account employees alike.
        $savedUserIds = $saved->pluck('user_id')->filter()->unique();
        $savedEmployeeIds = $saved->pluck('employee_id')->filter()->unique();

        $computed = collect();
        if ($personType !== 'employee') {
            $computed = $computed->concat(
                collect($computation->computeForAllStaff(
                    $periodStart->toDateString(),
                    $periodEnd->toDateString()
                ))->reject(fn ($row) => $savedUserIds->contains($row['user_id']))
            );
        }
        if ($personType !== 'account') {
            $computed = $computed->concat(
                collect($computation->computeForAllEmployees(
                    $periodStart->toDateString(),
                    $periodEnd->toDateString()
                ))->reject(fn ($row) => $savedEmployeeIds->contains($row['employee_id']))
            );
        }

        $previewRows = $computed->map(fn ($row) => array_merge($row, [
            'id' => 'preview-' . $row['person_type'] . '-' . ($row['user_id'] ?? $row['employee_id']),
            'payroll_id' => null,
            'employee_id' => $row['user_id'] ?? $row['employee_id'],
            'period' => $periodKey,
            'pay_period_start' => $periodStart->toDateString(),
            'pay_period_end' => $periodEnd->toDateString(),
            'bonus' => 0.0,
            'allowances' => 0.0,
            'deductions' => 0.0,
            'status' => 'preview',
            'payment_date' => null,
            'payment_method' => null,
            'is_preview' => true,
        ]));

        // Apply department/search filters to preview rows too.
        if ($request->filled('department') && $request->department !== 'all') {
            $previewRows = $previewRows->where('department', $request->department);
        }
        if ($request->filled('search')) {
            $term = strtolower($request->search);
            $previewRows = $previewRows->filter(fn ($row) =>
                str_contains(strtolower($row['employee_name']), $term)
            );
        }

        $allRows = $savedRows->concat($previewRows)->values();

        $byStatus = $allRows->groupBy('status')->map->count();

        $departmentBreakdown = $allRows
            ->groupBy('department')
            ->map(fn ($group, $dept) => [
                'department' => $dept ?: 'Unassigned',
                'employees' => $group->count(),
                'total_salary' => round($group->sum('net_pay'), 2),
                'average' => round($group->avg('net_pay'), 2),
            ])
            ->sortByDesc('total_salary')
            ->values();
        $deptTotal = $departmentBreakdown->sum('total_salary');
        $departmentBreakdown = $departmentBreakdown->map(fn ($d) =>
            $d + ['percentage' => $deptTotal ? round(($d['total_salary'] / $deptTotal) * 100, 1) : 0]
        );

        // Monthly trend from saved payrolls over the last 12 months.
        $monthlyTrend = Payroll::where('pay_period_start', '>=', now()->subMonths(11)->startOfMonth())
            ->get()
            ->groupBy(fn ($r) => Carbon::parse($r->pay_period_start)->format('M Y'))
            ->map(fn ($group, $month) => [
                'month' => $month,
                'payroll' => round($group->sum('net_pay'), 2),
                'employees' => $group->count(),
            ])
            ->sortBy(fn ($row, $month) => Carbon::createFromFormat('M Y', $month))
            ->values();

        $totalNet = round($allRows->sum('net_pay'), 2);
        $totalDeductions = round($allRows->sum(fn ($r) =>
            ($r['deductions'] ?? 0) + ($r['sss_contribution'] ?? 0) + ($r['philhealth_contribution'] ?? 0)
            + ($r['pagibig_contribution'] ?? 0) + ($r['tax_deduction'] ?? 0)
            + ($r['late_deductions'] ?? 0) + ($r['absent_deductions'] ?? 0)
        ), 2);

        // Previous-period growth on saved records only.
        $periodLength = $periodEnd->diffInDays($periodStart) + 1;
        $prevNet = Payroll::whereBetween('pay_period_start', [
            $periodStart->copy()->subDays($periodLength),
            $periodStart->copy()->subDay(),
        ])->sum('net_pay');
        $savedNet = $saved->sum('net_pay');
        $growth = $prevNet > 0 ? round((($savedNet - $prevNet) / $prevNet) * 100, 1) : 0;

        return response()->json([
            'success' => true,
            'data' => [
                'payrolls' => $allRows,
                'payroll' => $allRows,
                'period' => $periodKey,
                'period_start' => $periodStart->toDateString(),
                'period_end' => $periodEnd->toDateString(),
                'summary' => [
                    'total_records' => $saved->count(),
                    'preview_count' => $previewRows->count(),
                    'total_payroll' => $totalNet,
                    'total_employees' => $allRows->count(),
                    'average_salary' => $allRows->count() ? round($totalNet / $allRows->count(), 2) : 0,
                    'total_bonuses' => round($allRows->sum('bonus'), 2),
                    'total_deductions' => $totalDeductions,
                    'growth' => $growth,
                    'total_gross' => round($allRows->sum('gross_pay'), 2),
                    'total_net' => $totalNet,
                    'total_overtime_pay' => round($allRows->sum('overtime_pay'), 2),
                    'draft' => $byStatus->get('draft', 0),
                    'pending' => $byStatus->get('pending', 0),
                    'paid' => $byStatus->get('paid', 0),
                    'preview' => $byStatus->get('preview', 0),
                ],
                'department_breakdown' => $departmentBreakdown,
                'monthly_trend' => $monthlyTrend,
                'top_earners' => $allRows->sortByDesc('net_pay')->take(8)->values(),
                'attendance_summary' => [
                    'staff_with_attendance' => Attendance::whereBetween('date', [$periodStart, $periodEnd])
                        ->distinct('user_id')->count('user_id')
                        + Attendance::whereBetween('date', [$periodStart, $periodEnd])
                            ->distinct('employee_id')->count('employee_id'),
                    'total_hours' => round(Attendance::whereBetween('date', [$periodStart, $periodEnd])->sum('total_hours'), 2),
                ],
                'by_status' => $byStatus,
            ],
        ]);
    }

    private function payrollRow(Payroll $r): array
    {
        return [
            'id' => $r->id,
            'payroll_id' => $r->payroll_id,
            'user_id' => $r->user_id,
            'employee_record_id' => $r->employee_id,
            'employee_id' => $r->user_id ?? $r->employee_id,
            'person_type' => $r->employee_id ? 'employee' : 'account',
            'employee_no' => $r->employee?->employee_no ?? $r->user?->employee_no,
            'employee_name' => $r->user?->name ?? $r->employee?->name ?? $r->employee_name ?? 'Unknown',
            'department' => $r->department ?? $r->user?->department ?? $r->employee?->department ?? 'Unassigned',
            'role' => $r->user?->role ?? $r->employee?->position ?? 'Staff',
            'position' => $r->position ?? $r->user?->position ?? $r->employee?->position ?? 'Staff',
            'period' => $r->pay_period_label,
            'pay_period_start' => $r->pay_period_start?->toDateString(),
            'pay_period_end' => $r->pay_period_end?->toDateString(),
            'base_salary' => (float) $r->base_salary,
            'hourly_rate' => (float) $r->hourly_rate,
            'present_days' => (int) $r->present_days,
            'absent_days' => (int) $r->absent_days,
            'regular_hours' => (float) $r->regular_hours,
            'overtime_hours' => (float) $r->overtime_hours,
            'overtime_pay' => (float) $r->overtime_pay,
            'regular_holiday_pay' => (float) ($r->regular_holiday_pay ?? 0),
            'special_holiday_pay' => (float) ($r->special_holiday_pay ?? 0),
            'night_differential' => (float) ($r->night_differential ?? 0),
            'bonus' => (float) ($r->bonus ?? 0),
            'allowances' => (float) ($r->allowances ?? 0),
            'gross_pay' => (float) $r->gross_pay,
            'deductions' => (float) ($r->deductions ?? 0),
            'sss_contribution' => (float) ($r->sss_contribution ?? 0),
            'philhealth_contribution' => (float) ($r->philhealth_contribution ?? 0),
            'pagibig_contribution' => (float) ($r->pagibig_contribution ?? 0),
            'tax_deduction' => (float) ($r->tax_deduction ?? 0),
            'late_deductions' => (float) ($r->late_deductions ?? 0),
            'absent_deductions' => (float) ($r->absent_deductions ?? 0),
            'total_deductions' => (float) (($r->deductions ?? 0) + ($r->sss_contribution ?? 0) + ($r->philhealth_contribution ?? 0) + ($r->pagibig_contribution ?? 0) + ($r->tax_deduction ?? 0) + ($r->late_deductions ?? 0) + ($r->absent_deductions ?? 0)),
            'net_pay' => (float) $r->net_pay,
            'status' => $r->status,
            'payment_date' => $r->payment_date?->toDateString(),
            'payment_method' => $r->payment_method,
            'remarks' => $r->remarks,
            'created_at' => $r->created_at?->toDateString(),
        ];
    }

    private function resolvePayrollPeriod(Request $request): array
    {
        if ($request->filled('start_date') && $request->filled('end_date')) {
            $start = Carbon::parse($request->start_date)->startOfDay();
            $end = Carbon::parse($request->end_date)->startOfDay();

            return [$start, $end, $start->format('M d') . ' - ' . $end->format('M d, Y')];
        }

        $period = $request->query('period', 'monthly');
        $now = Carbon::now();

        return match ($period) {
            'weekly' => [$now->copy()->startOfWeek(), $now->copy()->endOfWeek(), 'This Week'],
            'quarterly' => [$now->copy()->startOfQuarter(), $now->copy()->endOfQuarter(), 'Q' . $now->quarter . ' ' . $now->year],
            'yearly' => [$now->copy()->startOfYear(), $now->copy()->endOfYear(), (string) $now->year],
            default => [$now->copy()->startOfMonth(), $now->copy()->endOfMonth(), $now->format('F Y')],
        };
    }

    public function veterinary(Request $request)
    {
        $appointments = $this->appointmentsBase($request);
        $completed = (clone $appointments)->where('status', 'completed')->count();
        $total = (clone $appointments)->count();
        $serviceBreakdown = $this->serviceBreakdown($request);
        $confinements = $this->medicalConfinementsBase($request);

        $message = null;
        if ($appointments->count() === 0 && $confinements->count() === 0) {
            $message = 'No records found for selected date range.';
        }

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'completed_appointments' => $completed,
                    'scheduled_appointments' => (clone $appointments)->whereIn('status', ['approved', 'scheduled'])->count(),
                    'cancelled_appointments' => (clone $appointments)->where('status', 'cancelled')->count(),
                    'no_show_appointments' => (clone $appointments)->where('status', 'no_show')->count(),
                    'services_tracked' => count($serviceBreakdown),
                    'medical_confinements' => (clone $confinements)->count(),
                    'pets_under_observation' => (clone $confinements)->whereIn('status', ['admitted', 'under_observation', 'under_treatment'])->count(),
                    'ready_for_discharge' => (clone $confinements)->where('status', 'ready_for_discharge')->count(),
                    'medical_progress_notes' => $this->tableExists('medical_progress_notes') ? $this->dateRange(DB::table('medical_progress_notes'), $request)->count() : 0,
                    'total_revenue' => (float) (clone $appointments)->where('status', 'completed')->sum('price'),
                    'completion_rate' => $total > 0 ? round(($completed / $total) * 100, 2) : 0,
                ],
                'appointments' => $this->appointmentRows($request),
                'medical_confinements' => (clone $confinements)->latest('created_at')->limit(250)->get(),
                'service_breakdown' => $serviceBreakdown,
                'monthly_revenue' => (float) (clone $appointments)->where('status', 'completed')->sum('price'),
                'monthly_completed' => $completed,
                'period' => $this->periodLabel($request),
            ],
            'charts' => [
                'trend' => $this->dailyTrend($this->appointmentRows($request), 'scheduled_at', 'price'),
            ],
            'message' => $message,
        ]);
    }

    public function customers(Request $request)
    {
        $customers = $this->customersBase($request);
        $customerUsers = $this->customerUsersBase($request);

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'total_customers' => (clone $customers)->count() + (clone $customerUsers)->count(),
                    'new_customers' => (clone $customers)->where('created_at', '>=', now()->subMonth())->count()
                        + (clone $customerUsers)->where('created_at', '>=', now()->subMonth())->count(),
                    'active_customers' => $this->activeCustomerCount($request),
                    'total_bookings' => $this->appointmentsBase($request)->count(),
                    'total_orders' => $this->customerOrdersBase($request)->count(),
                    'grooming_sessions' => $this->serviceRequestCount($request, 'grooming'),
                    'vet_appointments' => $this->appointmentsBase($request)->count(),
                    'hotel_bookings' => $this->serviceRequestCount($request, 'hotel'),
                    'customer_spending' => (float) $this->customerOrdersBase($request)->where('payment_status', 'paid')->sum('total_amount'),
                ],
                'customers' => (clone $customers)->latest('created_at')->limit(250)->get(),
                'orders' => $this->customerOrdersBase($request)->latest('created_at')->limit(250)->get(),
            ],
        ]);
    }

    public function reception(Request $request)
    {
        $serviceRequests = $this->serviceRequestsBase($request)->latest('created_at')->limit(250)->get();
        $customerOrders = $this->customerOrdersBase($request)->latest('created_at')->limit(250)->get();

        $message = null;
        if ($serviceRequests->isEmpty() && $customerOrders->isEmpty()) {
            $message = 'No records found for selected date range.';
        }

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'pending_requests' => $this->serviceRequestsBase($request)->where('status', 'pending')->count()
                        + $this->customerOrdersBase($request)->where('status', 'pending')->count(),
                    'approved_requests' => $this->serviceRequestsBase($request)->whereIn('status', ['approved', 'scheduled'])->count()
                        + $this->customerOrdersBase($request)->where('status', 'approved')->count(),
                    'rejected_requests' => $this->serviceRequestsBase($request)->where('status', 'rejected')->count()
                        + $this->customerOrdersBase($request)->where('status', 'rejected')->count(),
                    'scheduled_services' => $this->appointmentsBase($request)->whereIn('status', ['approved', 'scheduled'])->count(),
                    'bookings_handled' => $this->appointmentsBase($request)->count() + $this->serviceRequestsBase($request)->count(),
                    'orders_approved' => $this->customerOrdersBase($request)->where('status', 'approved')->count(),
                ],
                'requests' => $serviceRequests,
                'orders' => $customerOrders,
                'requests_per_day' => $this->requestsPerDay($request),
                'receptionist_activity' => $this->recentActions($request, ['order', 'service_request', 'appointment']),
            ],
            'message' => $message,
        ]);
    }

    public function systemHealth(Request $request)
    {
        $usersByRole = $this->dateRange(DB::table('users'), $request, 'users.created_at')
            ->select('role', DB::raw('COUNT(*) as total'))
            ->groupBy('role')
            ->orderBy('role')
            ->get();
        $recentActions = collect($this->recentActions($request));
        $notifications = collect();
        $unreadNotifications = 0;

        if ($this->tableExists('notifications')) {
            $notificationQuery = $this->dateRange(DB::table('notifications'), $request, 'notifications.created_at');
            $notifications = $notificationQuery
                ->select([
                    'id',
                    DB::raw($this->firstAvailableColumn('notifications', ['type'], '"notification"') . ' as type'),
                    DB::raw($this->firstAvailableColumn('notifications', ['title', 'subject'], '"Notification"') . ' as title'),
                    DB::raw($this->firstAvailableColumn('notifications', ['message', 'body'], 'NULL') . ' as message'),
                    DB::raw($this->firstAvailableColumn('notifications', ['read_at'], 'NULL') . ' as read_at'),
                    'created_at',
                ])
                ->latest('notifications.created_at')
                ->limit(100)
                ->get();

            if (Schema::hasColumn('notifications', 'read_at')) {
                $unreadNotifications = (int) DB::table('notifications')->whereNull('read_at')->count();
            }
        }

        $summary = [
            'total_users' => (int) User::count(),
            'admin_users' => (int) User::where('role', 'admin')->count(),
            'roles_tracked' => $usersByRole->count(),
            'audit_logs' => $recentActions->count(),
            'notifications' => $notifications->count(),
            'unread_notifications' => $unreadNotifications,
        ];

        $table = $recentActions->isNotEmpty()
            ? $recentActions
            : $notifications->map(fn ($notification) => [
                'id' => $notification->id,
                'action' => $notification->title,
                'description' => $notification->message,
                'role' => $notification->type,
                'created_at' => $notification->created_at,
            ])->values();

        return response()->json([
            'success' => true,
            'section' => 'system-health',
            'last_updated' => now()->format('Y-m-d H:i:s'),
            'summary' => $summary,
            'charts' => [
                'users_by_role' => $usersByRole,
            ],
            'table' => $table,
            'data' => [
                'summary' => $summary,
                'users_by_role' => $usersByRole,
                'audit_logs' => $recentActions,
                'notifications' => $notifications,
            ],
            'filters' => $this->activeFilters($request),
            'message' => null,
        ]);
    }

    public function payments(Request $request)
    {
        $payments = collect();

        if ($this->tableExists('payments')) {
            $query = $this->dateRange(DB::table('payments'), $request, 'payments.created_at')
                ->leftJoin('sales', 'sales.id', '=', 'payments.sale_id')
                ->select([
                    'payments.id',
                    'payments.payment_number',
                    DB::raw($this->columnSelect('payments', 'payment_method', 'payments.method', 'payment_method')),
                    'payments.reference_number',
                    'payments.amount',
                    'payments.status',
                    'payments.paid_at',
                    'payments.created_at',
                    DB::raw('"Walk-in" as customer_name'),
                    DB::raw('sales.transaction_number as associated_record'),
                    DB::raw('"sale" as association_type'),
                ]);

            $this->applyExactFilter($query, $request, 'status', 'payments.status');
            $this->applyExactFilter($query, $request, 'payment_status', 'payments.status');

            $payments = $payments->concat($query->latest('payments.created_at')->limit(500)->get());
        }

        if ($this->tableExists('customer_orders')) {
            $orderQuery = $this->dateRange(DB::table('customer_orders'), $request, 'customer_orders.created_at');
            $paymentStatus = $request->query('payment_status') ?: $request->query('status');
            if ($paymentStatus && $paymentStatus !== 'all') {
                $orderQuery->where('customer_orders.payment_status', $paymentStatus);
            }
            $search = trim((string) $request->query('search', ''));
            if ($search !== '') {
                $orderQuery->where(function ($nested) use ($search) {
                    foreach (['customer_name', 'customer_email', 'receipt_number', 'payment_reference'] as $column) {
                        if (Schema::hasColumn('customer_orders', $column)) {
                            $nested->orWhere("customer_orders.$column", 'like', "%$search%");
                        }
                    }
                });
            }

            $orders = $orderQuery
                ->select([
                    'customer_orders.id',
                    DB::raw('CONCAT("ORDER-", customer_orders.id) as payment_number'),
                    'customer_orders.payment_method',
                    'customer_orders.payment_reference as reference_number',
                    'customer_orders.total_amount as amount',
                    'customer_orders.payment_status as status',
                    'customer_orders.paid_at',
                    'customer_orders.created_at',
                    DB::raw('COALESCE(customer_orders.customer_name, customer_orders.customer_email, CONCAT("Customer #", customer_orders.customer_id)) as customer_name'),
                    DB::raw('CONCAT("Order #", customer_orders.id) as associated_record'),
                    DB::raw('"order" as association_type'),
                ])
                ->latest('customer_orders.created_at')
                ->limit(500)
                ->get();
            $payments = $payments->concat($orders);
        }

        if ($this->tableExists('service_requests')) {
            $requestQuery = $this->dateRange(DB::table('service_requests'), $request, 'service_requests.created_at');
            $paymentStatus = $request->query('payment_status') ?: $request->query('status');
            if ($paymentStatus && $paymentStatus !== 'all' && Schema::hasColumn('service_requests', 'payment_status')) {
                $requestQuery->where('service_requests.payment_status', $paymentStatus);
            }
            $search = trim((string) $request->query('search', ''));
            if ($search !== '') {
                $requestQuery->where(function ($nested) use ($search) {
                    foreach (['customer_name', 'customer_email', 'pet_name', 'service_name'] as $column) {
                        if (Schema::hasColumn('service_requests', $column)) {
                            $nested->orWhere("service_requests.$column", 'like', "%$search%");
                        }
                    }
                });
            }

            $requests = $requestQuery
                ->select([
                    'service_requests.id',
                    DB::raw('CONCAT("SERVICE-", service_requests.id) as payment_number'),
                    'service_requests.payment_method',
                    'service_requests.payment_reference as reference_number',
                    DB::raw($this->firstAvailableColumn('service_requests', ['total_amount', 'price', 'service_price'], '0') . ' as amount'),
                    'service_requests.payment_status as status',
                    'service_requests.paid_at',
                    'service_requests.created_at',
                    DB::raw('COALESCE(service_requests.customer_name, service_requests.customer_email, "Customer") as customer_name'),
                    DB::raw('COALESCE(service_requests.service_name, service_requests.service_type, service_requests.request_type, CONCAT("Service #", service_requests.id)) as associated_record'),
                    DB::raw('"service_request" as association_type'),
                ])
                ->latest('service_requests.created_at')
                ->limit(500)
                ->get();
            $payments = $payments->concat($requests);
        }

        $payments = $payments
            ->concat($this->paymentRowsFromTable($request, 'boardings', 'boarding', 'Boarding'))
            ->concat($this->paymentRowsFromTable($request, 'medical_confinements', 'medical_confinement', 'Medical Confinement'));

        $payments = $payments->sortByDesc('created_at')->values();

        return response()->json([
            'success' => true,
            'summary' => [
                'total_payments' => $payments->count(),
                'total_amount' => (float) $payments->sum(fn ($payment) => (float) $payment->amount),
                'paid' => $payments->whereIn('status', ['paid', 'completed', 'verified'])->count(),
                'pending' => $payments->where('status', 'pending')->count(),
                'rejected' => $payments->where('status', 'rejected')->count(),
            ],
            'data' => [
                'summary' => [
                    'total_payments' => $payments->count(),
                    'total_amount' => (float) $payments->sum(fn ($payment) => (float) $payment->amount),
                    'paid' => $payments->whereIn('status', ['paid', 'completed', 'verified'])->count(),
                    'pending' => $payments->where('status', 'pending')->count(),
                    'rejected' => $payments->where('status', 'rejected')->count(),
                ],
                'payments' => $payments,
                'generated_at' => now()->toIso8601String(),
            ],
            'charts' => [
                'trend' => $this->dailyTrend($payments),
                'payment_methods' => $payments->groupBy(fn ($payment) => $payment->payment_method ?: 'Unspecified')
                    ->map(fn ($group, $method) => ['method' => $method, 'count' => $group->count(), 'amount' => (float) $group->sum('amount')])
                    ->values(),
            ],
            'filters' => $this->activeFilters($request),
            'message' => null,
        ]);
    }

    public function orders(Request $request)
    {
        $orders = $this->customerOrdersBase($request)
            ->select([
                'customer_orders.*',
                DB::raw('COALESCE(customer_orders.customer_name, customer_orders.customer_email, CONCAT("Customer #", customer_orders.customer_id)) as customer_display'),
                DB::raw('DATE(customer_orders.created_at) as date'),
                DB::raw('"store" as order_source'),
            ])
            ->latest('customer_orders.created_at')
            ->limit(500)
            ->get();

        // POS sales are orders too — merge them so walk-in sales appear here
        if ($this->tableExists('sales')) {
            $posSales = $this->dateRange(DB::table('sales'), $request, 'sales.created_at')
                ->leftJoin('customers', 'customers.id', '=', 'sales.customer_id')
                ->select([
                    'sales.id',
                    'sales.customer_id',
                    DB::raw('COALESCE(sales.transaction_number, CONCAT("POS-", sales.id)) as receipt_number'),
                    'sales.type as order_type',
                    'sales.status',
                    DB::raw('CASE WHEN sales.status IN ("completed","paid") THEN "paid" WHEN sales.status = "voided" THEN "voided" ELSE "unpaid" END as payment_status'),
                    DB::raw($this->firstAvailableColumn('sales', ['payment_method', 'payment_type'], '"cash"') . ' as payment_method'),
                    'sales.total_amount',
                    'sales.subtotal',
                    'sales.tax_amount',
                    'sales.discount_amount',
                    'sales.created_at',
                    'sales.updated_at',
                    DB::raw('COALESCE(customers.name, "Walk-in") as customer_display'),
                    DB::raw('DATE(sales.created_at) as date'),
                    DB::raw('"pos" as order_source'),
                ])
                ->latest('sales.created_at')
                ->limit(500)
                ->get();

            $orders = $orders->concat($posSales);
        }

        $orders = $orders->sortByDesc('created_at')->values();

        // Real revenue trend grouped by order date
        $trend = $orders->groupBy('date')->map(fn ($group, $date) => [
            'date' => $date,
            'revenue' => (float) $group->sum(fn ($order) => (float) ($order->total_amount ?? 0)),
            'orders' => $group->count(),
        ])->sortKeys()->values();

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'total_orders' => $orders->count(),
                    'completed_orders' => $orders->whereIn('status', ['completed', 'approved'])->count(),
                    'pending_orders' => $orders->where('status', 'pending')->count(),
                    'cancelled_orders' => $orders->whereIn('status', ['cancelled', 'rejected'])->count(),
                    'total_revenue' => (float) $orders->whereIn('payment_status', ['paid', 'completed', 'verified'])->sum('total_amount'),
                ],
                'orders' => $orders,
                'trend' => $trend,
                'generated_at' => now()->toIso8601String(),
            ],
        ]);
    }

    public function serviceRequests(Request $request)
    {
        $requests = collect();

        if ($this->tableExists('service_requests')) {
            $requests = $requests->concat($this->serviceRequestsBase($request)
                ->select([
                    'service_requests.id',
                    DB::raw('COALESCE(service_requests.service_type, service_requests.request_type, "service") as service_type'),
                    DB::raw('COALESCE(service_requests.service_name, service_requests.service_type, service_requests.request_type, "Service Request") as service_name'),
                    'service_requests.customer_name',
                    'service_requests.customer_email',
                    'service_requests.pet_name',
                    'service_requests.status',
                    'service_requests.payment_status',
                    'service_requests.created_at',
                    DB::raw($this->firstAvailableColumn('service_requests', ['total_amount', 'price', 'service_price'], '0') . ' as amount'),
                    DB::raw('"service_request" as source'),
                ])
                ->latest('service_requests.created_at')
                ->limit(500)
                ->get());
        }

        if ($this->tableExists('appointments')) {
            $appointments = $this->appointmentsBase($request)
                ->leftJoin('services', 'services.id', '=', 'appointments.service_id')
                ->leftJoin('customers', 'customers.id', '=', 'appointments.customer_id')
                ->leftJoin('pets', 'pets.id', '=', 'appointments.pet_id')
                ->select([
                    'appointments.id',
                    DB::raw('COALESCE(services.category, "vet") as service_type'),
                    DB::raw('COALESCE(services.name, "Veterinary Appointment") as service_name'),
                    DB::raw('customers.name as customer_name'),
                    DB::raw('customers.email as customer_email'),
                    DB::raw('pets.name as pet_name'),
                    'appointments.status',
                    DB::raw('NULL as payment_status'),
                    'appointments.created_at',
                    DB::raw($this->firstAvailableColumn('appointments', ['price', 'amount', 'total_amount'], '0') . ' as amount'),
                    DB::raw('"appointment" as source'),
                ])
                ->latest('appointments.created_at')
                ->limit(500)
                ->get();
            $requests = $requests->concat($appointments);
        }

        if ($this->tableExists('boardings')) {
            $boardings = $this->dateRange(DB::table('boardings'), $request, 'boardings.created_at')
                ->leftJoin('pets', 'pets.id', '=', 'boardings.pet_id')
                ->leftJoin('customers', 'customers.id', '=', 'pets.customer_id')
                ->select([
                    'boardings.id',
                    DB::raw('"hotel" as service_type'),
                    DB::raw('"Pet Hotel Boarding" as service_name'),
                    DB::raw('customers.name as customer_name'),
                    DB::raw('customers.email as customer_email'),
                    DB::raw('pets.name as pet_name'),
                    'boardings.status',
                    DB::raw($this->columnSelect('boardings', 'payment_status', 'NULL', 'payment_status')),
                    'boardings.created_at',
                    DB::raw($this->firstAvailableColumn('boardings', ['total_amount', 'amount', 'price'], '0') . ' as amount'),
                    DB::raw('"boarding" as source'),
                ])
                ->latest('boardings.created_at')
                ->limit(500)
                ->get();
            $requests = $requests->concat($boardings);
        }

        if ($this->tableExists('medical_confinements')) {
            $confinements = $this->medicalConfinementsBase($request)
                ->select([
                    'medical_confinements.id',
                    DB::raw('"medical_confinement" as service_type'),
                    DB::raw('"Medical Confinement" as service_name'),
                    'medical_confinements.customer_name',
                    'medical_confinements.customer_email',
                    'medical_confinements.pet_name',
                    'medical_confinements.status',
                    'medical_confinements.payment_status',
                    'medical_confinements.created_at',
                    DB::raw($this->firstAvailableColumn('medical_confinements', ['total_amount', 'amount', 'price'], '0') . ' as amount'),
                    DB::raw('"medical_confinement" as source'),
                ])
                ->latest('medical_confinements.created_at')
                ->limit(500)
                ->get();
            $requests = $requests->concat($confinements);
        }

        $requests = $requests->sortByDesc('created_at')->values();

        return response()->json([
            'success' => true,
            'summary' => [
                'total_requests' => $requests->count(),
                'pending' => $requests->whereIn('status', ['pending', 'recommended'])->count(),
                'completed' => $requests->whereIn('status', ['completed', 'checked_out', 'discharged'])->count(),
                'cancelled' => $requests->whereIn('status', ['cancelled', 'rejected'])->count(),
                'in_progress' => $requests->whereIn('status', ['approved', 'scheduled', 'confirmed', 'checked_in', 'in_care', 'admitted', 'under_observation', 'under_treatment'])->count(),
            ],
            'data' => [
                'summary' => [
                    'total_requests' => $requests->count(),
                    'pending' => $requests->whereIn('status', ['pending', 'recommended'])->count(),
                    'completed' => $requests->whereIn('status', ['completed', 'checked_out', 'discharged'])->count(),
                    'cancelled' => $requests->whereIn('status', ['cancelled', 'rejected'])->count(),
                    'in_progress' => $requests->whereIn('status', ['approved', 'scheduled', 'confirmed', 'checked_in', 'in_care', 'admitted', 'under_observation', 'under_treatment'])->count(),
                ],
                'requests' => $requests,
                'generated_at' => now()->toIso8601String(),
            ],
            'charts' => [
                'trend' => $this->dailyTrend($requests),
                'service_types' => $requests->groupBy('service_type')
                    ->map(fn ($group, $type) => ['type' => $type ?: 'unknown', 'count' => $group->count()])
                    ->values(),
            ],
            'filters' => $this->activeFilters($request),
            'message' => null,
        ]);
    }

    public function logistics(Request $request)
    {
        $candidateTables = ['shipments', 'deliveries', 'logistics'];
        $table = collect($candidateTables)->first(fn ($candidate) => $this->tableExists($candidate));
        $shipments = collect();

        if ($table) {
            $query = $this->dateRange(DB::table($table), $request, "$table.created_at");
            $this->applyExactFilter($query, $request, 'status', "$table.status");
            $shipments = $query->latest("$table.created_at")->limit(500)->get();
        }

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'total_shipments' => $shipments->count(),
                    'delayed_shipments' => $shipments->whereIn('status', ['delayed', 'late'])->count(),
                    'completed_deliveries' => $shipments->whereIn('status', ['delivered', 'completed'])->count(),
                    'returned_shipments' => $shipments->whereIn('status', ['returned', 'return'])->count(),
                    'source_table' => $table,
                ],
                'shipments' => $shipments,
                'generated_at' => now()->toIso8601String(),
            ],
        ]);
    }

    private function overviewMetrics(Request $request): array
    {
        $orders = $this->customerOrdersBase($request);
        $boardingPayments = $this->paymentRowsFromTable($request, 'boardings', 'boarding', 'Boarding');
        $confinementPayments = $this->paymentRowsFromTable($request, 'medical_confinements', 'medical_confinement', 'Medical Confinement');
        $serviceRequests = $this->serviceRequestsBase($request);
        $appointments = $this->appointmentsBase($request);
        $boardings = $this->boardingsBase($request);
        $confinements = $this->medicalConfinementsBase($request);

        return [
            'total_customers' => Customer::count(),
            'total_users' => User::count(),
            'active_customers' => $this->activeCustomerCount($request),
            'total_orders' => (clone $orders)->count(),
            'total_services' => (clone $serviceRequests)->count() + (clone $appointments)->count() + (clone $boardings)->count() + (clone $confinements)->count(),
            'total_payments' => $this->paymentRows($request)->count(),
            'total_revenue' => $this->unifiedRevenue($request),
            'pending_approvals' => $this->customerOrdersBase($request)->where('status', 'pending')->count()
                + $this->serviceRequestsBase($request)->where('status', 'pending')->count()
                + $this->boardingsBase($request)->where('status', 'pending')->count()
                + $this->medicalConfinementsBase($request)->where('status', 'recommended')->count(),
            'pending_payments' => $this->customerOrdersBase($request)->where('payment_status', 'pending')->count()
                + ($this->tableExists('payments') ? $this->dateRange(DB::table('payments')->where('status', 'pending'), $request)->count() : 0)
                + $boardingPayments->where('payment_status', 'pending')->count()
                + $confinementPayments->where('payment_status', 'pending')->count(),
            'low_stock_items' => $this->lowStockCount($request),
            'completed_services' => $this->appointmentsBase($request)->where('status', 'completed')->count()
                + $this->serviceRequestsBase($request)->where('status', 'completed')->count()
                + $this->boardingsBase($request)->whereIn('status', ['completed', 'checked_out'])->count()
                + $this->medicalConfinementsBase($request)->whereIn('status', ['completed', 'discharged'])->count(),
            'active_appointments' => $this->appointmentsBase($request)->whereIn('status', ['approved', 'scheduled', 'in_consultation', 'in_progress'])->count(),
            'active_boarding_stays' => $this->boardingsBase($request)->whereIn('status', ['checked_in', 'in_care'])->count(),
            'active_medical_confinements' => $this->medicalConfinementsBase($request)->whereIn('status', ['admitted', 'under_observation', 'under_treatment'])->count(),
            'approved_orders' => $this->customerOrdersBase($request)->where('status', 'approved')->count(),
            'paid_orders' => $this->customerOrdersBase($request)->where('payment_status', 'paid')->count(),
            'rejected_orders' => $this->customerOrdersBase($request)->where('status', 'rejected')->count(),
        ];
    }

    /**
     * Total revenue across every paid source for the request's date range.
     */
    private function unifiedRevenue(Request $request): float
    {
        $from = $request->query('from') ?: $request->query('start_date') ?: $request->query('startDate');
        $to = $request->query('to') ?: $request->query('end_date') ?: $request->query('endDate');
        $datePattern = '/^\d{4}-\d{2}-\d{2}$/';

        return (new RevenueService())->total(
            $from && preg_match($datePattern, $from) ? Carbon::parse($from) : null,
            $to && preg_match($datePattern, $to) ? Carbon::parse($to) : null
        );
    }

    private function activeFilters(Request $request): array
    {
        return [
            'from' => $request->query('from') ?: $request->query('start_date'),
            'to' => $request->query('to') ?: $request->query('end_date'),
            'status' => $request->query('status', 'all'),
            'payment_status' => $request->query('payment_status', 'all'),
            'search' => $request->query('search'),
        ];
    }

    private function paymentRows(Request $request)
    {
        return collect()
            ->concat($this->paymentRowsFromTable($request, 'customer_orders', 'order', 'Order'))
            ->concat($this->paymentRowsFromTable($request, 'service_requests', 'service_request', 'Service Request'))
            ->concat($this->paymentRowsFromTable($request, 'boardings', 'boarding', 'Boarding'))
            ->concat($this->paymentRowsFromTable($request, 'medical_confinements', 'medical_confinement', 'Medical Confinement'));
    }

    private function paymentRowsFromTable(Request $request, string $table, string $source, string $label)
    {
        if (!$this->tableExists($table)) {
            return collect();
        }

        $query = $this->dateRange(DB::table($table), $request, "$table.created_at");

        $paymentStatus = $request->query('payment_status') ?: $request->query('status');
        if ($paymentStatus && $paymentStatus !== 'all' && Schema::hasColumn($table, 'payment_status')) {
            $query->where("$table.payment_status", $paymentStatus);
        }

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($nested) use ($search, $table) {
                foreach (['customer_name', 'customer_email', 'pet_name', 'receipt_number', 'payment_reference'] as $column) {
                    if (Schema::hasColumn($table, $column)) {
                        $nested->orWhere("$table.$column", 'like', "%$search%");
                    }
                }
            });
        }

        $amountColumn = match ($table) {
            'customer_orders' => Schema::hasColumn($table, 'total_amount') ? "$table.total_amount" : '0',
            'service_requests' => $this->firstAvailableColumn($table, ['total_amount', 'price', 'service_price'], '0'),
            'medical_confinements' => $this->firstAvailableColumn($table, ['final_amount', 'estimated_cost', 'total_amount'], '0'),
            default => $this->firstAvailableColumn($table, ['total_amount', 'price', 'estimated_cost'], '0'),
        };
        $customerExpression = $this->firstAvailableColumn($table, ['customer_name', 'customer_email'], '"Customer"');

        return $query
            ->select([
                "$table.id",
                DB::raw('CONCAT("' . strtoupper($source) . '-", ' . $table . '.id) as payment_number'),
                DB::raw($customerExpression . ' as customer_name'),
                DB::raw('"' . $source . '" as source'),
                DB::raw($amountColumn . ' as amount'),
                DB::raw($this->columnSelect($table, 'payment_status', '"unpaid"', 'payment_status')),
                DB::raw($this->columnSelect($table, 'payment_status', '"unpaid"', 'status')),
                DB::raw($this->columnSelect($table, 'payment_method', 'NULL', 'payment_method')),
                DB::raw($this->columnSelect($table, 'payment_reference', 'NULL', 'reference_number')),
                DB::raw($this->columnSelect($table, 'receipt_number', 'NULL', 'receipt_number')),
                DB::raw($this->columnSelect($table, 'payment_proof', 'NULL', 'payment_proof')),
                DB::raw($this->columnSelect($table, 'cashier_remarks', 'NULL', 'cashier_remarks')),
                DB::raw($this->columnSelect($table, 'paid_at', 'NULL', 'paid_at')),
                "$table.created_at",
                DB::raw('CONCAT("' . $label . ' #", ' . $table . '.id) as associated_record'),
                DB::raw('"' . $source . '" as association_type'),
            ])
            ->latest("$table.created_at")
            ->limit(500)
            ->get();
    }

    private function boardingsBase(Request $request): Builder
    {
        if (!$this->tableExists('boardings')) {
            return DB::query()->fromSub('select null as id where 1 = 0', 'boardings');
        }

        $query = DB::table('boardings');
        $this->applyDateRange($query, $request, 'boardings.created_at');
        $this->applyExactFilter($query, $request, 'status', 'boardings.status');

        return $query;
    }

    private function medicalConfinementsBase(Request $request): Builder
    {
        if (!$this->tableExists('medical_confinements')) {
            return DB::query()->fromSub('select null as id where 1 = 0', 'medical_confinements');
        }

        $query = DB::table('medical_confinements');
        $this->applyDateRange($query, $request, 'medical_confinements.created_at');
        $this->applyExactFilter($query, $request, 'status', 'medical_confinements.status');

        return $query;
    }

    private function lowStockAlerts(Request $request)
    {
        if (!$this->tableExists('inventory_items')) {
            return collect();
        }

        $query = $this->inventoryItemsBase($request)->whereNull('archived_at')->where('stock', '>', 0);

        if (Schema::hasColumn('inventory_items', 'reorder_level')) {
            $query->whereRaw('stock <= reorder_level');
        } elseif (Schema::hasColumn('inventory_items', 'minimum_stock_level')) {
            $query->whereColumn('stock', '<=', 'minimum_stock_level');
        } else {
            $query->where('stock', '<=', 10);
        }

        return $query->latest('updated_at')->limit(25)->get();
    }

    private function pendingOperations(Request $request)
    {
        return collect()
            ->concat($this->customerOrdersBase($request)->where('status', 'pending')->select([
                'customer_orders.id',
                DB::raw('"order" as type'),
                DB::raw('COALESCE(customer_orders.customer_name, customer_orders.customer_email, "Customer") as customer_name'),
                'customer_orders.status',
                'customer_orders.created_at',
            ])->limit(50)->get())
            ->concat($this->serviceRequestsBase($request)->where('status', 'pending')->select([
                'service_requests.id',
                DB::raw('"service_request" as type'),
                DB::raw('COALESCE(service_requests.customer_name, service_requests.customer_email, "Customer") as customer_name'),
                'service_requests.status',
                'service_requests.created_at',
            ])->limit(50)->get())
            ->concat($this->boardingsBase($request)->where('status', 'pending')->select([
                'boardings.id',
                DB::raw('"boarding" as type'),
                DB::raw($this->columnSelect('boardings', 'customer_name', '"Customer"', 'customer_name')),
                'boardings.status',
                'boardings.created_at',
            ])->limit(50)->get())
            ->concat($this->medicalConfinementsBase($request)->where('status', 'recommended')->select([
                'medical_confinements.id',
                DB::raw('"medical_confinement" as type'),
                DB::raw($this->columnSelect('medical_confinements', 'customer_name', '"Customer"', 'customer_name')),
                'medical_confinements.status',
                'medical_confinements.created_at',
            ])->limit(50)->get())
            ->sortByDesc('created_at')
            ->values();
    }

    private function customerOrdersBase(Request $request): Builder
    {
        if (!$this->tableExists('customer_orders')) {
            return DB::query()->fromSub('select null as id where 1 = 0', 'customer_orders');
        }

        $query = DB::table('customer_orders');
        $this->applyDateRange($query, $request, 'customer_orders.created_at');
        $this->applyExactFilter($query, $request, 'status', 'customer_orders.status');
        $this->applyExactFilter($query, $request, 'payment_status', 'customer_orders.payment_status');

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($nested) use ($search) {
                foreach (['customer_name', 'customer_email', 'receipt_number', 'payment_reference'] as $column) {
                    if (Schema::hasColumn('customer_orders', $column)) {
                        $nested->orWhere("customer_orders.$column", 'like', "%$search%");
                    }
                }
            });
        }

        return $query;
    }

    private function serviceRequestsBase(Request $request): Builder
    {
        if (!$this->tableExists('service_requests')) {
            return DB::query()->fromSub('select null as id where 1 = 0', 'service_requests');
        }

        $query = DB::table('service_requests');
        $this->applyDateRange($query, $request, 'service_requests.created_at');
        $this->applyExactFilter($query, $request, 'status', 'service_requests.status');

        $type = $request->query('type');
        if ($type && $type !== 'all') {
            $query->where(function ($nested) use ($type) {
                if (Schema::hasColumn('service_requests', 'request_type')) {
                    $nested->orWhere('request_type', $type);
                }
                if (Schema::hasColumn('service_requests', 'service_type')) {
                    $nested->orWhere('service_type', $type);
                }
            });
        }

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($nested) use ($search) {
                foreach (['customer_name', 'customer_email', 'pet_name', 'service_name'] as $column) {
                    if (Schema::hasColumn('service_requests', $column)) {
                        $nested->orWhere($column, 'like', "%$search%");
                    }
                }
            });
        }

        return $query;
    }

    private function appointmentsBase(Request $request): Builder
    {
        $query = DB::table('appointments');
        $this->applyDateRange($query, $request, 'appointments.created_at');
        $this->applyExactFilter($query, $request, 'status', 'appointments.status');

        return $query;
    }

    private function inventoryItemsBase(Request $request): Builder
    {
        $query = DB::table('inventory_items');
        $this->applyDateRange($query, $request, 'inventory_items.created_at');

        $category = $request->query('category');
        if ($category && $category !== 'all' && Schema::hasColumn('inventory_items', 'category')) {
            $query->where('category', $category);
        }

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($nested) use ($search) {
                foreach (['name', 'sku', 'brand', 'supplier'] as $column) {
                    if (Schema::hasColumn('inventory_items', $column)) {
                        $nested->orWhere($column, 'like', "%$search%");
                    }
                }
            });
        }

        return $query;
    }

    private function inventoryLogsBase(Request $request): Builder
    {
        $query = DB::table('inventory_logs');
        $this->applyDateRange($query, $request, 'inventory_logs.created_at');

        $type = $request->query('type') ?: $request->query('status');
        if ($type && $type !== 'all') {
            $query->where(function ($nested) use ($type) {
                foreach (['movement_type', 'type', 'reason'] as $column) {
                    if (Schema::hasColumn('inventory_logs', $column)) {
                        $nested->orWhere("inventory_logs.$column", 'like', "%$type%");
                    }
                }
            });
        }

        return $query;
    }

    private function customersBase(Request $request): Builder
    {
        $query = DB::table('customers');
        $this->applyDateRange($query, $request, 'customers.created_at');

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($nested) use ($search) {
                foreach (['name', 'email', 'phone'] as $column) {
                    if (Schema::hasColumn('customers', $column)) {
                        $nested->orWhere($column, 'like', "%$search%");
                    }
                }
            });
        }

        return $query;
    }

    private function customerUsersBase(Request $request): Builder
    {
        $query = DB::table('users')->where('role', 'customer');
        $this->applyDateRange($query, $request, 'users.created_at');

        return $query;
    }

    private function salesRows(Request $request)
    {
        return $this->dateRange(DB::table('sales'), $request)
            ->latest('created_at')
            ->limit(250)
            ->get();
    }

    private function overviewTransactions(Request $request)
    {
        return $this->dateRange(DB::table('sales'), $request, 'sales.created_at')
            ->select([
                'sales.id',
                DB::raw('COALESCE(sales.transaction_number, CONCAT("SALE-", sales.id)) as transaction_number'),
                DB::raw('"Walk-in" as customer'),
                DB::raw($this->firstAvailableColumn('sales', ['type', 'payment_type', 'payment_method'], '"Sale"') . ' as type'),
                DB::raw($this->firstAvailableColumn('sales', ['amount', 'total_amount'], '0') . ' as amount'),
                DB::raw($this->firstAvailableColumn('sales', ['status'], '"completed"') . ' as status'),
                DB::raw('DATE(sales.created_at) as date'),
                'sales.created_at',
            ])
            ->latest('sales.created_at')
            ->limit(250)
            ->get();
    }

    private function overviewAppointments(Request $request)
    {
        return $this->appointmentsBase($request)
            ->leftJoin('services', 'services.id', '=', 'appointments.service_id')
            ->leftJoin('customers', 'customers.id', '=', 'appointments.customer_id')
            ->leftJoin('pets', 'pets.id', '=', 'appointments.pet_id')
            ->select([
                'appointments.id',
                DB::raw('COALESCE(customers.name, "Unknown Customer") as customer'),
                DB::raw('COALESCE(services.name, "Appointment") as service'),
                DB::raw('COALESCE(pets.name, "Pet") as pet'),
                DB::raw($this->firstAvailableColumn('appointments', ['status'], '"scheduled"') . ' as status'),
                DB::raw($this->firstAvailableColumn('appointments', ['price'], '0') . ' as amount'),
                DB::raw('DATE(COALESCE(appointments.scheduled_at, appointments.created_at)) as date'),
                'appointments.created_at',
            ])
            ->latest('appointments.created_at')
            ->limit(250)
            ->get();
    }

    private function overviewUsers(Request $request)
    {
        return $this->dateRange(DB::table('users'), $request, 'users.created_at')
            ->select([
                'users.id',
                'users.name',
                'users.email',
                'users.role',
                DB::raw($this->firstAvailableColumn('users', ['is_active'], '1') . ' as is_active'),
                DB::raw('DATE(users.created_at) as date'),
                'users.created_at',
            ])
            ->latest('users.created_at')
            ->limit(250)
            ->get();
    }

    private function appointmentRows(Request $request)
    {
        return $this->appointmentsBase($request)
            ->leftJoin('services', 'services.id', '=', 'appointments.service_id')
            ->leftJoin('customers', 'customers.id', '=', 'appointments.customer_id')
            ->leftJoin('pets', 'pets.id', '=', 'appointments.pet_id')
            ->leftJoin('users as vets', 'vets.id', '=', 'appointments.veterinarian_id')
            ->select([
                'appointments.id',
                'appointments.status',
                'appointments.scheduled_at',
                'appointments.completed_at',
                'appointments.price',
                'appointments.notes',
                DB::raw('COALESCE(services.name, "Unknown Service") as service_name'),
                DB::raw('COALESCE(customers.name, "Unknown Customer") as customer_name'),
                DB::raw('COALESCE(pets.name, "Unknown Pet") as pet_name'),
                DB::raw('COALESCE(vets.name, "Unassigned") as veterinarian_name'),
            ])
            ->latest('appointments.created_at')
            ->limit(250)
            ->get();
    }

    private function serviceBreakdown(Request $request): array
    {
        return $this->appointmentsBase($request)
            ->leftJoin('services', 'services.id', '=', 'appointments.service_id')
            ->select([
                DB::raw('COALESCE(services.name, "Unknown Service") as service_name'),
                DB::raw('COUNT(*) as count'),
                DB::raw('SUM(COALESCE(appointments.price, services.price, 0)) as revenue'),
            ])
            ->groupBy('service_name')
            ->orderByDesc('count')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'service' => ['name' => $row->service_name],
                'service_name' => $row->service_name,
                'count' => (int) $row->count,
                'revenue' => (float) $row->revenue,
            ])
            ->all();
    }

    private function fastMovingProducts(Request $request): array
    {
        if (!$this->tableExists('customer_order_items')) {
            return [];
        }

        $query = DB::table('customer_order_items')
            ->join('customer_orders', 'customer_orders.id', '=', 'customer_order_items.customer_order_id')
            ->select([
                'customer_order_items.inventory_item_id',
                DB::raw('MAX(customer_order_items.product_name) as product_name'),
                DB::raw('SUM(customer_order_items.quantity) as quantity_sold'),
                DB::raw('SUM(customer_order_items.subtotal) as revenue'),
            ])
            ->groupBy('customer_order_items.inventory_item_id')
            ->orderByDesc('quantity_sold')
            ->limit(10);

        $this->applyDateRange($query, $request, 'customer_orders.created_at');

        return $query->get()->map(fn ($row) => [
            'inventory_item_id' => $row->inventory_item_id,
            'product_name' => $row->product_name,
            'quantity_sold' => (int) $row->quantity_sold,
            'revenue' => (float) $row->revenue,
        ])->all();
    }

    private function requestsPerDay(Request $request): array
    {
        if (!$this->tableExists('service_requests')) {
            return [];
        }

        $query = $this->serviceRequestsBase($request)
            ->select([
                DB::raw('DATE(created_at) as date'),
                DB::raw('COUNT(*) as total'),
            ])
            ->groupBy('date')
            ->orderBy('date');

        return $query->get()->map(fn ($row) => [
            'date' => $row->date,
            'total' => (int) $row->total,
        ])->all();
    }

    private function recentActions(Request $request, array $keywords = [])
    {
        if (!$this->tableExists('activity_logs')) {
            return [];
        }

        $query = DB::table('activity_logs')
            ->leftJoin('users', 'users.id', '=', 'activity_logs.user_id')
            ->select([
                'activity_logs.id',
                'activity_logs.action',
                'activity_logs.description',
                'activity_logs.created_at',
                DB::raw('COALESCE(users.name, activity_logs.user_id) as performed_by'),
                DB::raw('COALESCE(users.role, "system") as role'),
            ]);

        $this->applyDateRange($query, $request, 'activity_logs.created_at');

        if ($keywords) {
            $query->where(function ($nested) use ($keywords) {
                foreach ($keywords as $keyword) {
                    $nested->orWhere('activity_logs.action', 'like', "%$keyword%")
                        ->orWhere('activity_logs.description', 'like', "%$keyword%");
                }
            });
        }

        return $query->latest('activity_logs.created_at')->limit(50)->get();
    }

    private function lowStockCount(?Request $request = null): int
    {
        $query = DB::table('inventory_items')->whereNull('archived_at');
        if ($request) {
            $this->applyDateRange($query, $request, 'created_at');
        }

        return (int) $query->whereRaw('stock <= reorder_level')->where('stock', '>', 0)->count();
    }

    private function activeCustomerCount(Request $request): int
    {
        $query = $this->customerUsersBase($request);

        if (Schema::hasColumn('users', 'is_active')) {
            $query->where('is_active', true);
        }

        return (int) $query->count();
    }

    private function serviceRequestCount(Request $request, string $type): int
    {
        return $this->serviceRequestsBase($request)->where(function ($nested) use ($type) {
            if (Schema::hasColumn('service_requests', 'request_type')) {
                $nested->orWhere('request_type', $type);
            }
            if (Schema::hasColumn('service_requests', 'service_type')) {
                $nested->orWhere('service_type', $type);
            }
        })->count();
    }

    private function logMovementCount(Request $request, string $movement): int
    {
        $query = $this->inventoryLogsBase($request);

        return (int) $query->where(function ($nested) use ($movement) {
            foreach (['movement_type', 'type', 'reason'] as $column) {
                if (Schema::hasColumn('inventory_logs', $column)) {
                    $nested->orWhere($column, 'like', "%$movement%");
                }
            }

            if ($movement === 'deduct' && Schema::hasColumn('inventory_logs', 'delta')) {
                $nested->orWhere('delta', '<', 0);
            }
            if ($movement === 'restore' && Schema::hasColumn('inventory_logs', 'delta')) {
                $nested->orWhere('delta', '>', 0);
            }
        })->count();
    }

    private function topBrand(Request $request): ?string
    {
        if (!Schema::hasColumn('inventory_items', 'brand')) {
            return null;
        }

        $row = $this->inventoryItemsBase($request)
            ->whereNotNull('brand')
            ->where('brand', '!=', '')
            ->select('brand', DB::raw('COUNT(*) as total'))
            ->groupBy('brand')
            ->orderByDesc('total')
            ->first();

        return $row?->brand;
    }

    private function applyDateRange(Builder $query, Request $request, string $column): void
    {
        $from = $request->query('from') ?: $request->query('start_date') ?: $request->query('startDate');
        $to = $request->query('to') ?: $request->query('end_date') ?: $request->query('endDate');

        // Validate date format (YYYY-MM-DD) before applying filter
        $datePattern = '/^\d{4}-\d{2}-\d{2}$/';

        if ($from && preg_match($datePattern, $from)) {
            try {
                $query->whereDate($column, '>=', $from);
            } catch (\Exception $e) {
                // Skip invalid from date
            }
        }

        if ($to && preg_match($datePattern, $to)) {
            try {
                $query->whereDate($column, '<=', $to);
            } catch (\Exception $e) {
                // Skip invalid to date
            }
        }
    }

    private function dateRange(Builder $query, Request $request, string $column = 'created_at'): Builder
    {
        $this->applyDateRange($query, $request, $column);

        return $query;
    }

    private function applyExactFilter(Builder $query, Request $request, string $param, string $column): void
    {
        $value = $request->query($param);
        if ($value && $value !== 'all') {
            $query->where($column, $value);
        }
    }

    private function columnSelect(string $table, string $preferred, string $fallback, string $alias): string
    {
        if (Schema::hasColumn($table, $preferred)) {
            return "$table.$preferred as $alias";
        }

        return "$fallback as $alias";
    }

    private function firstAvailableColumn(string $table, array $columns, string $fallback): string
    {
        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                return "$table.$column";
            }
        }

        return $fallback;
    }

    private function tableExists(string $table): bool
    {
        return Schema::hasTable($table);
    }

    private function periodLabel(Request $request): string
    {
        $from = $request->query('from');
        $to = $request->query('to');

        if ($from || $to) {
            return trim(($from ?: 'Start') . ' to ' . ($to ?: 'Today'));
        }

        return now()->format('F Y');
    }

    /**
     * Build a per-day trend series from a collection of DB rows.
     */
    private function dailyTrend($rows, string $dateColumn = 'created_at', string $amountColumn = 'amount')
    {
        return collect($rows)
            ->groupBy(function ($row) use ($dateColumn) {
                $raw = $row->{$dateColumn} ?? $row->date ?? $row->created_at ?? null;
                if (!$raw) {
                    return 'unknown';
                }
                try {
                    return Carbon::parse($raw)->format('Y-m-d');
                } catch (\Throwable) {
                    return 'unknown';
                }
            })
            ->filter(fn ($group, $date) => $date !== 'unknown')
            ->map(fn ($group, $date) => [
                'date' => $date,
                'revenue' => (float) $group->sum(fn ($row) => (float) ($row->{$amountColumn} ?? $row->amount ?? $row->total_amount ?? 0)),
                'orders' => $group->count(),
                'count' => $group->count(),
            ])
            ->sortKeys()
            ->values();
    }

    /**
     * Per-weekday seasonality factors (weekday avg / overall avg).
     * $daily: [['date' => 'Y-m-d', 'actual' => float], ...]
     */
    private function weekdayFactors(array $daily): array
    {
        $sums = array_fill(0, 7, 0.0);
        $counts = array_fill(0, 7, 0);

        foreach ($daily as $row) {
            $weekday = Carbon::parse($row['date'])->dayOfWeek;
            $sums[$weekday] += (float) $row['actual'];
            $counts[$weekday]++;
        }

        $n = count($daily);
        $overall = $n > 0 ? array_sum(array_column($daily, 'actual')) / $n : 0;

        $factors = [];
        for ($w = 0; $w < 7; $w++) {
            $avg = $counts[$w] > 0 ? $sums[$w] / $counts[$w] : $overall;
            $factors[$w] = $overall > 0 ? max(0.2, $avg / $overall) : 1.0;
        }

        return $factors;
    }

    /**
     * Forecast future values via least-squares linear trend scaled by
     * day-of-week seasonality, with confidence bounds from residual std dev.
     * $daily: chronological [['date' => 'Y-m-d', 'actual' => float], ...]
     */
    private function forecastSeries(array $daily, int $days): array
    {
        $n = count($daily);
        if ($n === 0) {
            return [];
        }

        $sumX = $n * ($n - 1) / 2;
        $sumY = array_sum(array_column($daily, 'actual'));
        $sumXY = 0;
        $sumX2 = 0;
        foreach ($daily as $i => $row) {
            $sumXY += $i * (float) $row['actual'];
            $sumX2 += $i * $i;
        }
        $denom = $n * $sumX2 - $sumX * $sumX;
        $slope = $denom != 0 ? ($n * $sumXY - $sumX * $sumY) / $denom : 0;
        $intercept = ($sumY - $slope * $sumX) / $n;

        $factors = $this->weekdayFactors($daily);

        $residuals = [];
        foreach ($daily as $i => $row) {
            $w = Carbon::parse($row['date'])->dayOfWeek;
            $residuals[] = $row['actual'] - ($intercept + $slope * $i) * $factors[$w];
        }
        $stdDev = sqrt(array_sum(array_map(fn ($r) => $r * $r, $residuals)) / max(1, $n - 1));

        $forecast = [];
        for ($i = 1; $i <= $days; $i++) {
            $date = Carbon::now()->addDays($i);
            $x = $n - 1 + $i;
            $predicted = max(0, ($intercept + $slope * $x) * $factors[$date->dayOfWeek]);
            $margin = 1.28 * $stdDev * sqrt($i / max(1, $days));

            $forecast[] = [
                'date' => $date->format('Y-m-d'),
                'predicted' => round($predicted, 2),
                'upper_bound' => round($predicted + $margin, 2),
                'lower_bound' => round(max(0, $predicted - $margin), 2),
                'confidence' => round(max(60, 95 - ($i / max(1, $days)) * 25), 1),
            ];
        }

        return $forecast;
    }

    /**
     * Executive Dashboard - Real-time KPIs with ACCURATE data
     */
    public function executiveOverview(Request $request)
    {
        $from = $request->query('from', Carbon::today()->toDateString());
        $to = $request->query('to', Carbon::today()->toDateString());
        $fromDate = Carbon::parse($from)->startOfDay();
        $toDate = Carbon::parse($to)->endOfDay();
        $revenueService = new RevenueService();

        // Revenue counts every paid source (POS, orders, services, boarding, confinement)
        $todayRevenue = $revenueService->total(Carbon::today(), Carbon::today());
        $yesterdayRevenue = $revenueService->total(Carbon::yesterday(), Carbon::yesterday());
        $periodRevenue = $revenueService->total($fromDate, $toDate);

        // Order counts across all revenue sources
        $todayOrders = $revenueService->count(Carbon::today(), Carbon::today());
        $periodOrders = $revenueService->count($fromDate, $toDate);
        
        // Status breakdown - ACCURATE counts from real data
        $statusBreakdown = Sale::whereBetween('created_at', [$fromDate, $toDate])
            ->select('status', DB::raw('COUNT(*) as count'), DB::raw('SUM(amount) as revenue'))
            ->groupBy('status')
            ->get()
            ->mapWithKeys(fn($item) => [$item->status => ['count' => (int)$item->count, 'revenue' => (float)$item->revenue]]);

        // Ensure all statuses are represented
        $allStatuses = ['completed', 'pending', 'processing', 'cancelled', 'refunded'];
        $completeStatusBreakdown = [];
        foreach ($allStatuses as $status) {
            $completeStatusBreakdown[$status] = $statusBreakdown[$status] ?? ['count' => 0, 'revenue' => 0];
        }
        
        // ACCURATE active customers (with orders in last 30 days)
        $activeCustomers = Customer::whereHas('orders', function($q) {
            $q->where('created_at', '>=', Carbon::now()->subDays(30));
        })->count();
        
        // Total customers
        $totalCustomers = Customer::count();
        
        // ACCURATE pending approvals
        $pendingApprovals = DB::table('service_requests')->where('status', 'pending')->count();
        
        // Check if approvals table exists before querying
        if (Schema::hasTable('approvals')) {
            $pendingApprovals += DB::table('approvals')->where('status', 'pending')->count();
        }
        
        // ACCURATE low stock items
        $lowStockItems = InventoryItem::whereRaw('stock <= reorder_level')->count();
        $criticalStockItems = InventoryItem::whereRaw('stock <= reorder_level / 2')->count();

        // Revenue trend (last 30 days, all paid sources)
        $dailyMap = $revenueService->daily(Carbon::now()->subDays(29), Carbon::now());
        $revenueTrend = [];
        for ($i = 29; $i >= 0; $i--) {
            $date = Carbon::now()->subDays($i);
            $day = $dailyMap[$date->format('Y-m-d')] ?? ['revenue' => 0, 'count' => 0];

            $revenueTrend[] = [
                'date' => $date->format('M d'),
                'full_date' => $date->format('Y-m-d'),
                'revenue' => (float) $day['revenue'],
                'orders' => (int) $day['count'],
            ];
        }

        // Calculate period comparison (same period previous days)
        $daysDiff = $fromDate->diffInDays($toDate) + 1;
        $previousPeriodStart = $fromDate->copy()->subDays($daysDiff);
        $previousPeriodEnd = $fromDate->copy()->subDay();

        $previousRevenue = $revenueService->total($previousPeriodStart, $previousPeriodEnd);
        $previousOrders = $revenueService->count($previousPeriodStart, $previousPeriodEnd);

        // Calculate accurate YoY growth if data exists
        $lastYearStart = $fromDate->copy()->subYear();
        $lastYearEnd = $toDate->copy()->subYear();
        $lastYearRevenue = $revenueService->total($lastYearStart, $lastYearEnd);
        $yoyGrowth = $lastYearRevenue > 0 ? round((($periodRevenue - $lastYearRevenue) / $lastYearRevenue) * 100, 1) : 0;

        // Detect anomalies based on ACCURATE data
        $anomalies = [];
        if ($todayRevenue < ($yesterdayRevenue * 0.75) && $yesterdayRevenue > 0) {
            $anomalies[] = [
                'title' => 'Revenue Drop Alert',
                'message' => "Today's revenue (₱" . number_format($todayRevenue, 2) . ") is " . round((1 - ($todayRevenue / $yesterdayRevenue)) * 100) . "% below yesterday (₱" . number_format($yesterdayRevenue, 2) . ")",
                'severity' => 'warning',
                'detected_at' => now()->toIso8601String(),
            ];
        }
        if ($criticalStockItems > 0) {
            $anomalies[] = [
                'title' => 'Critical Stock Alert',
                'message' => $criticalStockItems . ' item(s) at critically low stock levels',
                'severity' => 'critical',
                'detected_at' => now()->toIso8601String(),
            ];
        }
        if ($pendingApprovals > 5) {
            $anomalies[] = [
                'title' => 'Pending Approvals',
                'message' => $pendingApprovals . ' item(s) awaiting approval',
                'severity' => 'info',
                'detected_at' => now()->toIso8601String(),
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'total_revenue' => $periodRevenue,
                    'today_revenue' => $todayRevenue,
                    'yesterday_revenue' => $yesterdayRevenue,
                    'total_orders' => $periodOrders,
                    'today_orders' => $todayOrders,
                    'active_customers' => $activeCustomers,
                    'total_customers' => $totalCustomers,
                    'pending_approvals' => $pendingApprovals,
                    'low_stock_items' => $lowStockItems,
                    'critical_stock_items' => $criticalStockItems,
                ],
                'status_breakdown' => $completeStatusBreakdown,
                'revenue_trend' => $revenueTrend,
                'anomalies' => $anomalies,
                'predictions' => [
                    'next_month_revenue' => (float) array_sum(array_column(
                        $this->forecastSeries(array_map(
                            fn ($d) => ['date' => $d['full_date'], 'actual' => $d['revenue']],
                            $revenueTrend
                        ), 30),
                        'predicted'
                    )),
                ],
                'comparisons' => [
                    'previous_revenue' => $previousRevenue,
                    'previous_orders' => $previousOrders,
                    'yoy_growth' => $yoyGrowth,
                    'period_days' => $daysDiff,
                ],
            ],
        ]);
    }

    /**
     * Predictive Analytics - AI Forecasting
     */
    public function predictiveAnalytics(Request $request)
    {
        $metric = $request->query('metric', 'revenue');
        $forecastDays = max(7, min(90, (int) $request->query('forecast_days', 30)));

        // Forecast on unified revenue (all paid sources), not just POS sales
        $dailyMap = (new RevenueService())->daily(Carbon::now()->subDays(89), Carbon::now());
        $historicalData = [];
        for ($i = 89; $i >= 0; $i--) {
            $date = Carbon::now()->subDays($i);
            $day = $dailyMap[$date->format('Y-m-d')] ?? ['revenue' => 0, 'count' => 0];
            $historicalData[] = [
                'date' => $date->format('Y-m-d'),
                'actual' => (float) ($metric === 'revenue' ? $day['revenue'] : $day['count']),
            ];
        }

        $forecastData = $this->forecastSeries($historicalData, $forecastDays);
        $weekdayFactors = $this->weekdayFactors($historicalData);
        $weekendAvg = ($weekdayFactors[0] + $weekdayFactors[6]) / 2;
        $weekdayAvg = array_sum(array_slice($weekdayFactors, 1, 5)) / 5;
        $weekendBoostPct = $weekdayAvg > 0 ? round(($weekendAvg / $weekdayAvg - 1) * 100, 1) : 0;

        $totalForecast = array_sum(array_column($forecastData, 'predicted'));
        $last30 = array_slice($historicalData, -30);
        $prev30 = array_slice($historicalData, -60, 30);
        $last30Total = array_sum(array_column($last30, 'actual'));
        $prev30Total = array_sum(array_column($prev30, 'actual'));
        $trendPct = $prev30Total > 0 ? round(($last30Total - $prev30Total) / $prev30Total * 100, 1) : 0;

        $recommendations = [];
        if ($weekendBoostPct > 5) {
            $weekendDays = intdiv($forecastDays, 7) * 2;
            $avgDailyForecast = $forecastDays > 0 ? $totalForecast / $forecastDays : 0;
            $impact = $avgDailyForecast * ($weekendBoostPct / 100) * $weekendDays;
            $recommendations[] = [
                'type' => 'opportunity',
                'title' => 'Weekend Revenue Spike Expected',
                'description' => "Revenue typically rises {$weekendBoostPct}% on weekends based on the last 90 days",
                'impact' => '+₱' . number_format($impact, 0) . ' potential',
                'action' => 'View Schedule',
            ];
        }
        if ($trendPct < -5) {
            $recommendations[] = [
                'type' => 'warning',
                'title' => 'Downward Trend Detected',
                'description' => "Last 30 days are {$trendPct}% below the prior 30 days",
                'impact' => $metric === 'revenue' ? '₱' . number_format(abs($last30Total - $prev30Total), 0) . ' shortfall' : abs($last30Total - $prev30Total) . ' fewer orders',
                'action' => 'Review Sales',
            ];
        } elseif ($trendPct > 5) {
            $recommendations[] = [
                'type' => 'opportunity',
                'title' => 'Growth Trend Detected',
                'description' => "Last 30 days are {$trendPct}% above the prior 30 days",
                'impact' => $metric === 'revenue' ? '+₱' . number_format($last30Total - $prev30Total, 0) : '+' . ($last30Total - $prev30Total) . ' orders',
                'action' => 'View Details',
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'metric' => $metric,
                'historical_data' => $historicalData,
                'forecast_data' => $forecastData,
                'seasonality' => [
                    'weekend_boost' => round($weekendAvg, 3),
                    'weekend_boost_pct' => $weekendBoostPct,
                    'weekday_factors' => $weekdayFactors,
                ],
                'trend_pct' => $trendPct,
                'forecast_total' => round($totalForecast, 2),
                'recommendations' => $recommendations,
            ],
        ]);
    }

    /**
     * Customer Segmentation - RFM Analysis
     */
    public function customerSegmentation(Request $request)
    {
        $customers = Customer::with(['orders'])->get()->map(fn($c) => [
            'id' => $c->id,
            'name' => $c->name,
            'email' => $c->email,
            'total_spent' => (float) $c->orders->sum('total_amount'),
            'orders' => $c->orders->count(),
            'last_order_date' => $c->orders->max('created_at'),
            'days_since_order' => $c->orders->max('created_at') ? Carbon::parse($c->orders->max('created_at'))->diffInDays(now()) : 999,
        ]);

        $vip = $customers->filter(fn($c) => $c['total_spent'] > 50000 && $c['orders'] > 10);
        $loyal = $customers->filter(fn($c) => $c['total_spent'] > 20000 && $c['orders'] > 5);
        $atRisk = $customers->filter(fn($c) => $c['days_since_order'] > 45 && $c['total_spent'] > 10000);
        $lost = $customers->filter(fn($c) => $c['days_since_order'] > 90);
        $new = $customers->filter(fn($c) => $c['orders'] <= 2);

        return response()->json([
            'success' => true,
            'data' => [
                'customers' => $customers->values(),
                'segments' => [
                    'vip' => ['count' => $vip->count(), 'revenue' => $vip->sum('total_spent'), 'avg_order' => $vip->count() > 0 ? $vip->sum('total_spent') / $vip->sum('orders') : 0],
                    'loyal' => ['count' => $loyal->count(), 'revenue' => $loyal->sum('total_spent'), 'avg_order' => $loyal->count() > 0 ? $loyal->sum('total_spent') / $loyal->sum('orders') : 0],
                    'atRisk' => ['count' => $atRisk->count(), 'revenue' => $atRisk->sum('total_spent'), 'recoverable' => $atRisk->sum('total_spent') * 0.3],
                    'lost' => ['count' => $lost->count(), 'revenue' => $lost->sum('total_spent')],
                    'new' => ['count' => $new->count(), 'revenue' => $new->sum('total_spent')],
                ],
                'recommendations' => $atRisk->count() > 0 ? [['type' => 'win_back', 'customer_count' => $atRisk->count(), 'campaign' => '15% discount']] : [],
            ],
        ]);
    }

    /**
     * Comparative Reporting
     */
    public function comparativeReporting(Request $request)
    {
        $primaryFrom = Carbon::now()->startOfMonth();
        $primaryTo = Carbon::now()->endOfMonth();
        $comparisonFrom = Carbon::now()->subMonth()->startOfMonth();
        $comparisonTo = Carbon::now()->subMonth()->endOfMonth();

        $primaryMetrics = $this->getPeriodMetrics($primaryFrom, $primaryTo);
        $comparisonMetrics = $this->getPeriodMetrics($comparisonFrom, $comparisonTo);

        // Real daily trend data for primary period (all paid sources)
        $revenueService = new RevenueService();
        $currentDaily = $revenueService->daily($primaryFrom, $primaryTo);
        $previousDaily = $revenueService->daily($comparisonFrom, $comparisonTo);
        $dailyTrend = [];
        $daysInMonth = $primaryFrom->daysInMonth;
        for ($i = 1; $i <= $daysInMonth; $i++) {
            $date = $primaryFrom->copy()->addDays($i - 1);
            $prevDate = $date->copy()->subMonth();
            $dailyTrend[] = [
                'day' => $date->format('M d'),
                'current' => (float) ($currentDaily[$date->format('Y-m-d')]['revenue'] ?? 0),
                'previous' => (float) ($previousDaily[$prevDate->format('Y-m-d')]['revenue'] ?? 0),
            ];
        }

        // Revenue breakdown by source for both periods
        $currentBreakdown = $revenueService->breakdown($primaryFrom, $primaryTo);
        $previousBreakdown = $revenueService->breakdown($comparisonFrom, $comparisonTo);
        $sourceLabels = [
            'pos' => 'POS Sales',
            'orders' => 'Store Orders',
            'services' => 'Service Requests',
            'boarding' => 'Hotel Boarding',
            'confinement' => 'Medical Confinement',
        ];
        $categoryBreakdown = [];
        foreach ($sourceLabels as $key => $label) {
            $categoryBreakdown[] = [
                'category' => $label,
                'current' => (float) ($currentBreakdown[$key] ?? 0),
                'previous' => (float) ($previousBreakdown[$key] ?? 0),
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'comparisonData' => [
                    'revenue' => ['current' => $primaryMetrics['revenue'], 'previous' => $comparisonMetrics['revenue']],
                    'orders' => ['current' => $primaryMetrics['orders'], 'previous' => $comparisonMetrics['orders']],
                    'customers' => ['current' => $primaryMetrics['customers'], 'previous' => $comparisonMetrics['customers']],
                    'avgOrderValue' => ['current' => $primaryMetrics['avg_order_value'], 'previous' => $comparisonMetrics['avg_order_value']],
                ],
                'dailyTrend' => $dailyTrend,
                'categoryBreakdown' => $categoryBreakdown,
            ],
        ]);
    }

    private function getPeriodMetrics($from, $to)
    {
        $revenueService = new RevenueService();
        $revenue = $revenueService->total($from, $to);
        $orders = $revenueService->count($from, $to);
        return [
            'revenue' => (float) $revenue,
            'orders' => $orders,
            'customers' => Sale::whereBetween('created_at', [$from, $to])->distinct('customer_id')->count(),
            'avg_order_value' => $orders > 0 ? round($revenue / $orders, 2) : 0,
        ];
    }

    /**
     * Automated Alerts
     */
    public function automatedAlerts(Request $request)
    {
        $this->evaluateAlerts();

        $alerts = $this->tableExists('report_alerts')
            ? DB::table('report_alerts')->orderBy('id')->get()->map(fn ($alert) => [
                'id' => $alert->id,
                'name' => $alert->name,
                'type' => $alert->type,
                'enabled' => (bool) $alert->enabled,
                'threshold' => (float) $alert->threshold,
                'channels' => json_decode($alert->channels ?? '[]', true) ?: [],
                'frequency' => $alert->frequency,
                'created_at' => $alert->created_at,
            ])->values()
            : collect();

        $history = $this->tableExists('report_alert_history')
            ? DB::table('report_alert_history')
                ->latest('triggered_at')
                ->limit(50)
                ->get()
                ->map(fn ($row) => [
                    'id' => $row->id,
                    'report_alert_id' => $row->report_alert_id,
                    'title' => $row->title,
                    'message' => $row->message,
                    'context' => json_decode($row->context ?? 'null', true),
                    'timestamp' => $row->triggered_at,
                    'status' => 'triggered',
                ])->values()
            : collect();

        return response()->json([
            'success' => true,
            'data' => [
                'alerts' => $alerts,
                'history' => $history,
            ],
        ]);
    }

    public function createAlert(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'type' => 'required|string|in:revenue_drop,low_stock,pending_approvals',
            'threshold' => 'required|numeric|min:0',
            'channels' => 'nullable|array',
            'channels.*' => 'boolean',
            'frequency' => 'nullable|string|in:immediate,daily,weekly',
            'enabled' => 'nullable|boolean',
        ]);

        if (!$this->tableExists('report_alerts')) {
            return response()->json(['success' => false, 'message' => 'Alerts storage is not installed. Run migrations.'], 503);
        }

        $id = DB::table('report_alerts')->insertGetId([
            'name' => $validated['name'],
            'type' => $validated['type'],
            'threshold' => $validated['threshold'],
            'channels' => json_encode($validated['channels'] ?? ['dashboard' => true]),
            'frequency' => $validated['frequency'] ?? 'daily',
            'enabled' => $validated['enabled'] ?? true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Alert created', 'id' => $id], 201);
    }

    public function deleteAlert($id)
    {
        if (!$this->tableExists('report_alerts')) {
            return response()->json(['success' => false, 'message' => 'Alerts storage is not installed. Run migrations.'], 503);
        }

        $deleted = DB::table('report_alerts')->where('id', $id)->delete();

        return $deleted
            ? response()->json(['success' => true, 'message' => 'Alert deleted'])
            : response()->json(['success' => false, 'message' => 'Alert not found'], 404);
    }

    private function evaluateAlerts(): void
    {
        if (!$this->tableExists('report_alerts') || !$this->tableExists('report_alert_history')) {
            return;
        }

        $alerts = DB::table('report_alerts')->where('enabled', true)->get();

        foreach ($alerts as $alert) {
            [$triggered, $message, $context] = $this->evaluateAlert($alert);
            if (!$triggered) {
                continue;
            }

            $windowMinutes = match ($alert->frequency) {
                'immediate' => 60,
                'weekly' => 10080,
                default => 1440,
            };

            $alreadyLogged = DB::table('report_alert_history')
                ->where('report_alert_id', $alert->id)
                ->where('triggered_at', '>=', now()->subMinutes($windowMinutes))
                ->exists();

            if ($alreadyLogged) {
                continue;
            }

            DB::table('report_alert_history')->insert([
                'report_alert_id' => $alert->id,
                'title' => $alert->name,
                'message' => $message,
                'context' => json_encode($context),
                'triggered_at' => now(),
            ]);
        }
    }

    private function evaluateAlert($alert): array
    {
        $threshold = (float) $alert->threshold;

        return match ($alert->type) {
            'revenue_drop' => (function () use ($threshold) {
                $todayRevenue = (float) Sale::whereDate('created_at', Carbon::today())->sum('amount');
                return [
                    $todayRevenue < $threshold,
                    "Today's revenue (₱" . number_format($todayRevenue, 2) . ") is below the ₱" . number_format($threshold, 2) . " threshold.",
                    ['today_revenue' => $todayRevenue, 'threshold' => $threshold],
                ];
            })(),
            'low_stock' => (function () use ($threshold) {
                $lowStock = InventoryItem::whereNull('archived_at')->whereRaw('stock <= reorder_level')->count();
                return [
                    $lowStock >= $threshold,
                    "{$lowStock} item(s) at or below reorder level (threshold: " . (int) $threshold . ").",
                    ['low_stock_items' => $lowStock, 'threshold' => $threshold],
                ];
            })(),
            'pending_approvals' => (function () use ($threshold) {
                $pending = $this->tableExists('service_requests')
                    ? DB::table('service_requests')->where('status', 'pending')->count()
                    : 0;
                return [
                    $pending >= $threshold,
                    "{$pending} service request(s) pending approval (threshold: " . (int) $threshold . ").",
                    ['pending_approvals' => $pending, 'threshold' => $threshold],
                ];
            })(),
            default => [false, null, null],
        };
    }

    /**
     * Sales Analysis - ACCURATE sales data with hourly and category breakdown
     */
    public function salesAnalysis(Request $request)
    {
        $range = $request->query('range', 'month');
        $days = match($range) {
            'today' => 1,
            'week' => 7,
            'month' => 30,
            'quarter' => 90,
            default => 30,
        };
        
        $startDate = Carbon::now()->subDays($days);
        $endDate = Carbon::now();

        // ACCURATE daily data across all paid revenue sources
        $revenueService = new RevenueService();
        $dailyMap = $revenueService->daily($startDate, $endDate);
        $dailyData = [];
        for ($i = $days; $i >= 0; $i--) {
            $date = Carbon::now()->subDays($i);
            $day = $dailyMap[$date->format('Y-m-d')] ?? ['revenue' => 0, 'count' => 0];
            $revenue = (float) $day['revenue'];
            $orders = (int) $day['count'];

            $dailyData[] = [
                'date' => $date->format('M d'),
                'full_date' => $date->format('Y-m-d'),
                'revenue' => $revenue,
                'orders' => $orders,
                'avg_order_value' => $orders > 0 ? round($revenue / $orders, 2) : 0,
            ];
        }

        // ACCURATE category/type breakdown from real sales data
        $categoryData = Sale::whereBetween('created_at', [$startDate, $endDate])
            ->select('type', DB::raw('COUNT(*) as count'), DB::raw('SUM(amount) as total'))
            ->whereNotNull('type')
            ->groupBy('type')
            ->orderByDesc('total')
            ->get()
            ->map(function($item) use ($startDate, $endDate) {
                // Calculate growth vs previous period
                $prevPeriodStart = $startDate->copy()->subDays($endDate->diffInDays($startDate));
                $prevPeriodEnd = $startDate->copy()->subDay();
                
                $prevRevenue = Sale::where('type', $item->type)
                    ->whereBetween('created_at', [$prevPeriodStart, $prevPeriodEnd])
                    ->sum('amount') ?? 0;
                
                $growth = $prevRevenue > 0 ? round((($item->total - $prevRevenue) / $prevRevenue) * 100, 1) : 0;
                
                return [
                    'name' => ucfirst($item->type),
                    'value' => (float) $item->total,
                    'orders' => (int) $item->count,
                    'growth' => $growth,
                ];
            });

        // Append non-POS revenue sources so the breakdown covers all income
        $sourceBreakdown = $revenueService->breakdown($startDate, $endDate);
        $sourceLabels = [
            'orders' => 'Store Orders',
            'services' => 'Service Requests',
            'boarding' => 'Hotel Boarding',
            'confinement' => 'Medical Confinement',
        ];
        $extraSources = collect($sourceLabels)
            ->map(fn ($label, $key) => [
                'name' => $label,
                'value' => (float) ($sourceBreakdown[$key] ?? 0),
                'orders' => 0,
                'growth' => 0,
            ])
            ->filter(fn ($row) => $row['value'] > 0)
            ->values();
        $categoryData = $categoryData->concat($extraSources)->sortByDesc('value')->values();

        // ACCURATE hourly sales pattern (if sales have time data)
        $hourlyData = [];
        $dbDriver = DB::getDriverName();
        
        if ($dbDriver === 'sqlite') {
            $hourlySales = Sale::whereBetween('created_at', [$startDate, $endDate])
                ->select(DB::raw('CAST(strftime("%H", created_at) AS INTEGER) as hour'), DB::raw('SUM(amount) as sales'), DB::raw('COUNT(DISTINCT customer_id) as customers'))
                ->groupBy('hour')
                ->get();
        } else {
            $hourlySales = Sale::whereBetween('created_at', [$startDate, $endDate])
                ->select(DB::raw('HOUR(created_at) as hour'), DB::raw('SUM(amount) as sales'), DB::raw('COUNT(DISTINCT customer_id) as customers'))
                ->groupBy('hour')
                ->get();
        }
        
        // Fill all 24 hours
        for ($hour = 0; $hour < 24; $hour += 2) { // Every 2 hours
            $hourData = $hourlySales->firstWhere('hour', $hour);
            $hourLabel = $hour < 12 ? $hour . 'AM' : ($hour == 12 ? '12PM' : ($hour - 12) . 'PM');
            
            $hourlyData[] = [
                'hour' => $hourLabel,
                'sales' => (float) ($hourData->sales ?? 0),
                'customers' => (int) ($hourData->customers ?? 0),
            ];
        }

        // Calculate ACCURATE totals
        $totalRevenue = array_sum(array_column($dailyData, 'revenue'));
        $totalOrders = array_sum(array_column($dailyData, 'orders'));
        $avgOrderValue = $totalOrders > 0 ? round($totalRevenue / $totalOrders, 2) : 0;

        // Top products (would need order_items table for real data)
        // Using sales by type as proxy for now
        $topProducts = $categoryData->take(5)->values();

        return response()->json([
            'success' => true,
            'data' => [
                'dailyData' => $dailyData,
                'categoryData' => $categoryData->values(),
                'hourlyData' => $hourlyData,
                'topProducts' => $topProducts,
                'summary' => [
                    'total_revenue' => $totalRevenue,
                    'total_orders' => $totalOrders,
                    'avg_order_value' => $avgOrderValue,
                    'date_range' => [
                        'from' => $startDate->format('Y-m-d'),
                        'to' => $endDate->format('Y-m-d'),
                    ],
                ],
            ],
        ]);
    }

    /**
     * Inventory Optimization
     */
    public function inventoryOptimization(Request $request)
    {
        $items = InventoryItem::whereNull('archived_at')->get()->map(fn($item) => ['name' => $item->name, 'stock' => $item->stock, 'reorder_level' => $item->reorder_level, 'total_value' => $item->stock * ($item->unit_cost ?? 0)])->sortByDesc('total_value');
        $lowStockCount = InventoryItem::whereNull('archived_at')->whereRaw('stock <= reorder_level')->where('stock', '>', 0)->count();

        // Calculate ABC data from real inventory items
        $totalValue = $items->sum('total_value');
        $sortedItems = $items->values();
        $aThreshold = $totalValue * 0.70;
        $bThreshold = $totalValue * 0.95;
        $cumulative = 0;
        $aItems = ['count' => 0, 'value' => 0];
        $bItems = ['count' => 0, 'value' => 0];
        $cItems = ['count' => 0, 'value' => 0];
        foreach ($sortedItems as $item) {
            $cumulative += $item['total_value'];
            if ($cumulative <= $aThreshold) {
                $aItems['count']++;
                $aItems['value'] += $item['total_value'];
            } elseif ($cumulative <= $bThreshold) {
                $bItems['count']++;
                $bItems['value'] += $item['total_value'];
            } else {
                $cItems['count']++;
                $cItems['value'] += $item['total_value'];
            }
        }
        $abcData = [
            ['category' => 'A - High Value', 'items' => $aItems['count'], 'value' => round($aItems['value'], 2), 'percentage' => $totalValue > 0 ? round($aItems['value'] / $totalValue * 100, 1) : 0, 'color' => '#10b981'],
            ['category' => 'B - Medium Value', 'items' => $bItems['count'], 'value' => round($bItems['value'], 2), 'percentage' => $totalValue > 0 ? round($bItems['value'] / $totalValue * 100, 1) : 0, 'color' => '#3b82f6'],
            ['category' => 'C - Low Value', 'items' => $cItems['count'], 'value' => round($cItems['value'], 2), 'percentage' => $totalValue > 0 ? round($cItems['value'] / $totalValue * 100, 1) : 0, 'color' => '#94a3b8'],
        ];

        $stockData = InventoryItem::whereNull('archived_at')
            ->select(
                DB::raw('COALESCE(category, "Uncategorized") as category'),
                DB::raw('COUNT(*) as items'),
                DB::raw('SUM(stock) as units'),
                DB::raw('SUM(stock * price) as value'),
                DB::raw('SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END) as out_of_stock'),
                DB::raw('SUM(CASE WHEN stock > 0 AND stock <= reorder_level THEN 1 ELSE 0 END) as low_stock')
            )
            ->groupBy('category')
            ->orderByDesc('value')
            ->get()
            ->map(fn ($row) => [
                'category' => $row->category,
                'items' => (int) $row->items,
                'units' => (int) $row->units,
                'value' => (float) $row->value,
                'out_of_stock' => (int) $row->out_of_stock,
                'low_stock' => (int) $row->low_stock,
            ])
            ->values();

        $reorderRecommendations = InventoryItem::whereNull('archived_at')
            ->whereRaw('stock <= reorder_level')
            ->orderBy('stock')
            ->limit(50)
            ->get()
            ->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->name,
                'category' => $item->category ?? 'Uncategorized',
                'stock' => (int) $item->stock,
                'reorder_level' => (int) $item->reorder_level,
                'suggested_order_qty' => max(0, ($item->reorder_level * 2) - $item->stock),
            ])
            ->values();

        return response()->json([
            'success' => true,
            'data' => [
                'abcData' => $abcData,
                'stockData' => $stockData,
                'reorderRecommendations' => $reorderRecommendations,
                'lowStockCount' => $lowStockCount,
            ],
        ]);
    }

    /**
     * Staff Performance
     */
    public function staffPerformance(Request $request)
    {
        $staffUsers = User::whereIn('role', ['groomer', 'veterinary', 'receptionist', 'cashier', 'manager'])->get();

        $hasStaffIdColumn = Schema::hasColumn('sales', 'staff_id');
        $thirtyDaysAgo = Carbon::now()->subDays(30);

        $staffData = $staffUsers->map(function ($user) use ($hasStaffIdColumn, $thirtyDaysAgo) {
            // 1. Sales revenue by staff (last 30 days)
            if ($hasStaffIdColumn) {
                $revenue = (float) Sale::where('staff_id', $user->id)
                    ->where('created_at', '>=', $thirtyDaysAgo)
                    ->sum('amount') ?? 0;
            } elseif (Schema::hasColumn('sales', 'cashier_id')) {
                $revenue = (float) Sale::where('cashier_id', $user->id)
                    ->where('created_at', '>=', $thirtyDaysAgo)
                    ->sum('amount') ?? 0;
            } else {
                $revenue = 0;
            }

            // 2. Appointments / services completed by staff
            $appointmentsCount = 0;
            if (Schema::hasColumn('appointments', 'veterinarian_id') && in_array($user->role, ['veterinary', 'groomer'])) {
                $appointmentsCount = Appointment::where('veterinarian_id', $user->id)
                    ->where('status', 'completed')
                    ->where('created_at', '>=', $thirtyDaysAgo)
                    ->count();
            }

            // 3. Attendance & biometric data (real)
            $attendanceRecords = Attendance::where('user_id', $user->id)
                ->where('date', '>=', $thirtyDaysAgo->toDateString())
                ->get();

            $presentDays = $attendanceRecords->where('status', 'present')->count();
            $lateDays = $attendanceRecords->where('is_late', true)->count();
            $totalDays = $attendanceRecords->count();
            $attendanceRate = $totalDays > 0 ? round(($presentDays / $totalDays) * 100, 1) : 0;
            $punctualityRate = $totalDays > 0 ? round((($totalDays - $lateDays) / $totalDays) * 100, 1) : 0;
            $biometricPunches = $attendanceRecords->where('source', 'biometric')->count();
            $overtimeHours = (float) $attendanceRecords->sum('overtime_hours');

            return [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role,
                'department' => $user->department ?? 'General',
                'avatar' => $user->avatar,
                'revenue' => $revenue,
                'appointments' => $appointmentsCount,
                'attendanceRate' => $attendanceRate,
                'punctualityRate' => $punctualityRate,
                'biometricPunches' => $biometricPunches,
                'overtimeHours' => $overtimeHours,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => [
                'staffData' => $staffData,
            ],
        ]);
    }
}
