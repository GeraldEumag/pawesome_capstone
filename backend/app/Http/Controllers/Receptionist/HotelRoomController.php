<?php

namespace App\Http\Controllers\Receptionist;

use App\Http\Controllers\Controller;
use App\Models\HotelRoom;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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
     * Create new hotel room
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $validator = Validator::make($request->all(), [
                'room_number' => 'required|string|unique:hotel_rooms',
                'name' => 'required|string|max:255',
                'description' => 'nullable|string',
                'type' => 'required|in:standard,deluxe,suite,kennel,cattery',
                'size' => 'required|in:small,medium,large,suite',
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

            $room = HotelRoom::create($request->all());

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
                'type' => 'nullable|in:standard,deluxe,suite,kennel,cattery',
                'size' => 'nullable|in:small,medium,large,suite',
                'capacity' => 'nullable|integer|min:1',
                'daily_rate' => 'nullable|numeric|min:0',
                'status' => 'nullable|in:available,occupied,maintenance,cleaning,reserved,inactive',
                'amenities' => 'nullable|array',
                'notes' => 'nullable|string',
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'errors' => $validator->errors(),
                ], 422);
            }

            $room->update($request->all());

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
    public function destroy($id): JsonResponse
    {
        try {
            $room = HotelRoom::findOrFail($id);

            if ($room->boardings()->whereIn('status', ['approved', 'scheduled', 'confirmed', 'checked_in', 'in_care'])->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete room with active reservations',
                ], 422);
            }

            $room->delete();

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
