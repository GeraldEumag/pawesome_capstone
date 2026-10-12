<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GroomingAppointment extends Model
{
    use HasFactory;

    protected $fillable = [
        'pet_id',
        'pet_name',
        'service',
        'appointment_date',
        'appointment_time',
        'notes',
        'status',
    ];

    protected $casts = [
        'appointment_date' => 'date',
    ];

    public function pet()
    {
        return $this->belongsTo(Pet::class);
    }

    /**
     * Valid grooming statuses
     */
    public const VALID_STATUSES = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];

    /**
     * Boot method for model-level validation
     */
    protected static function boot()
    {
        parent::boot();

        static::saving(function ($appointment) {
            // Validate status
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

    public function approve()
    {
        $this->update(['status' => 'approved']);
    }

    public function reject()
    {
        $this->update(['status' => 'rejected']);
    }

    public function complete()
    {
        $this->update(['status' => 'completed']);
    }

    public function cancel()
    {
        $this->update(['status' => 'cancelled']);
    }
}
