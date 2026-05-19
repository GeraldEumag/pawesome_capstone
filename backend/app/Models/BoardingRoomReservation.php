<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Schema;

class BoardingRoomReservation extends Model
{
    use HasFactory;

    protected $fillable = [
        'room_id',
        'boarding_room_id',
        'source_type',
        'source_id',
        'boarding_booking_id',
        'service_request_id',
        'pet_id',
        'customer_id',
        'check_in_date',
        'check_out_date',
        'status',
    ];

    protected $casts = [
        'check_in_date' => 'date',
        'check_out_date' => 'date',
    ];

    /**
     * Get the boarding room
     */
    public function room(): BelongsTo
    {
        $foreignKey = Schema::hasColumn('boarding_room_reservations', 'room_id')
            ? 'room_id'
            : 'boarding_room_id';

        return $this->belongsTo(BoardingRoom::class, $foreignKey);
    }

    /**
     * Get the pet
     */
    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    /**
     * Get the customer
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Scope for overlapping date reservations
     */
    public function scopeOverlappingDates($query, $checkIn, $checkOut)
    {
        return $query->where(function ($q) use ($checkIn, $checkOut) {
            $q->where('check_in_date', '<', $checkOut)
              ->where('check_out_date', '>', $checkIn);
        });
    }

    /**
     * Scope for active reservations that block availability
     */
    public function scopeActiveBlocking($query)
    {
        return $query->whereIn('status', ['pending', 'approved', 'scheduled', 'checked_in', 'in_stay', 'confined']);
    }
}
