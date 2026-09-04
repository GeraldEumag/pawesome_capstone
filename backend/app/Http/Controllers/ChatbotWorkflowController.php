<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChatbotWorkflowController extends Controller
{
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

        $appointment = Appointment::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'status' => 'pending',
            'scheduled_at' => $data['scheduled_at'],
            'price' => $service->price ?? 0,
            'notes' => $data['notes'] ?? null,
        ]);

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
                ->get(['id', 'sku', 'name', 'stock', 'reorder_level', 'price', 'expiry_date'])
                ->map(function (InventoryItem $item) {
                    return [
                        'id' => $item->id,
                        'sku' => $item->sku,
                        'name' => $item->name,
                        'stock' => $item->stock,
                        'reorder_level' => $item->reorder_level,
                        'price' => $item->price,
                        'expiry_date' => optional($item->expiry_date)->toDateString(),
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
        $rooms = HotelRoom::where('status', 'available')
            ->orderBy('daily_rate')
            ->get(['id', 'room_number', 'type', 'size', 'daily_rate', 'capacity']);

        return response()->json([
            'pets' => $pets,
            'rooms' => $rooms,
        ]);
    }

    public function checkHotelAvailability(Request $request): JsonResponse
    {
        $data = $request->validate([
            'check_in' => 'required|date',
            'check_out' => 'required|date|after:check_in',
            'room_type' => 'nullable|string|in:standard,deluxe,suite',
        ]);

        // Get available rooms for the date range
        $query = HotelRoom::where('status', 'available')
            ->whereDoesntHave('boardings', function ($q) use ($data) {
                $q->where('status', 'checked_in')
                    ->where(function ($dateQuery) use ($data) {
                        $dateQuery->whereBetween('check_in', [$data['check_in'], $data['check_out']])
                            ->orWhereBetween('check_out', [$data['check_in'], $data['check_out']])
                            ->orWhere(function ($overlap) use ($data) {
                                $overlap->where('check_in', '<=', $data['check_in'])
                                    ->where('check_out', '>=', $data['check_out']);
                            });
                    });
            });

        if (!empty($data['room_type'])) {
            $query->where('type', $data['room_type']);
        }

        $availableRooms = $query->orderBy('daily_rate')->get();

        return response()->json([
            'check_in' => $data['check_in'],
            'check_out' => $data['check_out'],
            'available_rooms' => $availableRooms,
            'count' => $availableRooms->count(),
        ]);
    }

    public function createHotelBooking(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'pet_id' => 'required|integer',
            'hotel_room_id' => 'nullable|integer|exists:hotel_rooms,id',
            'check_in' => 'required|date',
            'check_out' => 'required|date|after:check_in',
            'special_requests' => 'nullable|string|max:1000',
        ]);

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

        // Find or auto-assign room
        $room = null;
        if (!empty($data['hotel_room_id'])) {
            $room = HotelRoom::find($data['hotel_room_id']);
            // Check if room is available for dates
            $conflict = Boarding::where('hotel_room_id', $room->id)
                ->where('status', 'checked_in')
                ->where(function ($q) use ($data) {
                    $q->whereBetween('check_in', [$data['check_in'], $data['check_out']])
                        ->orWhereBetween('check_out', [$data['check_in'], $data['check_out']])
                        ->orWhere(function ($overlap) use ($data) {
                            $overlap->where('check_in', '<=', $data['check_in'])
                                ->where('check_out', '>=', $data['check_out']);
                        });
                })->exists();

            if ($conflict) {
                return response()->json(['message' => 'Selected room is not available for those dates.'], 422);
            }
        } else {
            // Auto-assign first available room
            $room = HotelRoom::where('status', 'available')
                ->whereDoesntHave('boardings', function ($q) use ($data) {
                    $q->where('status', 'checked_in')
                        ->where(function ($dateQuery) use ($data) {
                            $dateQuery->whereBetween('check_in', [$data['check_in'], $data['check_out']])
                                ->orWhereBetween('check_out', [$data['check_in'], $data['check_out']])
                                ->orWhere(function ($overlap) use ($data) {
                                    $overlap->where('check_in', '<=', $data['check_in'])
                                        ->where('check_out', '>=', $data['check_out']);
                                });
                        });
                })
                ->orderBy('daily_rate')
                ->first();

            if (!$room) {
                return response()->json(['message' => 'No rooms available for the selected dates.'], 422);
            }
        }

        // Calculate total amount
        $days = (new \DateTime($data['check_out']))->diff(new \DateTime($data['check_in']))->days;
        $totalAmount = $room->daily_rate * $days;

        // Create boarding record
        $boarding = Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'hotel_room_id' => $room->id,
            'check_in' => $data['check_in'],
            'check_out' => $data['check_out'],
            'status' => 'confirmed',
            'special_requests' => $data['special_requests'] ?? null,
            'total_amount' => $totalAmount,
            'payment_status' => 'unpaid',
        ]);

        return response()->json([
            'message' => 'Hotel booking created successfully.',
            'boarding' => $boarding->load(['pet', 'customer', 'hotelRoom']),
        ], 201);
    }
}
