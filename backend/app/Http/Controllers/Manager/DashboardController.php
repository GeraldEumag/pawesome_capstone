<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Appointment;
use App\Models\Sale;
use App\Models\InventoryItem;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function overview()
    {
        $today = Carbon::today();
        $staffRoles = ['receptionist', 'veterinary', 'inventory', 'cashier'];
        
        // Count service requests with different payment statuses
        $paidServiceRevenue = ServiceRequest::where('payment_status', 'paid')->count() * 500;
        $paidServiceCount = ServiceRequest::where('payment_status', 'paid')->count();
        $pendingServicePayments = ServiceRequest::where('payment_status', 'pending')->count();
        $totalServiceRequests = ServiceRequest::count();
        
        // Count customer orders
        $paidOrderRevenue = DB::table('customer_orders')->where('payment_status', 'paid')->sum('total_amount');
        $paidOrderCount = DB::table('customer_orders')->where('payment_status', 'paid')->count();
        $totalOrders = DB::table('customer_orders')->count();
        
        return response()->json([
            'total_orders' => $totalOrders + $totalServiceRequests,
            'approved_orders' => DB::table('customer_orders')->where('status', 'approved')->count(),
            'paid_orders' => $paidOrderCount + $paidServiceCount,
            'pending_payments' => DB::table('customer_orders')->where('payment_status', 'pending')->count() + $pendingServicePayments,
            'rejected_orders' => DB::table('customer_orders')->whereIn('status', ['rejected', 'cancelled'])->count(),
            'sales_total' => Sale::where('status', 'completed')->sum('amount') + $paidOrderRevenue + $paidServiceRevenue,
            'paid_service_revenue' => $paidServiceRevenue,
            'paid_service_count' => $paidServiceCount,
            'pending_service_payments' => $pendingServicePayments,
            'total_service_requests' => $totalServiceRequests,
            'low_stock_count' => InventoryItem::whereColumn('stock', '<=', 'reorder_level')->count(),
            'completed_services' => Appointment::where('status', 'completed')->count()
                + DB::table('service_requests')->where('status', 'completed')->count(),
            'total_staff' => User::whereIn('role', $staffRoles)->count(),
            'active_staff' => User::whereIn('role', $staffRoles)
                ->where('is_active', true)->count(),
            'today_appointments' => Appointment::whereDate('scheduled_at', $today)->count(),
            'pending_appointments' => Appointment::where('status', 'scheduled')->count(),
            'completed_appointments' => Appointment::where('status', 'completed')->count(),
            'today_revenue' => Sale::whereDate('created_at', $today)->sum('amount'),
            'monthly_revenue' => Sale::whereMonth('created_at', $today->month)->sum('amount'),
            'staff_performance' => User::whereIn('role', $staffRoles)
                ->select('id', 'name', 'role', 'is_active', 'created_at')
                ->orderBy('name')
                ->get(),
        ]);
    }

    public function staff()
    {
        return response()->json([
            'staff' => User::whereIn('role', ['receptionist', 'veterinary', 'inventory', 'cashier'])->get(),
            'attendance_today' => User::whereIn('role', ['receptionist', 'veterinary', 'inventory', 'cashier'])
                ->where('is_active', true)->count(),
        ]);
    }

    public function executiveSummary()
    {
        $today = Carbon::today();
        $monthStart = $today->copy()->startOfMonth();
        
        return response()->json([
            'business_overview' => [
                'total_customers' => DB::table('customers')->count(),
                'active_customers' => DB::table('customers')->where('is_active', true)->count(),
                'total_pets' => DB::table('pets')->count(),
                'total_services' => DB::table('services')->count(),
            ],
            'financial_metrics' => [
                'today_revenue' => Sale::whereDate('created_at', $today)->sum('amount'),
                'monthly_revenue' => Sale::whereMonth('created_at', $today->month)->sum('amount'),
                'yearly_revenue' => Sale::whereYear('created_at', $today->year)->sum('amount'),
                'pending_payments' => DB::table('customer_orders')->where('payment_status', 'pending')->count(),
                'overdue_invoices' => DB::table('customer_orders')
                    ->where('payment_status', 'pending')
                    ->where('due_date', '<', $today)
                    ->count(),
            ],
            'operational_metrics' => [
                'today_appointments' => Appointment::whereDate('scheduled_at', $today)->count(),
                'completed_appointments' => Appointment::whereMonth('scheduled_at', $today->month)->count(),
                'pending_orders' => DB::table('customer_orders')->where('status', 'pending')->count(),
                'low_stock_items' => InventoryItem::whereColumn('stock', '<=', 'reorder_level')->count(),
                'occupancy_rate' => DB::table('hotel_rooms')->count() > 0 
                    ? round(DB::table('boardings')->where('status', 'checked_in')->count() / DB::table('hotel_rooms')->count() * 100, 2)
                    : 0,
            ],
            'staff_performance' => [
                'total_staff' => User::whereIn('role', ['receptionist', 'veterinary', 'inventory', 'cashier'])->count(),
                'active_staff' => User::whereIn('role', ['receptionist', 'veterinary', 'inventory', 'cashier'])
                    ->where('is_active', true)->count(),
                'staff_on_leave' => User::whereIn('role', ['receptionist', 'veterinary', 'inventory', 'cashier'])
                    ->where('is_active', false)->count(),
            ],
            'monthly_trends' => [
                'revenue_growth' => $this->calculateRevenueGrowth($today),
                'customer_growth' => $this->calculateCustomerGrowth($today),
                'appointment_completion_rate' => $this->calculateAppointmentCompletionRate($today),
            ],
        ]);
    }

    public function history(Request $request)
    {
        $perPage = (int) $request->get('per_page', 50);
        $page    = (int) $request->get('page', 1);
        $offset  = ($page - 1) * $perPage;

        $dateFilter = $request->get('date_filter', 'all');
        $search     = trim((string) $request->get('search', ''));
        $category   = $request->get('category', 'all');

        $entries = collect();

        // --- Sales (POS) ---
        $salesQuery = DB::table('sales')
            ->leftJoin('users as cashiers', 'cashiers.id', '=', 'sales.cashier_id')
            ->select([
                DB::raw('"transaction" as category'),
                DB::raw('"sale" as subcategory'),
                DB::raw('CONCAT("SALE-", sales.id) as reference_id'),
                DB::raw('COALESCE(cashiers.name, "Walk-in") as actor'),
                DB::raw('"cashier" as actor_role'),
                DB::raw('"Sale completed" as action'),
                DB::raw('CONCAT("POS transaction #", sales.id, " — ", COALESCE(sales.payment_type, "cash")) as description'),
                'sales.amount',
                DB::raw('COALESCE(sales.status, "completed") as status'),
                'sales.created_at',
            ]);

        if ($dateFilter === 'today')  $salesQuery->whereDate('sales.created_at', Carbon::today());
        if ($dateFilter === 'week')   $salesQuery->where('sales.created_at', '>=', Carbon::now()->subDays(7));
        if ($dateFilter === 'month')  $salesQuery->where('sales.created_at', '>=', Carbon::now()->subDays(30));
        if ($search) $salesQuery->where(function ($q) use ($search) {
            $q->where('cashiers.name', 'like', "%$search%")
              ->orWhere('sales.payment_type', 'like', "%$search%");
        });

        // --- Appointments ---
        $apptQuery = DB::table('appointments')
            ->leftJoin('users as vets', 'vets.id', '=', 'appointments.veterinarian_id')
            ->leftJoin('customers', 'customers.id', '=', 'appointments.customer_id')
            ->leftJoin('pets', 'pets.id', '=', 'appointments.pet_id')
            ->leftJoin('services', 'services.id', '=', 'appointments.service_id')
            ->select([
                DB::raw('"appointment" as category'),
                DB::raw('"service" as subcategory'),
                DB::raw('CONCAT("APT-", appointments.id) as reference_id'),
                DB::raw('COALESCE(vets.name, "Unassigned") as actor'),
                DB::raw('"veterinary" as actor_role'),
                DB::raw('CONCAT("Appointment ", appointments.status) as action'),
                DB::raw('CONCAT(COALESCE(services.name, "Service"), " for ", COALESCE(pets.name, "pet"), " (", COALESCE(customers.name, "customer"), ")") as description'),
                DB::raw('COALESCE(services.price, 0) as amount'),
                'appointments.status',
                DB::raw('COALESCE(appointments.scheduled_at, appointments.created_at) as created_at'),
            ]);

        if ($dateFilter === 'today')  $apptQuery->whereDate('appointments.created_at', Carbon::today());
        if ($dateFilter === 'week')   $apptQuery->where('appointments.created_at', '>=', Carbon::now()->subDays(7));
        if ($dateFilter === 'month')  $apptQuery->where('appointments.created_at', '>=', Carbon::now()->subDays(30));
        if ($search) $apptQuery->where(function ($q) use ($search) {
            $q->where('customers.name', 'like', "%$search%")
              ->orWhere('pets.name', 'like', "%$search%")
              ->orWhere('services.name', 'like', "%$search%")
              ->orWhere('vets.name', 'like', "%$search%");
        });

        // --- Service Requests ---
        if (DB::getSchemaBuilder()->hasTable('service_requests')) {
            $srQuery = DB::table('service_requests')
                ->select([
                    DB::raw('"service_request" as category'),
                    DB::raw('COALESCE(service_requests.request_type, "service") as subcategory'),
                    DB::raw('CONCAT("SR-", service_requests.id) as reference_id'),
                    DB::raw('COALESCE(service_requests.customer_name, "Customer") as actor'),
                    DB::raw('"customer" as actor_role'),
                    DB::raw('CONCAT("Service request ", service_requests.status) as action'),
                    DB::raw('CONCAT(COALESCE(service_requests.service_name, service_requests.request_type, "Service"), " for ", COALESCE(service_requests.pet_name, "pet")) as description'),
                    DB::raw('0 as amount'),
                    'service_requests.status',
                    'service_requests.created_at',
                ]);

            if ($dateFilter === 'today')  $srQuery->whereDate('service_requests.created_at', Carbon::today());
            if ($dateFilter === 'week')   $srQuery->where('service_requests.created_at', '>=', Carbon::now()->subDays(7));
            if ($dateFilter === 'month')  $srQuery->where('service_requests.created_at', '>=', Carbon::now()->subDays(30));
            if ($search) $srQuery->where(function ($q) use ($search) {
                $q->where('customer_name', 'like', "%$search%")
                  ->orWhere('pet_name', 'like', "%$search%")
                  ->orWhere('service_name', 'like', "%$search%");
            });

            $entries = $entries->concat($srQuery->get());
        }

        // --- Customer Orders ---
        if (DB::getSchemaBuilder()->hasTable('customer_orders')) {
            $ordQuery = DB::table('customer_orders')
                ->select([
                    DB::raw('"order" as category'),
                    DB::raw('"customer_order" as subcategory'),
                    DB::raw('CONCAT("ORD-", customer_orders.id) as reference_id'),
                    DB::raw('COALESCE(customer_orders.customer_name, "Customer") as actor'),
                    DB::raw('"customer" as actor_role'),
                    DB::raw('CONCAT("Order ", customer_orders.status) as action'),
                    DB::raw('CONCAT("Order #", customer_orders.id, " — ", COALESCE(customer_orders.payment_method, "N/A")) as description'),
                    DB::raw('COALESCE(customer_orders.total_amount, 0) as amount'),
                    'customer_orders.status',
                    'customer_orders.created_at',
                ]);

            if ($dateFilter === 'today')  $ordQuery->whereDate('customer_orders.created_at', Carbon::today());
            if ($dateFilter === 'week')   $ordQuery->where('customer_orders.created_at', '>=', Carbon::now()->subDays(7));
            if ($dateFilter === 'month')  $ordQuery->where('customer_orders.created_at', '>=', Carbon::now()->subDays(30));
            if ($search) $ordQuery->where(function ($q) use ($search) {
                $q->where('customer_name', 'like', "%$search%")
                  ->orWhere('payment_method', 'like', "%$search%");
            });

            $entries = $entries->concat($ordQuery->get());
        }

        $entries = $entries
            ->concat($salesQuery->get())
            ->concat($apptQuery->get());

        // Category filter
        if ($category !== 'all') {
            $entries = $entries->filter(fn ($e) => ($e->category ?? '') === $category);
        }

        // Sort newest first
        $entries = $entries->sortByDesc('created_at')->values();

        $total = $entries->count();
        $paginated = $entries->slice($offset, $perPage)->values();

        return response()->json([
            'success'  => true,
            'history'  => $paginated,
            'data'     => $paginated,
            'meta'     => [
                'total'        => $total,
                'per_page'     => $perPage,
                'current_page' => $page,
                'last_page'    => max(1, (int) ceil($total / $perPage)),
            ],
        ]);
    }

    private function calculateRevenueGrowth($today)
    {
        $currentMonth = Sale::whereMonth('created_at', $today->month)->sum('amount');
        $previousMonth = Sale::whereMonth('created_at', $today->copy()->subMonth()->month)->sum('amount');
        
        return $previousMonth > 0 ? round((($currentMonth - $previousMonth) / $previousMonth) * 100, 2) : 0;
    }

    private function calculateCustomerGrowth($today)
    {
        $currentMonth = DB::table('customers')->whereMonth('created_at', $today->month)->count();
        $previousMonth = DB::table('customers')->whereMonth('created_at', $today->copy()->subMonth()->month)->count();
        
        return $previousMonth > 0 ? round((($currentMonth - $previousMonth) / $previousMonth) * 100, 2) : 0;
    }

    private function calculateAppointmentCompletionRate($today)
    {
        $total = Appointment::whereMonth('scheduled_at', $today->month)->count();
        $completed = Appointment::whereMonth('scheduled_at', $today->month)->where('status', 'completed')->count();
        
        return $total > 0 ? round(($completed / $total) * 100, 2) : 0;
    }
}
