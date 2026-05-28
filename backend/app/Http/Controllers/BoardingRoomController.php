<?php

namespace App\Http\Controllers;

use App\Services\BoardingRoomService;
use App\Services\WorkflowNotifier;
use App\Models\BoardingRoom;
use App\Models\BoardingRoomReservation;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class BoardingRoomController extends Controller
{
    protected $boardingRoomService;

    public function __construct(BoardingRoomService $boardingRoomService)
    {
        $this->boardingRoomService = $boardingRoomService;
    }

    /**
     * Get available rooms for a pet
     */
    public function getAvailableRooms(Request $request): JsonResponse
    {
        try {
            $petId = $request->query('pet_id');
            $species = strtolower(trim((string) $request->query('species', '')));
            $size = strtolower(trim((string) $request->query('size', '')));
            $checkIn = $request->query('check_in_date') ?: $request->query('check_in');
            $checkOut = $request->query('check_out_date') ?: $request->query('check_out');
            $roomType = $request->query('room_type');

            if (!$species && $petId) {
                $species = strtolower(trim((string) DB::table('pets')->where('id', $petId)->value('species')));
            }

            if (!$petId || !$species || !$checkIn || !$checkOut) {
                return response()->json([
                    'success' => false,
                    'message' => 'Pet, species, check-in date, and check-out date are required.',
                    'rooms' => [],
                ], 422);
            }

            if (in_array($species, ['fish', 'reptile'], true)) {
                return response()->json([
                    'success' => true,
                    'message' => ucfirst($species) . ' cannot be accommodated in Pet Hotel rooms.',
                    'rooms' => [],
                ]);
            }

            if ($species === 'dog') {
                $allowedRoomTypes = ['dog_standard', 'dog_large', 'dog_family'];
            } elseif ($species === 'cat') {
                $allowedRoomTypes = ['cat_condo', 'cat_suite'];
            } elseif ($species === 'bird') {
                $allowedRoomTypes = ['small_pet'];
            } else {
                return response()->json([
                    'success' => true,
                    'message' => 'This pet species cannot be accommodated in Pet Hotel rooms.',
                    'rooms' => [],
                ]);
            }

            if ($roomType && in_array($roomType, $allowedRoomTypes, true)) {
                $allowedRoomTypes = [$roomType];
            }

            if ($size && in_array($species, ['dog', 'cat'], true)) {
                if (in_array($size, ['small', 'medium'], true)) {
                    $sizeFiltered = array_values(array_filter(
                        $allowedRoomTypes,
                        fn ($type) => in_array($type, ['dog_standard', 'cat_condo'])
                    ));
                    if (!empty($sizeFiltered)) {
                        $allowedRoomTypes = $sizeFiltered;
                    }
                } elseif (in_array($size, ['large', 'giant'], true)) {
                    $sizeFiltered = array_values(array_filter(
                        $allowedRoomTypes,
                        fn ($type) => in_array($type, ['dog_large', 'dog_family', 'cat_suite'])
                    ));
                    if (!empty($sizeFiltered)) {
                        $allowedRoomTypes = $sizeFiltered;
                    }
                }
            }

            if (empty($allowedRoomTypes)) {
                return response()->json(['success' => true, 'rooms' => []]);
            }

            $roomsQuery = DB::table('boarding_rooms')
                ->whereIn('room_type', $allowedRoomTypes);

            if (Schema::hasColumn('boarding_rooms', 'is_active')) {
                $roomsQuery->where('is_active', true);
            }

            if (Schema::hasColumn('boarding_rooms', 'customer_selectable')) {
                $roomsQuery->where('customer_selectable', true);
            }

            $boardingRooms = $roomsQuery->orderBy('daily_rate')->get();
            $reservationRoomColumn = Schema::hasColumn('boarding_room_reservations', 'room_id')
                ? 'room_id'
                : (Schema::hasColumn('boarding_room_reservations', 'boarding_room_id') ? 'boarding_room_id' : null);

            $allRooms = collect();

            // ── Process boarding_rooms ────────────────────────────────
            foreach ($boardingRooms as $room) {
                $blockingReservationCount = 0;

                if ($reservationRoomColumn && Schema::hasTable('boarding_room_reservations')) {
                    $blockingReservationCount = DB::table('boarding_room_reservations')
                        ->where($reservationRoomColumn, $room->id)
                        ->whereNotIn('status', ['rejected', 'cancelled', 'checked_out', 'completed'])
                        ->where('check_in_date', '<', $checkOut)
                        ->where('check_out_date', '>', $checkIn)
                        ->count();
                }

                if (Schema::hasTable('boardings') && Schema::hasColumn('boardings', 'hotel_room_id')) {
                    $blockingReservationCount += DB::table('boardings')
                        ->where('hotel_room_id', $room->id)
                        ->whereNotIn('status', ['rejected', 'cancelled', 'checked_out', 'completed'])
                        ->where('check_in', '<', $checkOut)
                        ->where('check_out', '>', $checkIn)
                        ->count();
                }

                $room->available = $blockingReservationCount < (int) ($room->total_rooms ?? 1);
                $room->available_rooms = max(0, (int) ($room->total_rooms ?? 1) - $blockingReservationCount);

                if (empty($room->hotel_category)) {
                    $rt = $room->room_type ?? '';
                    if (in_array($rt, ['dog_standard', 'dog_large', 'dog_family'])) {
                        $room->hotel_category = 'dog_hotel';
                    } elseif (in_array($rt, ['cat_condo', 'cat_suite'])) {
                        $room->hotel_category = 'cat_hotel';
                    } elseif (in_array($rt, ['daycare_dog', 'daycare_cat', 'daycare_mixed'])) {
                        $room->hotel_category = 'daycare';
                    } else {
                        $room->hotel_category = 'other';
                    }
                }

                $allRooms->push($room);
            }

            // ── Also query legacy hotel_rooms ─────────────────────────
            if (Schema::hasTable('hotel_rooms')) {
                $hotelRoomSpeciesMap = [
                    'kennel'   => ['dog'],
                    'cattery'  => ['cat'],
                ];

                $hotelRoomCategoryMap = [
                    'kennel'   => 'dog_hotel',
                    'cattery'  => 'cat_hotel',
                    'standard' => 'other',
                    'deluxe'   => 'other',
                    'suite'    => 'other',
                ];

                $hotelQuery = DB::table('hotel_rooms')
                    ->whereNotIn('status', ['inactive', 'maintenance']);

                // Only include hotel rooms compatible with this species
                $hotelQuery->where(function ($q) use ($species) {
                    if ($species === 'dog') {
                        $q->whereIn('type', ['kennel', 'standard', 'deluxe', 'suite']);
                    } elseif ($species === 'cat') {
                        $q->whereIn('type', ['cattery', 'standard', 'deluxe', 'suite']);
                    } else {
                        $q->whereIn('type', ['standard', 'deluxe', 'suite']);
                    }
                });

                $hotelRooms = $hotelQuery->orderBy('daily_rate')->get();

                foreach ($hotelRooms as $hr) {
                    $blocking = 0;
                    if (Schema::hasTable('boardings') && Schema::hasColumn('boardings', 'hotel_room_id')) {
                        $blocking = DB::table('boardings')
                            ->where('hotel_room_id', $hr->id)
                            ->whereNotIn('status', ['rejected', 'cancelled', 'checked_out', 'completed'])
                            ->where('check_in', '<', $checkOut)
                            ->where('check_out', '>', $checkIn)
                            ->count();
                    }

                    $capacity = (int) ($hr->capacity ?? 1);
                    $available = $blocking < $capacity;

                    $mapped = (object) [
                        'id'                => 'hotel_' . $hr->id,
                        'room_code'         => $hr->room_number,
                        'room_name'         => $hr->name,
                        'room_type'         => $hr->type,
                        'hotel_category'    => $hotelRoomCategoryMap[$hr->type] ?? 'other',
                        'allowed_species'   => $hotelRoomSpeciesMap[$hr->type] ?? ['dog', 'cat', 'bird', 'other'],
                        'max_capacity'      => $capacity,
                        'total_rooms'       => $capacity,
                        'available_rooms'   => max(0, $capacity - $blocking),
                        'daily_rate'        => (float) $hr->daily_rate,
                        'is_active'         => true,
                        'customer_selectable'=> true,
                        'notes'             => $hr->notes,
                        'available'         => $available,
                        '_source'           => 'hotel_rooms',
                    ];

                    $allRooms->push($mapped);
                }
            }

            return response()->json([
                'success' => true,
                'rooms'   => $allRooms->values(),
            ]);
        } catch (\Throwable $e) {
            Log::error('Boarding room availability error', [
                'message' => $e->getMessage(),
                'line' => $e->getLine(),
                'file' => $e->getFile(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to check room availability.',
                'rooms' => [],
                'debug' => app()->environment('local') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * Calculate total amount for room booking
     */
    public function calculateTotal(Request $request): JsonResponse
    {
        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'room_id' => 'required|exists:boarding_rooms,id',
            'check_in_date' => 'required|date|after_or_equal:today',
            'check_out_date' => 'required|date|after:check_in_date',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $result = $this->boardingRoomService->calculateTotalAmount(
            $request->room_id,
            $request->check_in_date,
            $request->check_out_date
        );

        return response()->json($result);
    }

    /**
     * Get room types for filtering
     */
    public function getRoomTypes(): JsonResponse
    {
        $roomTypes = $this->boardingRoomService->getRoomTypes();
        return response()->json(['room_types' => $roomTypes]);
    }

    /**
     * Approve hotel boarding request
     */
    public function approve(Request $request, $id): JsonResponse
    {
        $serviceRequest = ServiceRequest::find($id);
        
        if (!$serviceRequest) {
            return response()->json([
                'success' => false,
                'message' => 'Service request not found.',
            ], 404);
        }

        if (!in_array($serviceRequest->request_type, ['hotel', 'boarding'])) {
            return response()->json([
                'success' => false,
                'message' => 'This endpoint only handles hotel/boarding requests.',
            ], 422);
        }

        // Start database transaction
        DB::beginTransaction();
        
        try {
            // Get room details and re-check availability
            $room = BoardingRoom::find($serviceRequest->boarding_room_id);
            if (!$room) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Selected room not found.',
                ], 422);
            }

            // Check availability one more time before approving
            $existingReservations = BoardingRoomReservation::where('room_id', $room->id)
                ->where('check_in_date', '<', $serviceRequest->check_out_date ?? $serviceRequest->check_in_date)
                ->where('check_out_date', '>', $serviceRequest->check_in_date ?? $serviceRequest->check_in_date)
                ->whereIn('status', ['pending', 'approved', 'scheduled', 'checked_in'])
                ->count();
            
            $availableRooms = $room->total_rooms - $existingReservations;
            
            if ($availableRooms <= 0) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Selected room is no longer available for the chosen dates.',
                ], 422);
            }

            // Create room reservation
            $reservation = BoardingRoomReservation::create([
                'room_id' => $room->id,
                'source_type' => 'pet_hotel',
                'source_id' => $serviceRequest->id,
                'pet_id' => $serviceRequest->pet_id,
                'customer_id' => $serviceRequest->customer_id,
                'check_in_date' => $serviceRequest->check_in_date ?? $serviceRequest->check_in_date,
                'check_out_date' => $serviceRequest->check_out_date ?? $serviceRequest->check_in_date,
                'status' => 'approved',
            ]);

            // Update service request status
            $serviceRequest->update([
                'status' => 'approved',
                'approved_by' => Auth::id(),
                'approved_at' => now(),
            ]);

            // Commit transaction
            DB::commit();

            // Create notification
            WorkflowNotifier::notifyEmail(
                $serviceRequest->customer_email,
                'Boarding Request Approved',
                "Your {$serviceRequest->service_name} request has been approved. Room: {$room->room_name}",
                'success',
                'service_request',
                $serviceRequest->id
            );

            return response()->json([
                'success' => true,
                'message' => 'Boarding request approved successfully.',
                'reservation' => $reservation,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to approve request: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Reject hotel boarding request
     */
    public function reject(Request $request, $id): JsonResponse
    {
        $serviceRequest = ServiceRequest::find($id);
        
        if (!$serviceRequest) {
            return response()->json([
                'success' => false,
                'message' => 'Service request not found.',
            ], 404);
        }

        if (!in_array($serviceRequest->request_type, ['hotel', 'boarding'])) {
            return response()->json([
                'success' => false,
                'message' => 'This endpoint only handles hotel/boarding requests.',
            ], 422);
        }

        // Update service request status
        $serviceRequest->update([
            'status' => 'rejected',
            'rejected_by' => Auth::id(),
            'rejected_at' => now(),
        ]);

        // Cancel related room reservation if it exists
        $reservation = BoardingRoomReservation::where('source_type', 'pet_hotel')
            ->where('source_id', $serviceRequest->id)
            ->first();
        if ($reservation) {
            $reservation->update(['status' => 'cancelled']);
        }

        // Create notification
        WorkflowNotifier::notifyEmail(
            $serviceRequest->customer_email,
            'Boarding Request Rejected',
            "Your {$serviceRequest->service_name} request has been rejected.",
            'error',
            'service_request',
            $serviceRequest->id
        );

        return response()->json([
            'success' => true,
            'message' => 'Boarding request rejected successfully.',
        ]);
    }

    /**
     * Get all room types (for admin use)
     */
    public function index(Request $request): JsonResponse
    {
        $rooms = BoardingRoom::with(['reservations' => function ($query) {
            $query->whereIn('status', ['pending', 'approved', 'scheduled', 'checked_in']);
        }])->get();

        return response()->json([
            'success' => true,
            'rooms' => $rooms->map(function ($room) {
                $occupiedCount = $room->reservations->count();
                return [
                    'id' => $room->id,
                    'room_name' => $room->room_name,
                    'room_type' => $room->room_type,
                    'allowed_species' => json_decode($room->allowed_species),
                    'max_capacity' => $room->max_capacity,
                    'total_rooms' => $room->total_rooms,
                    'available_rooms' => $room->total_rooms - $occupiedCount,
                    'daily_rate' => (float) $room->daily_rate,
                    'is_active' => $room->is_active,
                    'customer_selectable' => $room->customer_selectable,
                    'notes' => $room->notes,
                ];
            }),
        ]);
    }
}
