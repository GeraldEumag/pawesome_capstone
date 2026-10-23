<?php

namespace App\Http\Controllers\Veterinary;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Pet;
use App\Models\User;
use App\Services\ClinicalAccessLogger;
use App\Services\ServiceBillingService;
use App\Models\PaymentSettlement;
use App\Models\ServiceBillingPaymentRequest;
use App\Support\ReceiptBreakdown;
use App\Support\VeterinaryStatus;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    private function assignedAppointments()
    {
        $query = Appointment::query();
        $user = Auth::user();

        // Regular veterinarians only see appointments assigned to them.
        // Admin sees the full appointment board.
        if (!$user || !$user->hasRoleAccess('admin')) {
            $query->where('veterinarian_id', Auth::id());
        }

        return $query;
    }

    private function appointmentPatientScope($query)
    {
        $user = Auth::user();

        if ($user && $user->hasRoleAccess('admin')) {
            return $query->whereHas('appointments');
        }

        $authId = Auth::id();
        return $query->whereHas('appointments', function ($q) use ($authId) {
            $q->where('veterinarian_id', $authId);
        });
    }

    public function overview()
    {
        $today = Carbon::today();

        $todayAssigned = $this->assignedAppointments()
            ->whereDate('scheduled_at', $today)
            ->whereIn('status', VeterinaryStatus::QUEUE)
            ->count();

        $pendingAssigned = $this->assignedAppointments()
            ->where('status', Appointment::STATUS_REQUESTED)
            ->count();

        $upcomingAssigned = $this->assignedAppointments()
            ->with(['customer', 'pet', 'service', 'veterinarian'])
            ->where('scheduled_at', '>=', $today)
            ->whereIn('status', VeterinaryStatus::QUEUE)
            ->orderBy('scheduled_at')
            ->limit(5)
            ->get();

        return response()->json([
            'today_appointments' => $todayAssigned,
            'approved_appointments' => $this->assignedAppointments()
                ->where('status', Appointment::STATUS_SCHEDULED)
                ->count(),
            'pending_appointments' => $pendingAssigned,
            'completed_appointments' => $this->assignedAppointments()
                ->where('status', 'completed')
                ->count(),
            'total_patients' => $this->appointmentPatientScope(Pet::query())->count(),
            'new_patients_this_month' => $this->appointmentPatientScope(Pet::query())->whereMonth('created_at', $today->month)->count(),
            'upcoming_appointments' => $upcomingAssigned->sortBy('scheduled_at')->values()->take(5),
            'recent_patients' => $this->appointmentPatientScope(Pet::with('customer'))
                ->latest()
                ->take(5)
                ->get(),
            'appointments_by_type' => $this->assignedAppointments()
                ->with('service')
                ->selectRaw('service_id, count(*) as count')
                ->whereMonth('scheduled_at', $today->month)
                ->whereIn('status', [...VeterinaryStatus::QUEUE, 'completed'])
                ->groupBy('service_id')
                ->get(),
        ]);
    }

    public function appointments()
    {
        // Regular veterinarians only see appointments assigned to them
        // (i.e., ones that receptionist has approved and assigned);
        // admin sees the full board. Emergencies first, then earliest
        // check-in so waiting patients surface ahead of future bookings.
        return response()->json(
            $this->assignedAppointments()
                ->with(['customer', 'pet', 'service', 'veterinarian'])
                ->whereIn('status', VeterinaryStatus::QUEUE)
                ->orderByDesc('emergency')
                ->orderBy('checked_in_at')
                ->orderBy('scheduled_at')
                ->get()
        );
    }

    public function patients()
    {
        return response()->json(
            $this->appointmentPatientScope(
                Pet::with(['customer', 'appointments' => function($query) {
                    $query->latest()->take(3);
                }])
            )->get()
        );
    }

    public function appointment($id)
    {
        // Visit detail is clinical history: readable by any veterinary staff,
        // with access by non-assigned vets logged. Writes stay assignment-scoped.
        $appointment = Appointment::with(['customer', 'pet', 'service', 'veterinarian'])->findOrFail($id);

        ClinicalAccessLogger::record(Auth::user(), 'appointment', (int) $appointment->id, (int) $appointment->veterinarian_id === (int) Auth::id());

        return response()->json([
            'appointment' => $appointment,
        ]);
    }

    public function history(Request $request)
    {
        $statuses = $request->input('status', 'completed,cancelled');
        $statusArray = explode(',', $statuses);

        $perPage = (int) $request->get('per_page', 25);
        $page    = (int) $request->get('page', 1);
        $search  = trim((string) $request->get('search', ''));
        $dateFilter = $request->get('date_filter', 'all');

        $query = $this->assignedAppointments()
            ->with(['customer', 'pet', 'service', 'veterinarian'])
            ->whereIn('status', $statusArray)
            ->orderBy('scheduled_at', 'desc');

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->whereHas('customer', fn ($c) => $c->where('name', 'like', "%$search%"))
                  ->orWhereHas('pet', fn ($p) => $p->where('name', 'like', "%$search%"))
                  ->orWhereHas('service', fn ($s) => $s->where('name', 'like', "%$search%"));
            });
        }

        if ($dateFilter === 'today')  $query->whereDate('scheduled_at', \Carbon\Carbon::today());
        if ($dateFilter === 'week')   $query->where('scheduled_at', '>=', \Carbon\Carbon::now()->subDays(7));
        if ($dateFilter === 'month')  $query->where('scheduled_at', '>=', \Carbon\Carbon::now()->subDays(30));

        $paginated = $query->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'appointments' => $paginated->items(),
            'history'      => $paginated->items(),
            'data'         => $paginated->items(),
            'meta'         => [
                'total'        => $paginated->total(),
                'per_page'     => $paginated->perPage(),
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
            ],
        ]);
    }

    public function reports(Request $request)
    {
        /** @var User|null $user */
        $user = Auth::user();
        $today = Carbon::today();
        
        // Build base query based on user role
        $query = Appointment::with(['customer', 'pet', 'service', 'veterinarian']);
        
        // If not admin, filter by assigned veterinarian
        if (!$user->hasRoleAccess('admin')) {
            $query->where('veterinarian_id', $user->id);
        }
        
        // Apply date filters
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');
        
        if ($startDate) {
            $query->whereDate('scheduled_at', '>=', $startDate);
        } else {
            // Default to current month if no start date
            $query->whereMonth('scheduled_at', $today->month)
                  ->whereYear('scheduled_at', $today->year);
        }
        
        if ($endDate) {
            $query->whereDate('scheduled_at', '<=', $endDate);
        } else if (!$startDate) {
            // Default to current month if no end date
            $query->whereMonth('scheduled_at', $today->month)
                  ->whereYear('scheduled_at', $today->year);
        }
        
        // Apply status filter
        $statusFilter = $request->input('status');
        if ($statusFilter && $statusFilter !== 'all') {
            $query->where('status', $statusFilter);
        }
        
        // Apply service type filter
        $serviceTypeFilter = $request->input('service_type');
        if ($serviceTypeFilter && $serviceTypeFilter !== 'all') {
            $query->whereHas('service', function ($q) use ($serviceTypeFilter) {
                $q->where('name', 'like', "%{$serviceTypeFilter}%")
                  ->orWhere('category', 'like', "%{$serviceTypeFilter}%");
            });
        }
        
        // Get all matching appointments for records
        $records = (clone $query)
            ->orderBy('scheduled_at', 'desc')
            ->limit(50)
            ->get()
            ->map(function ($appointment) {
                return [
                    'id' => $appointment->id,
                    'date' => $appointment->scheduled_at ? $appointment->scheduled_at->format('Y-m-d') : null,
                    'appointment_date' => $appointment->scheduled_at ? $appointment->scheduled_at->format('Y-m-d') : null,
                    'customer_name' => $appointment->customer?->name ?: 'Unknown Customer',
                    'pet_name' => $appointment->pet?->name ?: 'Unknown Pet',
                    'service_name' => $appointment->service?->name ?: 'Unknown Service',
                    'status' => $appointment->status,
                    'revenue' => (float) ($appointment->price ?? 0),
                    'vet_name' => $appointment->veterinarian?->name ?: 'Veterinary Staff',
                    'notes' => $appointment->notes ?: '',
                ];
            });
        
        // Calculate metrics from completed appointments only
        $metricsQuery = clone $query;
        $completedQuery = clone $query;
        
        // Filter for completed appointments for revenue and counts
        if ($statusFilter && $statusFilter !== 'all') {
            $completedQuery->where('status', $statusFilter);
        } else {
            $completedQuery->whereIn('status', ['completed', 'treated']);
        }
        
        $completedAppointments = $completedQuery->count();
        $totalRevenue = $completedQuery->sum('price') ?? 0;
        
        // Build service breakdown
        $serviceBreakdown = (clone $completedQuery)
            ->with('service')
            ->selectRaw('service_id, COUNT(*) as count, SUM(price) as revenue')
            ->groupBy('service_id')
            ->get()
            ->map(function ($item) {
                $service = $item->service;
                return [
                    'id' => $service?->id ?? $item->service_id,
                    'service_name' => $service?->name ?: 'Unknown Service',
                    'count' => (int) $item->count,
                    'revenue' => (float) ($item->revenue ?? 0),
                    'status' => 'completed',
                ];
            });
        
        // Determine period label
        $period = $startDate && $endDate
            ? Carbon::parse($startDate)->format('M d, Y') . ' - ' . Carbon::parse($endDate)->format('M d, Y')
            : ($startDate ? Carbon::parse($startDate)->format('F Y') : $today->format('F Y'));
        
        return response()->json([
            'success' => true,
            'data' => [
                'period' => $period,
                'monthly_revenue' => (float) $totalRevenue,
                'monthly_completed' => $completedAppointments,
                'service_breakdown' => $serviceBreakdown,
                'records' => $records,
            ],
        ]);
    }

    public function receipt($id)
    {
        $appointment = $this->assignedAppointments()
            ->with(['customer', 'pet', 'service', 'veterinarian'])
            ->findOrFail($id);

        $billing = ServiceBillingService::getItemizedBilling('veterinary', (int) $appointment->id);
        $baseAmount = (float) ($billing['base_amount'] ?? ($appointment->price ?? 0));
        $additionalServices = collect($billing['items'] ?? [])
            ->filter(function ($item) {
                return ($item->item_type ?? null) !== 'base_service';
            })
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'name' => $item->description,
                    'cost' => (float) ($item->total_price ?? 0),
                    'quantity' => (int) ($item->quantity ?? $item->quantity_used ?? 1),
                ];
            })
            ->values()
            ->all();

        $totalAmount = (float) ($billing['total_bill'] ?? $appointment->price ?? 0);

        $paymentRequestIds = ServiceBillingPaymentRequest::where('appointment_id', $appointment->id)->pluck('id');
        $settlementQuery = PaymentSettlement::query()
            ->where(function ($query) use ($appointment, $paymentRequestIds) {
                $query->where(function ($appointmentQuery) use ($appointment) {
                    $appointmentQuery->where('settleable_type', 'appointment')
                        ->where('settleable_id', $appointment->id);
                });

                if ($paymentRequestIds->isNotEmpty()) {
                    $query->orWhere(function ($billingQuery) use ($paymentRequestIds) {
                        $billingQuery->where('settleable_type', 'service_billing_payment')
                            ->whereIn('settleable_id', $paymentRequestIds);
                    });
                }
            });

        $paidSettlements = (clone $settlementQuery)
            ->where('status', PaymentSettlement::STATUS_PAID)
            ->orderBy('paid_at')
            ->get();
        $reversedSettlements = (clone $settlementQuery)
            ->whereIn('status', [PaymentSettlement::STATUS_VOIDED, PaymentSettlement::STATUS_REFUNDED])
            ->orderBy('paid_at')
            ->get();

        if ($paidSettlements->isEmpty() && ($appointment->payment_status ?? null) === 'paid') {
            $paidSettlements = collect([[
                'method' => $appointment->payment_method,
                'amount' => (float) ($billing['total_paid'] ?? $totalAmount),
                'reference_number' => $appointment->reference_number ?? $appointment->payment_reference ?? null,
                'receipt_number' => $appointment->receipt_number,
                'paid_at' => $appointment->paid_at,
            ]]);
        }

        $breakdown = ReceiptBreakdown::build(
            $totalAmount,
            $paidSettlements,
            (float) ($billing['discount_total'] ?? 0),
            $reversedSettlements
        );

        return response()->json([
            'receipt' => [
                'id' => $appointment->id,
                'date' => $appointment->scheduled_at,
                'customer_name' => $appointment->customer?->name,
                'pet_name' => $appointment->pet?->name,
                'service_name' => $appointment->service?->name,
                'service_category' => $appointment->service?->category,
                'vet_name' => $appointment->veterinarian?->name ?? 'Unassigned',
                'amount' => $baseAmount,
                'net_amount' => $breakdown['net_amount'],
                'vat_amount' => $breakdown['vat_amount'],
                'vat_rate' => $breakdown['vat_rate'],
                'subtotal' => $totalAmount,
                'total' => $breakdown['total'],
                'additional_services' => $additionalServices,
                'receipt_number' => $appointment->receipt_number,
                'paid_date' => $appointment->paid_at,
                'payment_method' => $appointment->payment_method ?? 'cash',
                'status' => $appointment->payment_status ?? 'pending',
                'balance_due' => (float) ($billing['balance_due'] ?? $breakdown['balance_due']),
                'notes' => $appointment->notes,
                'tax' => $breakdown['vat_amount'],
                'breakdown' => $breakdown,
            ],
        ]);
    }
}
