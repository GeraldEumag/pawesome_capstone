<?php

namespace App\Http\Controllers;

use App\Models\Holiday;
use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\Service;
use App\Services\BookingAvailabilityService;
use App\Services\BoardingRoomService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;

class ChatbotWorkflowController extends Controller
{
    /**
     * Boarding statuses that occupy/hold a room and therefore block new
     * overlapping bookings. Terminal statuses (checked_out, completed,
     * cancelled, rejected) do not block.
     */
    private const BLOCKING_BOARDING_STATUSES = [
        'pending',
        'approved',
        'scheduled',
        'confirmed',
        'checked_in',
        'in_care',
        'ready_for_pickup',
    ];

    public function bookingOptions(Request $request): JsonResponse
    {
        $user = $request->user();
        $customer = $user ? Customer::where('email', $user->email)->first() : null;
        $pets = $customer ? Pet::where('customer_id', $customer->id)->orderBy('name')->get(['id', 'name', 'species', 'breed']) : [];
        $services = Service::query()->orderBy('name')->get(['id', 'name', 'price']);

        return response()->json([
            'pets' => $pets,
            'services' => $services,
        ]);
    }

    public function createBooking(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || $user->role !== 'customer') {
            return response()->json(['message' => 'Only customer accounts can create chatbot bookings.'], 403);
        }

