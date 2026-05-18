<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BoardingRoomReservation extends Model
{
    use HasFactory;

    protected $fillable = [
        'room_id',
        'source_type',
        'source_id',
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
        return $this->belongsTo(BoardingRoom::class, 'room_id');
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
