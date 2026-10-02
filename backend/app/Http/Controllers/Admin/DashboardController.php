<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Customer;
use App\Models\Appointment;
use App\Models\InventoryItem;
use App\Models\Sale;
use App\Services\RevenueService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function overview()
    {
        $today = Carbon::today();
        $revenue = new RevenueService();

        return response()->json([
            'success' => true,
            'data' => [
                'total_users' => User::count(),
                'active_users' => User::where('is_active', true)->count(),
                'total_customers' => Customer::count(),
                'total_appointments' => Appointment::count(),
                'today_appointments' => Appointment::whereDate('scheduled_at', $today)->count(),
                'completed_appointments' => Appointment::where('status', 'completed')->count(),
                'total_revenue' => $revenue->total(),
                'today_revenue' => $revenue->total($today, $today),
                'low_stock_items' => InventoryItem::whereNull('archived_at')->whereRaw('stock <= reorder_level')->where('stock', '>', 0)->count(),
                'active_modules' => count(array_filter($this->getActiveModules())),
                'appointments_by_status' => Appointment::selectRaw('status, COUNT(*) as count')
                    ->groupBy('status')
                    ->get()
                    ->map(function ($item) {
                        return [
                            'status' => $item->status,
                            'count' => (int) $item->count,
                        ];
                    }),
                'users_by_role' => User::selectRaw('role, COUNT(*) as count')
                    ->groupBy('role')
                    ->get()
                    ->map(function ($item) {
                        return [
                            'role' => $item->role,
                            'count' => (int) $item->count,
                        ];
                    }),
                'recent_users' => User::latest()->take(5)->get()->map(function ($user) {
                    return [
                        'id' => $user->id,
                        'name' => $user->name,
                        'email' => $user->email,
                        'role' => $user->role,
                        'is_active' => (bool) $user->is_active,
                        'created_at' => $user->created_at ? $user->created_at->format('Y-m-d H:i:s') : null,
                    ];
                }),
                'recent_appointments' => Appointment::with(['customer', 'pet', 'service'])
                    ->latest()
                    ->take(5)
                    ->get()
                    ->map(function ($appointment) {
                        return [
                            'id' => $appointment->id,
                            'scheduled_at' => $appointment->scheduled_at ? $appointment->scheduled_at->format('Y-m-d H:i:s') : null,
                            'status' => $appointment->status,
                            'customer' => [
                                'name' => $appointment->customer?->name ?: 'Unknown Customer',
                            ],
                            'pet' => [
                                'name' => $appointment->pet?->name ?: 'Unknown Pet',
                            ],
                            'service' => [
                                'name' => $appointment->service?->name ?: 'Unknown Service',
                            ],
                        ];
                    }),
            ],
        ]);
    }

    public function stats()
    {
        return response()->json([
            'users_by_role' => User::selectRaw('role, count(*) as count')
                ->groupBy('role')
                ->get(),
            'appointments_by_status' => Appointment::selectRaw('status, count(*) as count')
                ->groupBy('status')
                ->get(),
            'monthly_revenue' => collect((new RevenueService())->monthly(Carbon::now()->year))
                ->map(fn ($total, $month) => (object) ['month' => $month, 'total' => $total])
                ->values(),
        ]);
    }

    private function getActiveModules()
    {
        return [
            'user_management' => true,
            'appointment_system' => true,
            'inventory_management' => true,
            'payment_processing' => true,
            'veterinary_services' => true,
            'hotel_management' => true,
            'reporting_system' => true,
            'notification_system' => true,
            'audit_logging' => true,
        ];
    }
}
