<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class HotelRoom extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'room_number',
        'name',
        'description',
        'type',
        'size',
        'capacity',
        'daily_rate',
        'status',
        'amenities',
        'notes',
    ];

    protected $casts = [
        'amenities' => 'array',
        'daily_rate' => 'decimal:2',
    ];

    /**
     * Valid room statuses
     */
    public const VALID_STATUSES = ['available', 'occupied', 'maintenance', 'cleaning', 'reserved', 'inactive'];

    /**
     * Valid room sizes
     */
    public const VALID_SIZES = ['small', 'medium', 'large', 'suite'];

    /**
     * Valid room types
     */
    public const VALID_TYPES = ['standard', 'deluxe', 'suite', 'kennel', 'cattery'];

    /**
     * Boot method for model-level validation
     */
    protected static function boot()
    {
        parent::boot();

        static::saving(function ($room) {
            // Validate status
            if (!in_array($room->status, self::VALID_STATUSES)) {
                $room->status = 'available';
            }

            // Validate size
            if (!in_array($room->size, self::VALID_SIZES)) {
                $room->size = 'medium';
            }

            // Validate type
            if (!in_array($room->type, self::VALID_TYPES)) {
                $room->type = 'standard';
            }

            // Ensure non-negative daily rate
            $room->daily_rate = max(0, (float) $room->daily_rate);

            // Ensure positive capacity
            $room->capacity = max(1, (int) $room->capacity);

            // Trim room_number
            $room->room_number = trim($room->room_number);
        });
    }

    public function boardings(): HasMany
    {
        return $this->hasMany(Boarding::class);
    }

    public function medicalConfinements(): HasMany
    {
        return $this->hasMany(MedicalConfinement::class, 'room_id');
    }

    public function currentBoarding()
    {
        return $this->boardings()
            ->whereIn('status', ['approved', 'scheduled', 'confirmed', 'checked_in', 'in_care'])
            ->where('check_out', '>=', now())
            ->first();
    }

    public function scopeAvailable($query)
    {
        return $query->where('status', 'available');
    }

    public function scopeBySize($query, $size)
    {
        return $query->where('size', $size);
    }

    public function scopeByType($query, $type)
    {
        return $query->where('type', $type);
    }

    public function isAvailableForDates($checkIn, $checkOut)
    {
        $conflicting = $this->boardings()
            ->whereIn('status', ['confirmed', 'checked_in'])
            ->where(function ($query) use ($checkIn, $checkOut) {
                $query->whereBetween('check_in', [$checkIn, $checkOut])
                    ->orWhereBetween('check_out', [$checkIn, $checkOut])
                    ->orWhere(function ($q) use ($checkIn, $checkOut) {
                        $q->where('check_in', '<=', $checkIn)
                            ->where('check_out', '>=', $checkOut);
                    });
            })
            ->exists();

        return !$conflicting;
    }
}
