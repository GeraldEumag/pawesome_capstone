<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BoardingRoom extends Model
{
    use HasFactory;

    protected $fillable = [
        'room_code',
        'room_name',
        'room_type',
        'allowed_species',
        'max_capacity',
        'total_rooms',
        'daily_rate',
        'is_active',
        'customer_selectable',
        'notes',
    ];

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
        return $this->hasMany(BoardingRoomReservation::class, 'room_id');
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