        $customer = Customer::where('email', $user->email)->first();
        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found.'], 404);
        }

        $data = $request->validate([
            'pet_id' => 'required|integer',
            'service_id' => 'required|integer|exists:services,id',
            'scheduled_at' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        $pet = Pet::where('customer_id', $customer->id)->find($data['pet_id']);
        if (!$pet) {
            return response()->json(['message' => 'Selected pet does not belong to the current customer.'], 422);
        }

        $service = Service::findOrFail($data['service_id']);
        [$scheduledAtUtc, $scheduledAtLocal] = BookingAvailabilityService::appointmentTimes($data['scheduled_at']);
        if (!$scheduledAtUtc->isFuture()) {
            return response()->json(['errors' => ['scheduled_at' => ['The scheduled time must be in the future.']]], 422);
        }

        $appointment = DB::transaction(function () use ($customer, $pet, $service, $data, $scheduledAtUtc, $scheduledAtLocal) {
            BookingAvailabilityService::lockServiceSchedule();
            $serviceType = strtolower((string) $service->category) === 'grooming' ? 'grooming' : 'veterinary';
            if (!BookingAvailabilityService::isServiceTimeAvailable(
                $serviceType,
                $scheduledAtLocal->toDateString(),
                $scheduledAtLocal->format('H:i'),
                $service->name
            )) {
                return null;
            }

            return Appointment::create([
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'status' => 'requested',
                'scheduled_at' => $scheduledAtUtc,
                'price' => $service->price ?? 0,
                'notes' => $data['notes'] ?? null,
                'booking_channel' => \App\Support\BookingChannel::ONLINE,
            ]);
        });

        if (!$appointment) {
            return response()->json([
                'message' => 'This schedule is no longer available. Please choose another slot.',
                'errors' => ['scheduled_at' => ['Time slot overlaps an existing booking.']],
            ], 422);
        }

        return response()->json([
            'message' => 'Booking created successfully.',
            'appointment' => $appointment->load(['pet', 'service']),
        ], 201);
    }

    public function lookupAppointments(Request $request): JsonResponse
    {
        $data = $request->validate([
            'query' => 'nullable|string|max:255',
        ]);

        $user = $request->user();
        $queryText = trim($data['query'] ?? '');
        $appointments = Appointment::query()->with(['customer', 'pet', 'service']);

        if ($user?->role === 'customer') {
            $customer = Customer::where('email', $user->email)->first();
            $appointments->where('customer_id', $customer?->id ?? 0);
        }

        if ($queryText !== '') {
            $appointments->where(function ($query) use ($queryText) {
                $query
                    ->where('status', 'like', "%{$queryText}%")
                    ->orWhereHas('customer', fn ($customerQuery) => $customerQuery->where('name', 'like', "%{$queryText}%"))
                    ->orWhereHas('pet', fn ($petQuery) => $petQuery->where('name', 'like', "%{$queryText}%"))
                    ->orWhereHas('service', fn ($serviceQuery) => $serviceQuery->where('name', 'like', "%{$queryText}%"));
            });
        }

        return response()->json(
            $appointments
                ->orderBy('scheduled_at')
                ->limit(10)
                ->get()
                ->map(function (Appointment $appointment) {
                    return [
                        'id' => $appointment->id,
                        'status' => $appointment->status,
                        'scheduled_at' => optional($appointment->scheduled_at)->toDateTimeString(),
                        'customer' => $appointment->customer?->name,
                        'pet' => $appointment->pet?->name,
                        'service' => $appointment->service?->name,
                        'price' => $appointment->price,
                    ];
                })
        );
    }

    public function searchInventory(Request $request): JsonResponse
    {
        $data = $request->validate([
            'query' => 'required|string|max:255',
        ]);

        $queryText = trim($data['query']);
        $role = $request->user()?->role ?? 'guest';
        // Internal fields (reorder level, expiry, status) are stock-management
        // data — only the roles that own it may see them.
        $privileged = in_array($role, ['inventory', 'manager', 'admin'], true);
        $staff = in_array($role, ['receptionist', 'cashier', 'veterinary', 'super_receptionist'], true);

        return response()->json(
            InventoryItem::query()
                ->where(function ($query) use ($queryText) {
                    $query
                        ->where('name', 'like', "%{$queryText}%")
                        ->orWhere('sku', 'like', "%{$queryText}%")
                        ->orWhere('description', 'like', "%{$queryText}%");
                })
                ->orderBy('name')
                ->limit(10)
                ->get(['id', 'sku', 'name', 'category', 'stock', 'reorder_level', 'price', 'expiry_date', 'status'])
                ->map(function (InventoryItem $item) use ($privileged, $staff) {
                    if ($privileged) {
                        return [
                            'id' => $item->id,
                            'sku' => $item->sku,
                            'name' => $item->name,
                            'category' => $item->category,
                            'stock' => $item->stock,
                            'reorder_level' => $item->reorder_level,
                            'price' => $item->price,
                            'expiry_date' => optional($item->expiry_date)->toDateString(),
                            'status' => $item->status,
                        ];
                    }

                    if ($staff) {
                        return [
                            'id' => $item->id,
                            'sku' => $item->sku,
                            'name' => $item->name,
                            'category' => $item->category,
                            'stock' => $item->stock,
                            'price' => $item->price,
                        ];
                    }

                    // Customer / guest-level: availability only, no internals.
                    return [
                        'id' => $item->id,
                        'name' => $item->name,
                        'category' => $item->category,
                        'price' => $item->price,
                        'in_stock' => $item->stock > 0,
                    ];
                })
        );
    }

    // Hotel Booking Workflow Methods
    public function hotelOptions(Request $request): JsonResponse
    {
        $user = $request->user();
        $customer = $user ? Customer::where('email', $user->email)->first() : null;
        $pets = $customer ? Pet::where('customer_id', $customer->id)->orderBy('name')->get(['id', 'name', 'species', 'breed']) : [];
        // Boarding/daycare room catalog — the modern room system.
        $rooms = \App\Models\BoardingRoom::where('is_active', true)
            ->where('customer_selectable', true)
            ->orderBy('daily_rate')
            ->get()
            ->map(fn ($room) => [
                'id' => $room->id,
                'room_number' => $room->room_code,
                'name' => $room->room_name,
                'type' => $room->room_type,
                'size' => null,
                'daily_rate' => $room->daily_rate,
                'allowed_species' => $room->allowed_species,
            ]);

        return response()->json([
            'pets' => $pets,
            'rooms' => $rooms,
        ]);
    }

    public function checkHotelAvailability(Request $request): JsonResponse
    {
        $data = $request->validate([
            'check_in' => 'required|date',
            'check_out' => 'nullable|date|after_or_equal:check_in',
            'room_type' => 'nullable|string|in:' . implode(',', \App\Models\BoardingRoom::VALID_ROOM_TYPES),
        ]);

        // Same-day boarding: check-out equals check-in (store open 10 AM - 6 PM)
        $data['check_out'] = $data['check_in'];

        if ($holiday = Holiday::blockedNameOn($data['check_in'])) {
            return response()->json([
                'check_in' => $data['check_in'],
                'check_out' => $data['check_out'],
                'available_rooms' => [],
                'count' => 0,
                'holiday' => $holiday,
                'message' => "Pawesome is closed on this public holiday ({$holiday}).",
            ]);
        }

        // Available boarding rooms for the date
        $query = \App\Models\BoardingRoom::where('is_active', true);

        if (!empty($data['room_type'])) {
            $query->where('room_type', $data['room_type']);
        }

        $availableRooms = $query->orderBy('daily_rate')->get()
            ->filter(fn ($room) => $room->isAvailable($data['check_in'], $data['check_out']))
            ->values();

        return response()->json([
            'check_in' => $data['check_in'],
            'check_out' => $data['check_out'],
            'available_rooms' => $availableRooms,
            'count' => $availableRooms->count(),
        ]);
    }

    public function createHotelBooking(Request $request, BoardingRoomService $boardingRoomService): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'pet_id' => 'required|integer',
            'room_id' => 'nullable|integer|exists:boarding_rooms,id',
            'hotel_room_id' => 'nullable|integer|exists:hotel_rooms,id',
            'check_in' => 'required|date',
            'check_out' => 'nullable|date|after_or_equal:check_in',
            'special_requests' => 'nullable|string|max:1000',
        ]);

        // Same-day boarding: check-out equals check-in (store open 10 AM - 6 PM)
        $data['check_out'] = $data['check_in'];

        if ($holiday = Holiday::blockedNameOn($data['check_in'])) {
            return response()->json(['message' => "Pawesome is closed on this public holiday ({$holiday})."], 422);
        }

        // Get customer
        if ($user?->role === 'customer') {
            $customer = Customer::where('email', $user->email)->first();
            if (!$customer) {
                return response()->json(['message' => 'Customer profile not found.'], 404);
            }
            // Verify pet belongs to customer
            $pet = Pet::where('customer_id', $customer->id)->find($data['pet_id']);
            if (!$pet) {
                return response()->json(['message' => 'Selected pet does not belong to the current customer.'], 422);
            }
        } else {
            // For staff, just verify pet exists
            $pet = Pet::find($data['pet_id']);
            if (!$pet) {
                return response()->json(['message' => 'Pet not found.'], 404);
            }
            $customer = Customer::find($pet->customer_id);
        }

        // Find or auto-assign room — boarding_rooms preferred, hotel_rooms
        // kept for legacy clients that still send hotel_room_id.
        $room = null;
        $boardingRoom = null;
        if (!empty($data['room_id'])) {
            $boardingRoom = \App\Models\BoardingRoom::find($data['room_id']);
            if (!$boardingRoom || !$boardingRoom->is_active) {
                return response()->json(['message' => 'Selected room is not available.'], 422);
            }
            if (!in_array(strtolower((string) $pet->species), array_map('strtolower', $boardingRoom->allowed_species ?? []), true)) {
                return response()->json(['message' => 'Selected room does not accept this pet species.'], 422);
            }
            if (!$boardingRoom->isAvailable($data['check_in'], $data['check_out'])) {
                return response()->json(['message' => 'Selected room is not available for those dates.'], 422);
            }
        } elseif (!empty($data['hotel_room_id'])) {
            $room = HotelRoom::find($data['hotel_room_id']);
            if ($room->status !== 'available') {
                return response()->json(['message' => 'Selected room is not available.'], 422);
            }
            // Check if room is booked for the selected date
            $conflict = Boarding::where('hotel_room_id', $room->id)
                ->whereIn('status', self::BLOCKING_BOARDING_STATUSES)
                ->where('check_in', '<=', $data['check_out'])
                ->where('check_out', '>=', $data['check_in'])
                ->exists();

            if ($conflict) {
                return response()->json(['message' => 'Selected room is not available for those dates.'], 422);
            }
        } else {
            // Auto-assign first available boarding room for the species
            $boardingRoom = \App\Models\BoardingRoom::where('is_active', true)
                ->where('customer_selectable', true)
                ->orderBy('daily_rate')
                ->get()
                ->first(fn ($r) =>
                    in_array(strtolower((string) $pet->species), array_map('strtolower', $r->allowed_species ?? []), true)
                    && $r->isAvailable($data['check_in'], $data['check_out']));

            if (!$boardingRoom) {
                return response()->json(['message' => 'No rooms available for the selected dates.'], 422);
            }
        }

        // One-day pricing (same-day boarding)
        $totalAmount = (float) ($boardingRoom?->daily_rate ?? $room->daily_rate);

        // Create boarding record — same lifecycle as BoardingController::store:
        // 'pending' until a receptionist approves it, channel from the actor.
        // Boarding-room bookings also reserve the room in the same transaction.
        $result = DB::transaction(function () use ($request, $pet, $customer, $room, $boardingRoom, $data, $totalAmount, $boardingRoomService) {
            $boarding = Boarding::create([
                'pet_id' => $pet->id,
                'customer_id' => $customer->id,
                'hotel_room_id' => $room?->id,
                'check_in' => $data['check_in'],
                'check_out' => $data['check_out'],
                'status' => 'pending',
                'special_requests' => $data['special_requests'] ?? null,
                'total_amount' => $totalAmount,
                'payment_status' => 'unpaid',
                'booking_channel' => \App\Support\BookingChannel::forUser($request->user()),
            ]);

            if ($boardingRoom) {
                $assignment = $boardingRoomService->assignRoomForBoarding($boarding, $boardingRoom->id, $data['check_in'], $data['check_out']);
                if (!($assignment['success'] ?? false)) {
                    return ['error' => $assignment['message'] ?? 'Selected room is not available.'];
                }
            }

            return ['boarding' => $boarding];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'message' => 'Hotel booking created successfully.',
            'boarding' => $result['boarding']->load(['pet', 'customer', 'hotelRoom']),
        ], 201);
    }
}
