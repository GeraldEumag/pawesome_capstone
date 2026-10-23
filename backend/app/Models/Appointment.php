<?php

namespace App\Models;

use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Appointment extends Model
{
    use HasFactory, \App\Models\Concerns\InheritsBookingChannel;

    /**
     * Holds the original status before an update so status-change
     * notifications can be dispatched from the updated event.
     */
    public ?string $statusBeforeUpdate = null;

    protected $fillable = [
        'customer_id', 'pet_id', 'service_id', 'veterinarian_id', 'status',
        'scheduled_at', 'started_at', 'completed_at', 'price', 'payment_status',
        'consultation_fee', 'base_amount', 'additional_charges', 'total_amount',
        'amount_paid', 'balance_due', 'receipt_number', 'paid_at', 'verified_by',
        'notes', 'diagnosis', 'treatment_notes', 'prescription',
        'vet_remarks', 'cashier_remarks', 'cancellation_reason', 'service_request_id',
        'reminder_sent_at', 'booking_channel',
        'checked_in_at', 'checked_in_by',
        'clinical_completed_at', 'clinical_completed_by',
        'checked_out_at', 'checked_out_by',
        'outcome', 'emergency', 'confinement_recommended',
        'follow_up_required', 'follow_up_due',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'paid_at' => 'datetime',
        'reminder_sent_at' => 'datetime',
        'checked_in_at' => 'datetime',
        'clinical_completed_at' => 'datetime',
        'checked_out_at' => 'datetime',
        'follow_up_due' => 'date',
        'emergency' => 'boolean',
        'confinement_recommended' => 'boolean',
        'follow_up_required' => 'boolean',
    ];

    // Patient-care workflow statuses (Phase B vocabulary)
    const STATUS_REQUESTED = 'requested';
    const STATUS_SCHEDULED = 'scheduled';
    const STATUS_CHECKED_IN = 'checked_in';
    const STATUS_IN_CONSULTATION = 'in_consultation';
    const STATUS_IN_TREATMENT = 'in_treatment';
    const STATUS_AWAITING_RESULTS = 'awaiting_results';
    const STATUS_CLINICAL_COMPLETE = 'clinical_complete';
    const STATUS_CHECKOUT = 'checkout';
    const STATUS_COMPLETED = 'completed';
    const STATUS_CANCELLED = 'cancelled';
    const STATUS_REJECTED = 'rejected';
    const STATUS_NO_SHOW = 'no_show';

    // Visit outcomes recorded at clinical completion (Phase B+).
    const OUTCOMES = ['discharged_home', 'admitted', 'referred', 'deceased'];

    /**
     * Valid statuses
     */
    public const VALID_STATUSES = [
        self::STATUS_REQUESTED,
        self::STATUS_SCHEDULED,
        self::STATUS_CHECKED_IN,
        self::STATUS_IN_CONSULTATION,
        self::STATUS_IN_TREATMENT,
        self::STATUS_AWAITING_RESULTS,
        self::STATUS_CLINICAL_COMPLETE,
        self::STATUS_CHECKOUT,
        self::STATUS_COMPLETED,
        self::STATUS_CANCELLED,
        self::STATUS_REJECTED,
        self::STATUS_NO_SHOW,
    ];

    /**
     * Predefined cancellation reason codes. 'other' requires a free-text
     * explanation provided by the caller.
     */
    public const CANCELLATION_REASONS = [
        'client_request' => 'Client requested cancellation',
        'client_no_show' => 'Client did not show up',
        'veterinarian_unavailable' => 'Veterinarian unavailable',
        'schedule_conflict' => 'Scheduling conflict',
        'pet_not_fit' => 'Pet not fit for the appointment',
        'duplicate_booking' => 'Duplicate or mistaken booking',
        'other' => 'Other',
    ];

    /**
     * Boot method for model-level validation and notification hooks.
     */
    protected static function boot()
    {
        parent::boot();

        static::saving(function ($appointment) {
            $appointment->inheritBookingChannelFromRequest();

            // Validate status — map legacy vocabulary forward, reject unknowns
            if (!in_array($appointment->status, self::VALID_STATUSES)) {
                if ($appointment->status === 'needs_confinement') {
                    $appointment->confinement_recommended = true;
                }
                $mapped = \App\Support\VisitStatusMap::forward($appointment->status, false);
                $appointment->status = $mapped ?? self::STATUS_REQUESTED;
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

        static::created(function ($appointment) {
            NotificationService::notifyAppointmentCreated($appointment);
        });

        static::updating(function ($appointment) {
            if ($appointment->isDirty('status')) {
                $appointment->statusBeforeUpdate = $appointment->getOriginal('status');
            }
        });

        static::updated(function ($appointment) {
            if ($appointment->statusBeforeUpdate !== null && $appointment->status !== $appointment->statusBeforeUpdate) {
                NotificationService::notifyAppointmentStatusChange($appointment, $appointment->statusBeforeUpdate);
                $appointment->statusBeforeUpdate = null;
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

    public function checkedInBy()
    {
        return $this->belongsTo(User::class, 'checked_in_by');
    }

    public function serviceRequest(): BelongsTo
    {
        return $this->belongsTo(ServiceRequest::class, 'service_request_id');
    }

    public function billingPaymentRequests(): HasMany
    {
        return $this->hasMany(ServiceBillingPaymentRequest::class);
    }

    public function medicalRecords()
    {
        return $this->hasMany(MedicalRecord::class);
    }

    // Check if appointment can be cancelled
    public function canBeCancelled(): bool
    {
        return !in_array($this->status, [
            self::STATUS_COMPLETED,
            self::STATUS_CANCELLED,
            self::STATUS_REJECTED,
            self::STATUS_NO_SHOW,
        ], true);
    }

    // Check if appointment can be rescheduled
    public function canBeRescheduled(): bool
    {
        return in_array($this->status, [self::STATUS_REQUESTED, self::STATUS_SCHEDULED]);
    }

    // Check if appointment can be completed
    public function canBeCompleted(): bool
    {
        return in_array($this->status, [
            self::STATUS_CLINICAL_COMPLETE,
            self::STATUS_CHECKOUT,
        ], true);
    }

    public function medicalConfinements()
    {
        return $this->hasMany(MedicalConfinement::class, 'consultation_id');
    }
}
