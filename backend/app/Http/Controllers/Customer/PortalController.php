<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\Sale;
use App\Models\ChatbotLog;
use App\Models\Notification;
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
        $loyaltyPoints = ($paymentPaid * 100) + $completed * 50;
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

        if ($request->hasFile('image')) {
            $petData['image'] = $request->file('image')->store('pet_photos', 'public');
        }

        $pet = Pet::create($petData);
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

        $pet->delete();
        return response()->json(['message' => 'Pet deleted successfully']);
    }

    public function services()
    {
        return response()->json(Service::where('is_active', true)->orderBy('name')->get());
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
