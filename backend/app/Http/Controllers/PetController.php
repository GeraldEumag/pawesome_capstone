<?php

namespace App\Http\Controllers;

use App\Models\Pet;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PetController extends Controller
{
    private function currentCustomer(Request $request): ?Customer
    {
        $user = $request->user();

        if (!$user) {
            return null;
        }

        return Customer::where('user_id', $user->id)
            ->orWhere('email', $user->email)
            ->first();
    }

    private function customerOwnsPet(Request $request, Pet $pet): bool
    {
        $customer = $this->currentCustomer($request);

        return $customer && (int) $pet->customer_id === (int) $customer->id;
    }

    public function index(Request $request)
    {
        $user = $request->user();

        if ($user && $user->role !== 'customer') {
            return response()->json([
                'pets' => Pet::with('customer')->where(function ($q) {
                    $q->whereNull('archived_at')
                      ->where(function ($inner) {
                          $inner->whereNull('status')
                                ->orWhere('status', '!=', 'archived');
                      });
                })->latest()->get(),
            ]);
        }

        $customer = $this->currentCustomer($request);

        if (!$customer) {
            return response()->json([
                'pets' => [],
            ]);
        }

        $pets = Pet::where('customer_id', $customer->id)
            ->where(function ($q) {
                $q->whereNull('archived_at')
                  ->where(function ($inner) {
                      $inner->whereNull('status')
                            ->orWhere('status', '!=', 'archived');
                  });
            })
            ->latest()
            ->get();

        return response()->json([
            'pets' => $pets,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'species' => 'required|string|max:255',
            'breed' => 'nullable|string|max:255',
            'birthdate' => 'nullable|date|before_or_equal:today',
            'birth_date' => 'nullable|date|before_or_equal:today',
            'age' => 'nullable|integer|min:0',
            'gender' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $user = $request->user();

        $customer = Customer::firstOrCreate(
            ['email' => $user->email],
            [
                'user_id' => $user->id,
                'name' => $user->name ?? trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')),
                'phone' => $user->phone ?? null,
                'address' => $user->address ?? null,
                'is_active' => true,
            ]
        );

        $petData = [
            'customer_id' => $customer->id,
            'name' => $validated['name'],
            'species' => $validated['species'],
            'breed' => $validated['breed'] ?? null,
            'birthdate' => $validated['birthdate'] ?? $validated['birth_date'] ?? null,
            'birth_date' => $validated['birth_date'] ?? $validated['birthdate'] ?? null,
            'age' => null,
            'gender' => $validated['gender'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ];

        if ($request->hasFile('image')) {
            $petData['image'] = $request->file('image')->store('pet_photos', 'public');
        }

        $pet = Pet::create($petData);

        return response()->json([
            'message' => 'Pet added successfully.',
            'pet' => $pet,
            'image_url' => $pet->image_url,
        ], 201);
    }

    public function show(Request $request, $id)
    {
        $pet = Pet::findOrFail($id);

        if ($request->user()?->role === 'customer' && !$this->customerOwnsPet($request, $pet)) {
            return response()->json(['message' => 'Pet not found'], 404);
        }

        return response()->json(['pet' => $pet]);
    }

    public function update(Request $request, $id)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'species' => 'required|string|max:255',
            'breed' => 'nullable|string|max:255',
            'birthdate' => 'nullable|date|before_or_equal:today',
            'birth_date' => 'nullable|date|before_or_equal:today',
            'age' => 'nullable|integer|min:0',
            'gender' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $pet = Pet::findOrFail($id);

        if ($request->user()?->role === 'customer' && !$this->customerOwnsPet($request, $pet)) {
            return response()->json(['message' => 'Pet not found'], 404);
        }

        $validated['birthdate'] = $validated['birthdate'] ?? $validated['birth_date'] ?? null;
        $validated['birth_date'] = $validated['birth_date'] ?? $validated['birthdate'] ?? null;
        $validated['age'] = null;

        if ($request->hasFile('image')) {
            if ($pet->image) {
                Storage::disk('public')->delete($pet->image);
            }
            $validated['image'] = $request->file('image')->store('pet_photos', 'public');
        }

        $pet->update($validated);

        return response()->json([
            'message' => 'Pet updated successfully',
            'pet' => $pet,
            'image_url' => $pet->image_url,
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $pet = Pet::findOrFail($id);

        if ($request->user()?->role === 'customer' && !$this->customerOwnsPet($request, $pet)) {
            return response()->json(['message' => 'Pet not found'], 404);
        }

        // Check if pet has active bookings before allowing deletion
        $activeBookings = $this->getActiveBookings($pet);
        
        if ($activeBookings->isNotEmpty()) {
            return response()->json([
                'message' => 'This pet cannot be deleted because it has an active booking or appointment.',
                'active_bookings' => $activeBookings
            ], 422);
        }

        // Archive the pet instead of hard delete to preserve historical records
        $pet->update([
            'status' => 'archived',
            'archived_at' => now(),
            'archived_by' => $request->user()->id,
            'archive_reason' => 'Deleted via legacy endpoint - migrated to archive'
        ]);

        return response()->json(['message' => 'Pet archived successfully']);
    }

    public function archive(Request $request, $id)
    {
        $pet = Pet::findOrFail($id);

        if ($request->user()?->role === 'customer' && !$this->customerOwnsPet($request, $pet)) {
            return response()->json(['message' => 'Pet not found'], 404);
        }

        // Check if pet has active bookings
        $activeBookings = $this->getActiveBookings($pet);
        
        if ($activeBookings->isNotEmpty()) {
            return response()->json([
                'message' => 'This pet cannot be archived because it has an active booking or appointment.',
                'active_bookings' => $activeBookings
            ], 422);
        }

        // Archive the pet
        $pet->update([
            'status' => 'archived',
            'archived_at' => now(),
            'archived_by' => $request->user()->id,
            'archive_reason' => $request->input('archive_reason') ?: 'Customer request'
        ]);

        return response()->json([
            'message' => 'Pet archived successfully',
            'pet' => $pet
        ]);
    }

    /**
     * Get active bookings for a pet
     */
    private function getActiveBookings(Pet $pet)
    {
        $bookings = collect([]);
        
        // Check veterinary appointments
        $vetAppointments = $pet->appointments()
            ->whereIn('status', ['pending', 'pending_review', 'approved', 'scheduled', 'in_progress', 'in_consultation', 'needs_confinement', 'treated'])
            ->whereDate('scheduled_at', '>=', now())
            ->get();
            
        if ($vetAppointments->isNotEmpty()) {
            $bookings = $bookings->merge($vetAppointments->map(function ($appointment) {
                return (object) [
                    'type' => 'veterinary_appointment',
                    'date' => $appointment->scheduled_at,
                    'status' => $appointment->status
                ];
            }));
        }
        
        // Check grooming service requests
        $groomingServiceRequests = $pet->groomingAppointments()
            ->whereIn('status', ['pending', 'pending_review', 'approved', 'scheduled'])
            ->where(function ($query) {
                $today = now()->toDateString();
                $query->whereDate('request_date', '>=', $today)
                      ->orWhereDate('preferred_date', '>=', $today);
            })
            ->get();
            
        if ($groomingServiceRequests->isNotEmpty()) {
            $bookings = $bookings->merge($groomingServiceRequests->map(function ($appointment) {
                return (object) [
                    'type' => 'grooming_service_request',
                    'date' => $appointment->request_date ?? $appointment->preferred_date,
                    'status' => $appointment->status
                ];
            }));
        }
        
        // Check boarding reservations
        $boardingReservations = $pet->boardings()
            ->whereIn('status', ['pending', 'pending_review', 'approved', 'scheduled', 'checked_in', 'in_stay'])
            ->where(function ($query) {
                $query->where('check_in', '>=', now())
                   ->orWhere('check_out', '>=', now());
            })
            ->get();
            
        if ($boardingReservations->isNotEmpty()) {
            $bookings = $bookings->merge($boardingReservations->map(function ($reservation) {
                return (object) [
                    'type' => 'boarding_reservation',
                    'check_in' => $reservation->check_in,
                    'check_out' => $reservation->check_out,
                    'status' => $reservation->status
                ];
            }));
        }
        
        return $bookings;
    }

    /**
     * Get archived pets
     */
    public function archived(Request $request)
    {
        $query = Pet::where(function ($q) {
                $q->where('status', 'archived')
                  ->orWhereNotNull('archived_at');
            })
            ->with(['customer', 'archivedBy'])
            ->orderBy('archived_at', 'desc');

        // Enforce customer ownership for customer role
        if ($request->user()?->role === 'customer') {
            $customer = $this->currentCustomer($request);
            if ($customer) {
                $query->where('customer_id', $customer->id);
            }
        }
        // Filter by customer if specified (for admin/staff)
        elseif ($request->has('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        // Search functionality
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('species', 'like', "%{$search}%")
                  ->orWhere('breed', 'like', "%{$search}%");
            });
        }

        $pets = $query->paginate($request->per_page ?? 20);

        return response()->json(array_merge($pets->toArray(), [
            'pets' => $pets->items(),
        ]));
    }

    /**
     * Unarchive a pet
     */
    public function unarchive(Request $request, $id)
    {
        $pet = Pet::findOrFail($id);

        if ($request->user()?->role === 'customer' && !$this->customerOwnsPet($request, $pet)) {
            return response()->json(['message' => 'Pet not found'], 404);
        }

        $pet->update([
            'status' => 'active',
            'archived_at' => null,
            'archived_by' => null,
        ]);

        return response()->json([
            'message' => 'Pet unarchived successfully',
            'pet' => $pet
        ]);
    }
}
