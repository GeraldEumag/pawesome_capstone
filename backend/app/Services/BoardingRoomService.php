<?php

namespace App\Services;

use App\Models\BoardingRoom;
use App\Models\BoardingRoomReservation;
use App\Models\Pet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class BoardingRoomService
{
    /**
     * Get available rooms for a pet based on species, size, and dates
     */
    public function getAvailableRooms($petId, $checkInDate, $checkOutDate, $roomType = null)
    {
        $pet = Pet::find($petId);
        if (!$pet) {
            return ['success' => false, 'message' => 'Pet not found'];
        }

        $species = strtolower($pet->species);
        $size = strtolower($pet->size ?? '');

        // Check if species can be accommodated
        $accommodationCheck = $this->checkSpeciesAccommodation($species);
        if (!$accommodationCheck['can_accommodate']) {
            return ['success' => false, 'message' => $accommodationCheck['message']];
        }

        // Get available rooms
        $availableRooms = BoardingRoom::getAvailableRooms(
            $species, 
            $size, 
            $checkInDate, 
            $checkOutDate, 
            $roomType
        );

        if ($availableRooms->isEmpty()) {
            return ['success' => false, 'message' => 'No compatible rooms are available for the selected dates'];
        }

        return [
            'success' => true,
            'rooms' => $availableRooms->map(function ($room) {
                return [
                    'id' => $room->id,
                    'room_name' => $room->room_name,
                    'room_type' => $room->room_type,
                    'species_allowed' => $room->allowed_species,
                    'size_allowed' => $this->getSizeDescription($room->room_type),
                    'capacity' => $room->max_capacity,
                    'daily_rate' => (float) $room->daily_rate,
                    'notes' => $room->notes,
                ];
            })->values()
        ];
    }

    /**
     * Check if a species can be accommodated and return appropriate message
     */
    private function checkSpeciesAccommodation($species)
    {
        switch ($species) {
            case 'dog':
            case 'cat':
                return ['can_accommodate' => true];
            
            case 'bird':
                $birdCages = BoardingRoom::where('room_type', 'small_pet')
                    ->where('is_active', true)
                    ->count();
                if ($birdCages > 0) {
                    return ['can_accommodate' => true];
                }
                return ['can_accommodate' => false, 'message' => 'Bird boarding is currently unavailable because there are no bird cages available'];
            
            case 'fish':
            case 'reptile':
                return ['can_accommodate' => false, 'message' => 'This pet type cannot be accommodated because the facility does not have specialized tanks or reptile enclosures'];
            
            default:
                $matchingRooms = BoardingRoom::whereJsonContains('allowed_species', $species)
                    ->where('is_active', true)
                    ->count();
                if ($matchingRooms > 0) {
                    return ['can_accommodate' => true];
                }
                return ['can_accommodate' => false, 'message' => 'This pet type cannot be accommodated because there is no compatible room or cage available'];
        }
    }

    /**
     * Get size description for room type
     */
    private function getSizeDescription($roomType)
    {
        $sizeMap = [
            'dog_standard' => 'Standard dog kennel',
            'dog_large' => 'Large dog kennel',
            'dog_family' => 'Family dog suite',
            'cat_condo' => 'Cat condo',
            'cat_suite' => 'Cat suite',
            'small_pet' => 'Bird or small pet enclosure',
        ];

        return $sizeMap[$roomType] ?? 'All sizes';
    }

    /**
     * Calculate total amount for room booking
     */
    public function calculateTotalAmount($roomId, $checkInDate, $checkOutDate)
    {
        $room = BoardingRoom::find($roomId);
        if (!$room) {
            return ['success' => false, 'message' => 'Room not found'];
        }

        $checkIn = Carbon::parse($checkInDate);
        $checkOut = Carbon::parse($checkOutDate);
        $numberOfDays = $checkIn->diffInDays($checkOut);

        if ($numberOfDays <= 0) {
            return ['success' => false, 'message' => 'Invalid date range'];
        }

        $totalAmount = $room->daily_rate * $numberOfDays;

        return [
            'success' => true,
            'daily_rate' => (float) $room->daily_rate,
            'number_of_days' => $numberOfDays,
            'total_amount' => $totalAmount,
            'room_name' => $room->room_name,
            'room_type' => $room->room_type,
        ];
    }

    /**
     * Create room reservation with double booking prevention
     */
    public function createRoomReservation($roomId, $sourceType, $sourceId, $petId, $checkInDate, $checkOutDate, $customerId = null)
    {
        return DB::transaction(function () use ($roomId, $sourceType, $sourceId, $petId, $checkInDate, $checkOutDate, $customerId) {
            // Lock the room row
            $room = BoardingRoom::where('id', $roomId)->lockForUpdate()->first();
            if (!$room) {
                return ['success' => false, 'message' => 'Room not found'];
            }

            // Re-check availability inside transaction
            if (!$room->isAvailable($checkInDate, $checkOutDate)) {
                return ['success' => false, 'message' => 'Room is no longer available for the selected dates'];
            }

            // Validate pet compatibility
            $pet = Pet::find($petId);
            if (!$pet) {
                return ['success' => false, 'message' => 'Pet not found'];
            }

            if (!in_array(strtolower($pet->species), $room->allowed_species)) {
                return ['success' => false, 'message' => 'Pet species is not compatible with this room'];
            }

            // Create the reservation
            $reservation = BoardingRoomReservation::create([
                'room_id' => $roomId,
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'pet_id' => $petId,
                'customer_id' => $customerId,
                'check_in_date' => $checkInDate,
                'check_out_date' => $checkOutDate,
                'status' => 'pending',
            ]);

            return [
                'success' => true,
                'reservation' => $reservation,
                'room' => $room,
            ];
        });
    }

    /**
     * Get room types for filtering
     */
    public function getRoomTypes()
    {
        return [
            ['value' => '', 'label' => 'All compatible rooms'],
            ['value' => 'dog_standard', 'label' => 'Standard Kennel'],
            ['value' => 'dog_large', 'label' => 'Large Kennel'],
            ['value' => 'dog_family', 'label' => 'Family Suite'],
            ['value' => 'cat_condo', 'label' => 'Cat Condo'],
            ['value' => 'cat_suite', 'label' => 'Cat Suite'],
            ['value' => 'small_pet', 'label' => 'Small Pet Enclosure'],
        ];
    }
}
