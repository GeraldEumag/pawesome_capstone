<?php

namespace App\Http\Controllers\Receptionist;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\HotelRoom;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class HotelRoomController extends Controller
{
    /**
     * List all hotel rooms
     */
    public function index(Request $request): JsonResponse
    {
        try {
            $query = HotelRoom::query();

            if ($request->has('status')) {
                $query->where('status', $request->status);
            }

            if ($request->has('size')) {
                $query->bySize($request->size);
            }

            if ($request->has('type')) {
                $query->byType($request->type);
            }

            // ?date=YYYY-MM-DD — only list rooms free for that date:
            // status 'available', no overlapping boarding, no active confinement
            if ($request->filled('date')) {
                $date = $request->query('date');
                $query->where('status', 'available')
                    ->whereDoesntHave('boardings', function ($q) use ($date) {
                        $q->whereNotIn('status', ['rejected', 'cancelled', 'checked_out', 'completed'])
                            ->where('check_in', '<=', $date)
                            ->where('check_out', '>=', $date);
                    });

                if (Schema::hasTable('medical_confinements')) {
                    $query->whereDoesntHave('medicalConfinements', function ($q) {
                        $q->whereIn('status', ['approved_for_admission', 'admitted', 'under_observation', 'under_treatment', 'ready_for_discharge']);
                    });
                }
            }

            $rooms = $query->orderBy('room_number')->get();

            return response()->json([
                'success' => true,
                'rooms' => $rooms,
                'summary' => [
                    'total' => HotelRoom::count(),
                    'available' => HotelRoom::where('status', 'available')->count(),
                    'occupied' => HotelRoom::where('status', 'occupied')->count(),
                    'maintenance' => HotelRoom::where('status', 'maintenance')->count(),
                    'cleaning' => HotelRoom::where('status', 'cleaning')->count(),
                    'reserved' => HotelRoom::where('status', 'reserved')->count(),
                    'inactive' => HotelRoom::where('status', 'inactive')->count(),
                ],
                'valid_statuses' => HotelRoom::VALID_STATUSES,
                'valid_types' => HotelRoom::VALID_TYPES,
                'valid_sizes' => HotelRoom::VALID_SIZES,
            ]);
        } catch (\Exception $e) {
            Log::error('Receptionist hotel rooms fetch error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error fetching hotel rooms.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Statuses staff may set manually. 'occupied' is excluded — occupancy is
     * derived from boardings/confinements and must never be set by hand.
     */
    private const MANUAL_STATUSES = 'available,maintenance,cleaning,reserved,inactive';

    /**
     * Get single room details (with current boarding)
     */
    public function show($id): JsonResponse
    {
        $room = HotelRoom::with(['boardings' => function ($query) {
            $query->current()->orderBy('check_out', 'asc');
        }])->findOrFail($id);

        return response()->json([
            'success' => true,
            'room' => $room,
        ]);
    }

    /**
     * Set room status — manual statuses only (see MANUAL_STATUSES).
     */
    public function setStatus(Request $request, $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:' . self::MANUAL_STATUSES,
            'reason' => 'nullable|string|min:3|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $room = HotelRoom::findOrFail($id);
        $room->update(['status' => $request->status]);

        return response()->json([
            'success' => true,
            'message' => 'Room status updated',
            'room' => $room,
        ]);
    }

    /**
     * Create new hotel room
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $validator = Validator::make($request->all(), [
                'room_number' => 'required|string|unique:hotel_rooms',
                'name' => 'required|string|max:255',
                'description' => 'nullable|string',
                'type' => 'required|in:' . implode(',', HotelRoom::VALID_TYPES),
                'size' => 'required|in:' . implode(',', HotelRoom::VALID_SIZES),
                'capacity' => 'required|integer|min:1',
                'daily_rate' => 'required|numeric|min:0',
                'amenities' => 'nullable|array',
                'notes' => 'nullable|string',
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'errors' => $validator->errors(),
                ], 422);
            }

            $room = HotelRoom::create($validator->validated());

            ActivityLog::log($request->user()?->id, 'hotel_room_created',
                "Hotel room #{$room->id} ({$room->name}) created", [
                    'category' => 'rooms',
                    'reference_type' => HotelRoom::class,
                    'reference_id' => $room->id,
                    'metadata' => [
                        'room_id' => $room->id,
                        'room_name' => $room->name,
                    ],
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Room created successfully',
                'room' => $room,
            ], 201);
        } catch (\Exception $e) {
            Log::error('Receptionist hotel room creation error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to create room',
                'errors' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Update hotel room
     */
    public function update(Request $request, $id): JsonResponse
    {
        try {
            $room = HotelRoom::findOrFail($id);

            $validator = Validator::make($request->all(), [
                'room_number' => 'nullable|string|unique:hotel_rooms,room_number,' . $id,
                'name' => 'nullable|string|max:255',
                'description' => 'nullable|string',
                'type' => 'nullable|in:' . implode(',', HotelRoom::VALID_TYPES),
                'size' => 'nullable|in:' . implode(',', HotelRoom::VALID_SIZES),
                'capacity' => 'nullable|integer|min:1',
                'daily_rate' => 'nullable|numeric|min:0',
                'status' => 'nullable|in:' . self::MANUAL_STATUSES,
                'amenities' => 'nullable|array',
                'notes' => 'nullable|string',
                'reason' => 'nullable|string|min:3|max:500',
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'errors' => $validator->errors(),
                ], 422);
            }

            $data = $validator->validated();
            $reason = $data['reason'] ?? null;
            unset($data['reason']);

            $room->update($data);

            if (($data['status'] ?? null) === 'inactive') {
                ActivityLog::log($request->user()?->id, 'hotel_room_deactivated',
                    "Hotel room #{$room->id} ({$room->name}) deactivated", [
                        'category' => 'rooms',
                        'reference_type' => HotelRoom::class,
                        'reference_id' => $room->id,
                        'metadata' => [
                            'room_id' => $room->id,
                            'room_name' => $room->name,
                            'reason' => $reason,
                        ],
                    ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Room updated successfully',
                'room' => $room,
            ]);
        } catch (\Exception $e) {
            Log::error('Receptionist hotel room update error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to update room',
                'errors' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Delete hotel room
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $request->merge(['reason' => trim((string) $request->input('reason'))]);
        $validated = $request->validate([
            'reason' => 'required|string|min:3|max:500',
        ]);

        try {
            $result = DB::transaction(function () use ($request, $id, $validated) {
                $room = HotelRoom::whereKey($id)->lockForUpdate()->firstOrFail();

                if ($room->boardings()->whereIn('status', [
                    'pending', 'approved', 'scheduled', 'confirmed', 'checked_in', 'in_care', 'in_stay', 'ready_for_pickup',
                ])->exists()) {
                    return ['blocked' => true];
                }

                ActivityLog::log($request->user()?->id, 'hotel_room_deleted',
                    "Hotel room #{$room->id} ({$room->name}) deleted", [
                        'category' => 'rooms',
                        'reference_type' => HotelRoom::class,
                        'reference_id' => $room->id,
                        'metadata' => [
                            'room_id' => $room->id,
                            'room_name' => $room->name,
                            'reason' => $validated['reason'],
                        ],
                    ]);

                $room->delete();

                return ['blocked' => false];
            });

            if ($result['blocked']) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete room with active reservations',
                ], 422);
            }

            return response()->json([
                'success' => true,
                'message' => 'Room deleted successfully',
            ]);
        } catch (\Exception $e) {
            Log::error('Receptionist hotel room deletion error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete room',
                'errors' => $e->getMessage(),
            ], 422);
        }
    }
}
