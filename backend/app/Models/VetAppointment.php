<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class VetAppointment extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'pet_id',
        'pet_name',
        'service',
        'appointment_date',
        'concern',
        'status',
    ];

    protected $casts = [
        'appointment_date' => 'date',
    ];

    public function pet()
    {
        return $this->belongsTo(Pet::class);
    }

    public const VALID_STATUSES = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];

    protected static function boot()
    {
        parent::boot();

        static::saving(function ($appointment) {
            if (!in_array($appointment->status, self::VALID_STATUSES)) {
                $appointment->status = 'pending';
            }
        });
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }
}
