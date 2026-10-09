<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\Grooming;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\Sale;
use App\Models\ChatbotLog;
use App\Models\Notification;
use App\Services\FileStorageService;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class PortalController extends Controller
{
    private function currentCustomer(): ?Customer
    {
        // For API token authentication, get user from auth()->user()
        $user = auth()->user();
        if (!$user) return null;
        
        // Try to find customer by user_id first (more reliable)
        $customer = Customer::where('user_id', $user->id)->first();
        
        // Fallback to email matching if user_id not found
        if (!$customer) {
            $customer = Customer::where('email', $user->email)->first();
        }
        
        return $customer;
    }

    public function overview()
    {
        $user = auth()->user();
        $cust = $this->currentCustomer();
        if (!$cust) {
            return response()->json([
                'active_bookings' => 0,
                'total_pets' => 0,
                'completed_services' => 0,
                'loyalty_points' => 0,
                'member_status' => 'Standard',
                'pending_orders' => 0,
                'pending_service_requests' => 0,
                'pending_requests' => 0,
                'approved_service_requests' => 0,
                'payment_pending' => 0,
                'payment_paid' => 0,
                'unread_notifications' => 0,
                'upcoming_appointments' => [],
                'recent_bookings' => [],
                'recent_pets' => [],
            ]);
        }

        $today = Carbon::today();

        $activeBookings = Appointment::where('customer_id', $cust->id)
            ->whereIn('status', ['scheduled','confirmed'])
            ->count();

        $completed = Appointment::where('customer_id', $cust->id)
            ->where('status', 'completed')
            ->whereMonth('scheduled_at', $today->month)
            ->count();

        $upcoming = Appointment::where('customer_id', $cust->id)
            ->whereIn('status', ['scheduled', 'confirmed'])
            ->where('scheduled_at', '>=', $today)
            ->with(['pet', 'service'])
            ->orderBy('scheduled_at')
            ->limit(3)
            ->get();
            
        $recent = Appointment::where('customer_id', $cust->id)
            ->with(['pet', 'service'])
            ->latest('scheduled_at')->limit(5)->get();

        $serviceRequests = ServiceRequest::query()
            ->when(Schema::hasColumn('service_requests', 'customer_id') && $user, function ($query) use ($user) {
                $query->where('customer_id', $user->id);
            })
            ->when(Schema::hasColumn('service_requests', 'customer_email') && $user?->email, function ($query) use ($user) {
                $query->orWhere('customer_email', $user->email);
            })
            ->latest()
            ->get();

        $orderQuery = DB::table('customer_orders');
        if (Schema::hasColumn('customer_orders', 'customer_id') && $user) {
            $orderQuery->where('customer_id', $user->id);
        }
        if (Schema::hasColumn('customer_orders', 'customer_email') && $user?->email) {
            $orderQuery->orWhere('customer_email', $user->email);
        }

        $orders = Schema::hasTable('customer_orders') ? $orderQuery->get() : collect();

        $pendingServiceRequests = $serviceRequests->where('status', 'pending')->count();
        $approvedServiceRequests = $serviceRequests->where('status', 'approved')->count();
        $pendingOrders = $orders->where('status', 'pending')->count();
        $paymentPending = $serviceRequests->where('payment_status', 'pending')->count()
            + $orders->where('payment_status', 'pending')->count();
        $paymentPaid = $serviceRequests->where('payment_status', 'paid')->count()
            + $orders->where('payment_status', 'paid')->count();
        $computedLoyaltyPoints = ($paymentPaid * 100) + $completed * 50;
        $loyaltyPoints = ($cust->loyalty_points > 0) ? (int) $cust->loyalty_points : $computedLoyaltyPoints;
        $memberStatus = $loyaltyPoints >= 1000 ? 'Premium' : 'Standard';

        $recentServiceRequests = $serviceRequests
            ->take(5)
            ->map(fn ($request) => [
                'id' => 'request-' . $request->id,
                'type' => 'service_request',
                'pet_name' => $request->pet_name,
                'service_name' => $request->service_name ?? $request->request_type,
                'scheduled_at' => $request->request_date,
                'status' => $request->status,
                'payment_status' => $request->payment_status,
            ]);

        $recentAppointmentBookings = $recent->map(fn ($appointment) => [
            'id' => 'appointment-' . $appointment->id,
            'type' => 'appointment',
            'pet' => $appointment->pet,
            'service' => $appointment->service,
            'pet_name' => $appointment->pet?->name,
            'service_name' => $appointment->service?->name,
            'scheduled_at' => $appointment->scheduled_at,
            'status' => $appointment->status,
            'payment_status' => $appointment->payment_status ?? null,
        ]);

        $recentBookings = $recentServiceRequests
            ->concat($recentAppointmentBookings)
            ->sortByDesc('scheduled_at')
            ->values()
            ->take(5);

        return response()->json([
            'active_bookings' => $activeBookings,
            'total_pets' => Pet::where('customer_id', $cust->id)->count(),
            'completed_services' => $completed,
            'loyalty_points' => $loyaltyPoints,
            'member_status' => $memberStatus,
            'pending_orders' => $pendingOrders,
            'pending_service_requests' => $pendingServiceRequests,
            'pending_requests' => $pendingServiceRequests,
            'approved_service_requests' => $approvedServiceRequests,
            'appointed_appointments' => $activeBookings + $approvedServiceRequests,
            'payment_pending' => $paymentPending,
            'payment_paid' => $paymentPaid,
            'paid_services' => $paymentPaid,
            'unread_notifications' => Notification::forUserOrRole($user->id, $user->role)->unread()->count(),
            'upcoming_appointments' => $upcoming,
            'recent_bookings' => $recentBookings,
            'recent_pets' => Pet::where('customer_id', $cust->id)->latest()->limit(3)->get(),
        ]);
    }

    public function pets()
    {
        $cust = $this->currentCustomer();
        if (!$cust) return response()->json([]);
        return response()->json(Pet::where('customer_id', $cust->id)->get());
    }

    public function appointments()
    {
        $cust = $this->currentCustomer();
        if (!$cust) return response()->json([]);
        return response()->json(
            Appointment::where('customer_id', $cust->id)
                ->with(['pet', 'service'])
                ->latest('scheduled_at')
                ->get()
        );
    }

    /**
     * Unified active/upcoming booking feed for the floating tracker widget.
     * Merges service requests, appointments, groomings, and boardings —
     * deduplicated via service_request_id (the promoted record wins).
     */
    public function tracking()
    {
        $cust = $this->currentCustomer();
        if (!$cust) {
            return response()->json(['success' => true, 'items' => []]);
        }

        $petIds = Pet::where('customer_id', $cust->id)->pluck('id');
        $items = collect();
        $promotedRequestIds = collect();

        $statusLabels = [
            'pending' => 'Pending Approval', 'approved' => 'Approved', 'scheduled' => 'Scheduled',
            'confirmed' => 'Confirmed', 'rescheduled' => 'Rescheduled', 'in_progress' => 'In Progress',
            'checked_in' => 'Checked In', 'in_care' => 'In Care', 'ready_for_pickup' => 'Ready for Pickup',
            'checked_out' => 'Picked Up', 'completed' => 'Completed', 'treated' => 'Treated',
        ];

        $boardingSteps = ['pending' => 0, 'approved' => 1, 'scheduled' => 1, 'confirmed' => 1,
            'checked_in' => 2, 'in_care' => 3, 'ready_for_pickup' => 4, 'checked_out' => 5, 'completed' => 5];
        $appointmentSteps = ['pending' => 0, 'approved' => 1, 'scheduled' => 2, 'confirmed' => 2,
            'in_progress' => 3, 'checked_in' => 3, 'treated' => 4, 'completed' => 5];
        $groomingSteps = ['pending' => 0, 'approved' => 1, 'scheduled' => 2, 'confirmed' => 2,
            'in_progress' => 3, 'checked_in' => 3, 'completed' => 4];
        $requestSteps = ['pending' => 0, 'approved' => 1, 'scheduled' => 2, 'confirmed' => 2,
            'rescheduled' => 2, 'in_progress' => 3, 'checked_in' => 3];

        $makeItem = function ($id, $kind, $serviceType, $serviceLabel, $petName, $date, $time, $status, $steps, $stepCount, $extra = []) use ($statusLabels) {
            $status = strtolower((string) $status) ?: 'pending';
            return [
                'id' => $id,
                'kind' => $kind,
                'service_type' => $serviceType,
                'service_label' => $serviceLabel,
                'pet_name' => $petName,
                'date' => $date,
                'time' => $time,
                'status' => $status,
                'status_label' => $statusLabels[$status] ?? ucwords(str_replace('_', ' ', $status)),
                'step_index' => $steps[$status] ?? 0,
                'step_count' => $stepCount,
                'payment_status' => $extra['payment_status'] ?? null,
                'check_in' => $extra['check_in'] ?? null,
                'check_out' => $extra['check_out'] ?? null,
                'room_name' => $extra['room_name'] ?? null,
                'updated_at' => $extra['updated_at'] ?? null,
            ];
        };

        // Boardings — hotel stays carry the richest live statuses
        Boarding::where(function ($q) use ($cust, $petIds) {
                $q->where('customer_id', $cust->id);
                if ($petIds->isNotEmpty()) {
                    $q->orWhereIn('pet_id', $petIds);
                }
            })
            ->whereIn('status', ['pending', 'approved', 'scheduled', 'confirmed', 'checked_in', 'in_care', 'ready_for_pickup'])
            ->with(['pet', 'hotelRoom'])
            ->get()
            ->each(function ($b) use ($items, $promotedRequestIds, $makeItem, $boardingSteps) {
                if ($b->service_request_id) {
                    $promotedRequestIds->push((int) $b->service_request_id);
                }
                $items->push($makeItem(
                    'boarding-' . $b->id, 'boarding', 'hotel', 'Pet Hotel',
                    $b->pet?->name ?? $b->pet_name,
                    optional($b->check_in)->toDateString(),
                    $b->check_in_time,
                    $b->status, $boardingSteps, 6,
                    [
                        'payment_status' => $b->payment_status,
                        'check_in' => optional($b->check_in)->toDateString(),
                        'check_out' => optional($b->check_out)->toDateString(),
                        'room_name' => $b->hotelRoom?->name ?? $b->hotelRoom?->room_name ?? null,
                        'updated_at' => $b->updated_at,
                    ]
                ));
            });

        // Groomings — promoted grooming requests with live status
        if (Schema::hasTable('groomings')) {
            Grooming::where('customer_id', $cust->id)
                ->whereIn('status', ['pending', 'approved', 'scheduled', 'confirmed', 'in_progress', 'checked_in'])
                ->with('pet')
                ->get()
                ->each(function ($g) use ($items, $promotedRequestIds, $makeItem, $groomingSteps) {
                    if ($g->service_request_id) {
                        $promotedRequestIds->push((int) $g->service_request_id);
                    }
                    $items->push($makeItem(
                        'grooming-' . $g->id, 'grooming', 'grooming',
                        $g->service ?? 'Grooming',
                        $g->pet?->name,
                        $g->appointment_date ? Carbon::parse($g->appointment_date)->toDateString() : null,
                        $g->appointment_time,
                        $g->status, $groomingSteps, 5,
                        ['payment_status' => $g->payment_status, 'updated_at' => $g->updated_at]
                    ));
                });
        }

        // Appointments — vet visits
        Appointment::where('customer_id', $cust->id)
            ->whereIn('status', ['pending', 'approved', 'scheduled', 'confirmed', 'in_progress', 'checked_in', 'treated'])
            ->with(['pet', 'service'])
            ->get()
            ->each(function ($a) use ($items, $promotedRequestIds, $makeItem, $appointmentSteps) {
                if ($a->service_request_id) {
                    $promotedRequestIds->push((int) $a->service_request_id);
                }
                $scheduledAt = $a->scheduled_at ? Carbon::parse($a->scheduled_at) : null;
                $items->push($makeItem(
                    'appointment-' . $a->id, 'appointment', 'vet',
                    $a->service?->name ?? 'Vet Visit',
                    $a->pet?->name,
                    $scheduledAt?->toDateString(),
                    $scheduledAt?->format('H:i'),
                    $a->status, $appointmentSteps, 6,
                    ['payment_status' => $a->payment_status ?? null, 'updated_at' => $a->updated_at]
                ));
            });

        // Service requests still awaiting promotion (pending etc.)
        // service_requests.customer_id stores users.id — match customerRequests() scoping
        $user = auth()->user();
        ServiceRequest::query()
            ->where(function ($q) use ($user) {
                if (Schema::hasColumn('service_requests', 'customer_id') && $user) {
                    $q->where('customer_id', $user->id);
                }
                if (Schema::hasColumn('service_requests', 'customer_email') && $user?->email) {
                    $q->orWhere('customer_email', $user->email);
                }
            })
            ->whereIn('status', array_keys($requestSteps))
            ->get()
            ->reject(fn ($r) => $promotedRequestIds->contains((int) $r->id))
            ->each(function ($r) use ($items, $makeItem, $requestSteps) {
                $type = strtolower((string) ($r->request_type ?? ''));
                $serviceType = str_contains($type, 'hotel') || str_contains($type, 'boarding') ? 'hotel'
                    : (str_contains($type, 'groom') ? 'grooming' : 'vet');
                $items->push($makeItem(
                    'request-' . $r->id, 'request', $serviceType,
                    $r->service_name ?? ucwords(str_replace(['_', '-'], ' ', $type ?: 'Booking')),
                    $r->pet_name,
                    $r->request_date ? Carbon::parse($r->request_date)->toDateString() : null,
                    $r->request_time,
                    $r->status, $requestSteps, 4,
                    ['payment_status' => $r->payment_status, 'updated_at' => $r->updated_at]
                ));
            });

        $activeStay = fn ($item) => in_array($item['status'], ['checked_in', 'in_care', 'ready_for_pickup']);

        $sorted = $items->sortBy([
            fn ($a, $b) => $activeStay($b) <=> $activeStay($a),
            fn ($a, $b) => strcmp($a['date'] ?? '9999', $b['date'] ?? '9999'),
        ])->values();

        return response()->json([
            'success' => true,
            'items' => $sorted,
            'count' => $sorted->count(),
        ]);
    }

    public function bookings()
    {
        $cust = $this->currentCustomer();
        if (!$cust) return response()->json([]);

        $appointments = Appointment::where('customer_id', $cust->id)
            ->with(['pet', 'service'])
            ->latest('scheduled_at')
            ->get()
            ->map(fn ($appointment) => [
                'id' => 'appointment-' . $appointment->id,
                'service' => $appointment->service?->name ?? 'Veterinary Appointment',
                'type' => 'appointment',
                'pet' => $appointment->pet?->name,
                'date' => optional($appointment->scheduled_at)?->toDateString(),
                'status' => $appointment->status,
                'amount' => $appointment->price,
            ]);

        $boardingPetIds = Pet::where('customer_id', $cust->id)->pluck('id');
        $boardings = Boarding::whereIn('pet_id', $boardingPetIds)
            ->with('pet')
            ->latest('check_in')
            ->get()
            ->map(fn ($boarding) => [
                'id' => 'boarding-' . $boarding->id,
                'service' => 'Hotel Boarding',
                'type' => 'boarding',
                'pet' => $boarding->pet?->name,
                'date' => optional($boarding->check_in)?->toDateString(),
                'status' => $boarding->status,
                'amount' => $boarding->total_amount ?? $boarding->amount ?? 0,
            ]);

        return response()->json($appointments->concat($boardings)->values());
    }

    public function transactions()
    {
        $cust = $this->currentCustomer();
        if (!$cust) return response()->json([]);

        return response()->json(
            Sale::where('customer_id', $cust->id)
                ->latest()
                ->limit(50)
                ->get()
                ->map(fn ($sale) => [
                    'id' => $sale->id,
                    'date' => optional($sale->created_at)?->toDateString(),
                    'description' => ucfirst($sale->type ?? 'payment'),
                    'type' => $sale->type,
                    'amount' => $sale->amount,
                    'status' => $sale->status,
                ])
        );
    }

    public function purchases()
    {
        $cust = $this->currentCustomer();
        if (!$cust) return response()->json([]);

        return response()->json([
            'purchases' => Sale::with('items')
                ->where('customer_id', $cust->id)
                ->whereIn('type', ['product', 'mixed'])
                ->latest()
                ->limit(50)
                ->get(),
        ]);
    }

    public function boardings()
    {
        $cust = $this->currentCustomer();
        if (!$cust) return response()->json([]);
        return response()->json(Boarding::whereIn('pet_id', Pet::where('customer_id',$cust->id)->pluck('id'))->get());
    }

    public function addPet(Request $request)
    {
        $cust = $this->currentCustomer();
        if (!$cust) return response()->json(['message' => 'Customer not found'], 404);

        $data = $request->validate([
            'name' => 'required|string|max:100',
            'species' => 'nullable|string|max:100',
            'breed' => 'nullable|string|max:100',
            'age' => 'nullable|integer|min:0',
            'gender' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $petData = array_merge($data, ['customer_id' => $cust->id]);

        $pet = $request->hasFile('image')
            ? FileStorageService::storeAndPersist(
                $request->file('image'), 'pet_photos', 'private',
                fn (string $path) => Pet::create(['image' => $path] + $petData)
            )
            : Pet::create($petData);
        return response()->json([
            'pet' => $pet,
            'image_url' => $pet->image_url,
        ], 201);
    }

    public function deletePet($id)
    {
        $cust = $this->currentCustomer();
        if (!$cust) return response()->json(['message' => 'Customer not found'], 404);

        $pet = Pet::where('id', $id)->where('customer_id', $cust->id)->first();
        if (!$pet) {
            return response()->json(['message' => 'Pet not found'], 404);
        }

        $hasActiveAppointment = $pet->appointments()
            ->whereIn('status', ['pending', 'pending_review', 'approved', 'scheduled', 'in_progress', 'in_consultation', 'needs_confinement', 'treated'])
            ->whereDate('scheduled_at', '>=', now())
            ->exists();
        $hasActiveGrooming = $pet->groomingAppointments()
            ->whereIn('status', ['pending', 'pending_review', 'approved', 'scheduled'])
            ->where(function ($query) {
                $today = now()->toDateString();
                $query->whereDate('request_date', '>=', $today)
                      ->orWhereDate('preferred_date', '>=', $today);
            })
            ->exists();
        $hasActiveBoarding = $pet->boardings()
            ->whereIn('status', ['pending', 'pending_review', 'approved', 'checked_in'])
            ->whereDate('check_out_date', '>=', now())
            ->exists();

        if ($hasActiveAppointment || $hasActiveGrooming || $hasActiveBoarding) {
            return response()->json([
                'message' => 'This pet cannot be deleted because it has an active booking or appointment.',
            ], 422);
        }

        $pet->delete();
        return response()->json(['message' => 'Pet deleted successfully']);
    }

    public function services()
    {
        return response()->json(Service::where('is_active', true)->orderBy('name')->get());
    }

    public function notificationPreferences()
    {
        $customer = $this->currentCustomer();
        if (!$customer) return response()->json(['message' => 'Customer profile not found'], 404);

        $prefs = $customer->notification_preferences ?? [];

        return response()->json([
            'email' => ($prefs['email'] ?? true) !== false,
        ]);
    }

    public function updateNotificationPreferences(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|boolean',
        ]);

        $customer = $this->currentCustomer();
        if (!$customer) return response()->json(['message' => 'Customer profile not found'], 404);

        $customer->update([
            'notification_preferences' => array_merge(
                $customer->notification_preferences ?? [],
                ['email' => (bool) $validated['email']]
            ),
        ]);

        return response()->json([
            'email' => (bool) $validated['email'],
        ]);
    }

    public function bookAppointment(Request $request)
    {
        $cust = $this->currentCustomer();
        if (!$cust) return response()->json(['message' => 'Customer not found'], 404);

        $data = $request->validate([
            'pet_id' => 'required|integer|exists:pets,id',
            'service_id' => 'required|integer|exists:services,id',
            'scheduled_at' => 'required|date',
        ]);

        if (!Pet::where('id', $data['pet_id'])->where('customer_id', $cust->id)->exists()) {
            return response()->json(['message' => 'Pet not found'], 404);
        }

        $appt = Appointment::create([
            'customer_id' => $cust->id,
            'pet_id' => $data['pet_id'],
            'service_id' => $data['service_id'],
            'status' => 'pending',
            'scheduled_at' => $data['scheduled_at'],
            'price' => Service::find($data['service_id'])->price ?? 0,
        ]);

        return response()->json($appt, 201);
    }

    public function bookBoarding(Request $request)
    {
        $cust = $this->currentCustomer();
        if (!$cust) return response()->json(['message' => 'Customer not found'], 404);

        $data = $request->validate([
            'pet_id' => 'required|integer|exists:pets,id',
            'check_in' => 'required|date',
            'check_out' => 'nullable|date',
        ]);

        if (!Pet::where('id', $data['pet_id'])->where('customer_id', $cust->id)->exists()) {
            return response()->json(['message' => 'Pet not found'], 404);
        }

        $boarding = Boarding::create([
            'pet_id' => $data['pet_id'],
            'check_in' => $data['check_in'],
            'check_out' => $data['check_out'] ?? null,
            'status' => 'checked_in',
        ]);

        return response()->json($boarding, 201);
    }

    public function chatbot(Request $request)
    {
        $data = $request->validate([
            'message' => 'required|string',
            'type' => 'nullable|string',
        ]);
        $user = $request->user();

        $log = ChatbotLog::create([
            'user_id' => $user?->id,
            'role' => $user?->role,
            'channel' => 'web',
            'message' => $data['message'],
            'type' => $data['type'] ?? 'inquiry',
            'user_message' => $data['message'],
        ]);

        return response()->json($log, 201);
    }
}
