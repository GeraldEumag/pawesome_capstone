<?php

namespace App\Http\Controllers\Receptionist;

use App\Http\Controllers\Controller;
use App\Models\BoardingRoom;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class BoardingRoomController extends Controller
{
    /**
     * List all boarding/daycare rooms
     */
    public function index(Request $request): JsonResponse
    {
        try {
            $query = BoardingRoom::query()->orderBy('room_type')->orderBy('room_name');

            if ($request->has('room_type')) {
                $query->where('room_type', $request->room_type);
            }

            $rooms = $query->get();

            return response()->json([
                'success' => true,
                'rooms' => $rooms->map(function ($room) {
                    $occupiedCount = $room->reservations()
                        ->whereIn('status', ['pending', 'approved', 'scheduled', 'checked_in'])
                        ->count();

                    return [
                        'id' => $room->id,
                        'room_code' => $room->room_code,
                        'room_name' => $room->room_name,
                        'room_type' => $room->room_type,
                        'allowed_species' => $room->allowed_species,
                        'max_capacity' => $room->max_capacity,
                        'total_rooms' => $room->total_rooms,
                        'available_rooms' => max(0, (int) ($room->total_rooms ?? 1) - $occupiedCount),
                        'daily_rate' => (float) $room->daily_rate,
                        'is_active' => $room->is_active,
                        'customer_selectable' => $room->customer_selectable,
                        'hotel_category' => $room->hotel_category ?? BoardingRoom::inferCategory($room->room_type),
                        'notes' => $room->notes,
                    ];
                }),
                'valid_room_types' => [
                    ['value' => 'dog_standard', 'label' => 'Standard Kennel (Dog)', 'category' => 'dog_hotel'],
                    ['value' => 'dog_large',   'label' => 'Large Kennel (Dog)',     'category' => 'dog_hotel'],
                    ['value' => 'dog_family',  'label' => 'Family Suite (Dog)',     'category' => 'dog_hotel'],
                    ['value' => 'cat_condo',   'label' => 'Cat Condo',             'category' => 'cat_hotel'],
                    ['value' => 'cat_suite',   'label' => 'Cat Suite',             'category' => 'cat_hotel'],
                    ['value' => 'small_pet',   'label' => 'Small Pet / Bird',      'category' => 'other'],
                    ['value' => 'daycare_dog', 'label' => 'Daycare — Dog',         'category' => 'daycare'],
                    ['value' => 'daycare_cat', 'label' => 'Daycare — Cat',         'category' => 'daycare'],
                    ['value' => 'daycare_mixed','label' => 'Daycare — Mixed',      'category' => 'daycare'],
                ],
                'hotel_categories' => [
                    ['value' => 'dog_hotel', 'label' => '🐶 Dog Hotel'],
                    ['value' => 'cat_hotel', 'label' => '🐱 Cat Hotel'],
                    ['value' => 'daycare',   'label' => '🌞 Daycare'],
                    ['value' => 'other',     'label' => '🐾 Other'],
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('Receptionist boarding rooms fetch error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error fetching boarding rooms.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Create new boarding/daycare room
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $validator = Validator::make($request->all(), [
                'room_code' => 'required|string|max:50|unique:boarding_rooms',
                'room_name' => 'required|string|max:255',
                'room_type' => 'required|in:' . implode(',', BoardingRoom::VALID_ROOM_TYPES),
                'hotel_category' => 'nullable|in:dog_hotel,cat_hotel,daycare,other',
                'allowed_species' => 'required|array',
                'allowed_species.*' => 'in:dog,cat,bird,fish,reptile,other',
                'max_capacity' => 'required|integer|min:1',
                'total_rooms' => 'required|integer|min:1',
                'daily_rate' => 'required|numeric|min:0',
                'is_active' => 'sometimes|boolean',
                'customer_selectable' => 'sometimes|boolean',
                'notes' => 'nullable|string',
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'errors' => $validator->errors(),
                ], 422);
            }

            $data = $request->all();
            $data['is_active'] = $data['is_active'] ?? true;
            $data['customer_selectable'] = $data['customer_selectable'] ?? true;
            if (empty($data['hotel_category'])) {
                $data['hotel_category'] = BoardingRoom::inferCategory($data['room_type']);
            }

            $room = BoardingRoom::create($data);

            return response()->json([
                'success' => true,
                'message' => 'Room created successfully',
                'room' => $room,
            ], 201);
        } catch (\Exception $e) {
            Log::error('Receptionist boarding room creation error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to create room',
                'errors' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Update boarding/daycare room
     */
    public function update(Request $request, $id): JsonResponse
    {
        try {
            $room = BoardingRoom::findOrFail($id);

            $validator = Validator::make($request->all(), [
                'room_code' => 'sometimes|string|max:50|unique:boarding_rooms,room_code,' . $id,
                'room_name' => 'sometimes|string|max:255',
                'room_type' => 'sometimes|in:' . implode(',', BoardingRoom::VALID_ROOM_TYPES),
                'hotel_category' => 'nullable|in:dog_hotel,cat_hotel,daycare,other',
                'allowed_species' => 'sometimes|array',
                'allowed_species.*' => 'in:dog,cat,bird,fish,reptile,other',
                'max_capacity' => 'sometimes|integer|min:1',
                'total_rooms' => 'sometimes|integer|min:1',
                'daily_rate' => 'sometimes|numeric|min:0',
                'is_active' => 'sometimes|boolean',
                'customer_selectable' => 'sometimes|boolean',
                'notes' => 'nullable|string',
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'errors' => $validator->errors(),
                ], 422);
            }

            $updateData = $request->all();
            if (!empty($updateData['room_type']) && empty($updateData['hotel_category'])) {
                $updateData['hotel_category'] = BoardingRoom::inferCategory($updateData['room_type']);
            }
            $room->update($updateData);

            return response()->json([
                'success' => true,
                'message' => 'Room updated successfully',
                'room' => $room,
            ]);
        } catch (\Exception $e) {
            Log::error('Receptionist boarding room update error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to update room',
                'errors' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Delete boarding/daycare room
     */
    public function destroy($id): JsonResponse
    {
        try {
            $room = BoardingRoom::findOrFail($id);

            if ($room->reservations()->whereIn('status', ['pending', 'approved', 'scheduled', 'checked_in'])->exists()) {
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
            Log::error('Receptionist boarding room deletion error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete room',
                'errors' => $e->getMessage(),
            ], 422);
        }
    }
}
