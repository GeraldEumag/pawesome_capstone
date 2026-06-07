<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Appointment extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_id', 'pet_id', 'service_id', 'veterinarian_id', 'status',
        'scheduled_at', 'started_at', 'completed_at', 'price', 'payment_status',
        'consultation_fee', 'base_amount', 'additional_charges', 'total_amount',
        'amount_paid', 'balance_due', 'receipt_number', 'paid_at', 'verified_by',
        'notes', 'diagnosis', 'treatment_notes', 'prescription',
        'vet_remarks', 'cashier_remarks', 'cancellation_reason', 'service_request_id'
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'paid_at' => 'datetime',
        'reminder_sent_at' => 'datetime',
    ];

    // Status constants for consistency
    const STATUS_PENDING = 'pending';
    const STATUS_APPROVED = 'approved';
    const STATUS_SCHEDULED = 'scheduled';
    const STATUS_IN_PROGRESS = 'in_progress';
    const STATUS_IN_CONSULTATION = 'in_consultation';
    const STATUS_NEEDS_CONFINEMENT = 'needs_confinement';
    const STATUS_TREATED = 'treated';
    const STATUS_AWAITING_PAYMENT = 'awaiting_payment';
    const STATUS_COMPLETED = 'completed';
    const STATUS_CANCELLED = 'cancelled';
    const STATUS_REJECTED = 'rejected';
    const STATUS_NO_SHOW = 'no_show';

    /**
     * Valid statuses
     */
    public const VALID_STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_APPROVED,
        self::STATUS_SCHEDULED,
        self::STATUS_IN_PROGRESS,
        self::STATUS_IN_CONSULTATION,
        self::STATUS_NEEDS_CONFINEMENT,
        self::STATUS_TREATED,
        self::STATUS_AWAITING_PAYMENT,
        self::STATUS_COMPLETED,
        self::STATUS_CANCELLED,
        self::STATUS_REJECTED,
        self::STATUS_NO_SHOW,
    ];

    /**
     * Boot method for model-level validation
     */
    protected static function boot()
    {
        parent::boot();

        static::saving(function ($appointment) {
            // Validate status
            if (!in_array($appointment->status, self::VALID_STATUSES)) {
                $appointment->status = self::STATUS_PENDING;
            }

            // Ensure non-negative price
            $appointment->price = max(0, (float) $appointment->price);

            // Ensure scheduled_at is not in the past for new appointments
            if ($appointment->isDirty('scheduled_at') && $appointment->scheduled_at && $appointment->scheduled_at < now()) {
                // Allow if it's just being updated (not strict for rescheduling)
                // Only prevent on create
                if (!$appointment->exists) {
                    $appointment->scheduled_at = now()->addHour();
                }
            }
        });
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function pet()
    {
        return $this->belongsTo(Pet::class);
    }

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function veterinarian()
    {
        return $this->belongsTo(User::class, 'veterinarian_id');
    }

    public function medicalRecords()
    {
        return $this->hasMany(MedicalRecord::class);
    }

    // Check if appointment can be cancelled
    public function canBeCancelled(): bool
    {
        return in_array($this->status, [self::STATUS_PENDING, self::STATUS_APPROVED]);
    }

    // Check if appointment can be rescheduled
    public function canBeRescheduled(): bool
    {
        return in_array($this->status, [self::STATUS_PENDING, self::STATUS_APPROVED]);
    }

    // Check if appointment can be completed
    public function canBeCompleted(): bool
    {
        return in_array($this->status, [
            self::STATUS_APPROVED,
            self::STATUS_SCHEDULED,
            self::STATUS_IN_PROGRESS,
            self::STATUS_IN_CONSULTATION,
            self::STATUS_TREATED,
            self::STATUS_AWAITING_PAYMENT,
        ], true);
    }

    public function medicalConfinements()
    {
        return $this->hasMany(MedicalConfinement::class, 'consultation_id');
    }
}
