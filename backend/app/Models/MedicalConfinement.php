<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MedicalConfinement extends Model
{
    use HasFactory, \App\Models\Concerns\InheritsBookingChannel;

    protected $fillable = [
        'consultation_id',
        'customer_id',
        'customer_email',
        'customer_name',
        'pet_id',
        'pet_name',
        'vet_id',
        'room_id',
        'diagnosis',
        'reason_for_confinement',
        'urgency_level',
        'expected_stay_days',
        'treatment_plan',
        'medication_plan',
        'observation_instructions',
        'special_care_instructions',
        'estimated_cost',
        'final_amount',
        'status',
        'payment_status',
        'payment_method',
        'payment_reference',
        'payment_proof',
        'paid_at',
        'verified_by',
        'cashier_remarks',
        'receipt_number',
        'rejected_by',
        'rejected_at',
        'rejection_reason',
        'admitted_by',
        'admitted_at',
        'discharge_cleared_by',
        'discharge_cleared_at',
        'discharged_by',
        'discharged_at',
        'booking_channel',
    ];

    protected $casts = [
        'paid_at' => 'datetime',
        'admitted_at' => 'datetime',
        'discharge_cleared_at' => 'datetime',
        'discharged_at' => 'datetime',
        'rejected_at' => 'datetime',
        'estimated_cost' => 'decimal:2',
        'final_amount' => 'decimal:2',
    ];

    public const VALID_STATUSES = [
        'recommended',
        'approved_for_admission',
        'admitted',
        'under_observation',
        'under_treatment',
        'ready_for_discharge',
        'discharged',
        'completed',
        'cancelled',
    ];

    public const VALID_PAYMENT_STATUSES = [
        'unpaid',
        'pending',
        'paid',
        'rejected',
        'partial',
        'refunded',
    ];

    protected static function boot()
    {
        parent::boot();

        static::saving(function ($confinement) {
            $confinement->inheritBookingChannelFromRequest();

            if (!in_array($confinement->status, self::VALID_STATUSES, true)) {
                $confinement->status = 'recommended';
            }

            if (!in_array($confinement->payment_status, self::VALID_PAYMENT_STATUSES, true)) {
                $confinement->payment_status = 'unpaid';
            }
        });
    }

    public function consultation()
    {
        return $this->belongsTo(Appointment::class, 'consultation_id');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function pet()
    {
        return $this->belongsTo(Pet::class);
    }

    public function veterinarian()
    {
        return $this->belongsTo(User::class, 'vet_id');
    }

    public function room()
    {
        return $this->belongsTo(HotelRoom::class, 'room_id');
    }

    public function careLogs()
    {
        return $this->hasMany(BoardingCareLog::class, 'confinement_id');
    }

    public function progressNotes()
    {
        return $this->hasMany(MedicalProgressNote::class, 'confinement_id');
    }
}
