<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;

class BoardingRoom extends Model
{
    use HasFactory;

    protected $fillable = [
        'room_code',
        'room_name',
        'room_type',
        'hotel_category',
        'allowed_species',
        'max_capacity',
        'total_rooms',
        'daily_rate',
        'is_active',
        'customer_selectable',
        'notes',
    ];

    const VALID_ROOM_TYPES = [
        'dog_standard', 'dog_large', 'dog_family',
        'cat_condo', 'cat_suite',
        'small_pet',
        'daycare_dog', 'daycare_cat', 'daycare_mixed',
    ];

    const HOTEL_CATEGORIES = ['dog_hotel', 'cat_hotel', 'daycare', 'other'];

    public static function inferCategory(string $roomType): string
    {
        if (in_array($roomType, ['dog_standard', 'dog_large', 'dog_family'])) return 'dog_hotel';
        if (in_array($roomType, ['cat_condo', 'cat_suite'])) return 'cat_hotel';
        if (in_array($roomType, ['daycare_dog', 'daycare_cat', 'daycare_mixed'])) return 'daycare';
        return 'other';
    }

    protected $casts = [
        'allowed_species' => 'array',
        'is_active' => 'boolean',
        'customer_selectable' => 'boolean',
        'daily_rate' => 'decimal:2',
    ];

    /**
     * Get reservations for this room type
     */
    public function reservations(): HasMany
    {
        $foreignKey = Schema::hasColumn('boarding_room_reservations', 'room_id')
            ? 'room_id'
            : 'boarding_room_id';

        return $this->hasMany(BoardingRoomReservation::class, $foreignKey);
    }

    /**
     * Get active reservations that block availability
     */
    public function activeReservations(): HasMany
    {
        return $this->reservations()->activeBlocking();
    }

    /**
     * Check if room is available for given dates
     */
    public function isAvailable($checkIn, $checkOut)
    {
        return !$this->activeReservations()
            ->overlappingDates($checkIn, $checkOut)
            ->exists();
    }

    /**
     * Get available rooms of this type for given dates
     */
    public static function getAvailableRooms($species, $size, $checkIn, $checkOut, $roomType = null)
    {
        $query = static::where('is_active', true)
            ->where('customer_selectable', true)
            ->whereJsonContains('allowed_species', $species);

        if ($roomType) {
            $query->where('room_type', $roomType);
        }

        // Size filtering logic
        if ($species === 'dog') {
            if ($size && in_array($size, ['small', 'medium'])) {
                $query->whereIn('room_type', ['dog_standard']);
            } elseif ($size && in_array($size, ['large', 'giant'])) {
                $query->whereIn('room_type', ['dog_large', 'dog_family']);
            }
        } elseif ($species === 'cat') {
            if ($size && in_array($size, ['small', 'medium'])) {
                $query->whereIn('room_type', ['cat_condo']);
            } elseif ($size && in_array($size, ['large', 'giant'])) {
                $query->whereIn('room_type', ['cat_suite']);
            }
        }

        $rooms = $query->get();

        // Filter out rooms with conflicting reservations
        return $rooms->filter(function ($room) use ($checkIn, $checkOut) {
            return $room->isAvailable($checkIn, $checkOut);
        });
    }
}
