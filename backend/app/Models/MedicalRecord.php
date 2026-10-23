<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class MedicalRecord extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'pet_id',
        'customer_id',
        'appointment_id',
        'veterinarian_id',
        'visit_date',
        'chief_complaint',
        'symptoms',
        'physical_examination',
        'diagnosis',
        'secondary_diagnosis',
        'treatment_plan',
        'procedure_notes',
        'follow_up_instructions',
        'weight_kg',
        'temperature_celsius',
        'heart_rate',
        'respiratory_rate',
        'body_condition_score',
        'status',
        'finalized_at',
        'finalized_by',
        'content_hash',
        'is_editable',
        'locked_at',
        'locked_by',
        'notes',
    ];

    protected $casts = [
        'visit_date' => 'datetime',
        'finalized_at' => 'datetime',
        'locked_at' => 'datetime',
        'weight_kg' => 'decimal:2',
        'temperature_celsius' => 'decimal:1',
        'is_editable' => 'boolean',
    ];

    // Status constants
    const STATUS_DRAFT = 'draft';
    const STATUS_FINALIZED = 'finalized';
    const STATUS_LOCKED = 'locked';

    /**
     * Stamp the finalization moment on the draft -> finalized transition, so
     * every path (direct update, finalize endpoint) records author, time and a
     * hash of the clinical content.
     */
    protected static function boot()
    {
        parent::boot();

        static::saving(function (MedicalRecord $record) {
            if ($record->isDirty('status') && $record->status === self::STATUS_FINALIZED && $record->getOriginal('status') !== self::STATUS_FINALIZED) {
                $record->finalized_at = now();
                $record->finalized_by = auth()->id();
                $record->content_hash = $record->clinicalContentHash();
            }
        });
    }

    public function clinicalContentHash(): string
    {
        $content = $this->only(self::CLINICAL_FIELDS);

        return hash('sha256', json_encode($content, JSON_THROW_ON_ERROR));
    }

    /** Fields covered by the finalization hash. */
    public const CLINICAL_FIELDS = [
        'chief_complaint', 'symptoms', 'physical_examination', 'diagnosis', 'secondary_diagnosis',
        'treatment_plan', 'procedure_notes', 'follow_up_instructions', 'weight_kg', 'temperature_celsius',
        'heart_rate', 'respiratory_rate', 'body_condition_score', 'notes',
    ];

    /**
     * Relationships
     */
    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function veterinarian(): BelongsTo
    {
        return $this->belongsTo(User::class, 'veterinarian_id');
    }

    public function lockedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'locked_by');
    }

    public function prescriptions(): HasMany
    {
        return $this->hasMany(Prescription::class);
    }

    public function vaccinations(): HasMany
    {
        return $this->hasMany(Vaccination::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(MedicalAttachment::class);
    }

    public function addenda(): HasMany
    {
        return $this->hasMany(MedicalRecordAddendum::class)->orderBy('created_at')->orderBy('id');
    }

    /**
     * Access control methods
     */
    public function canBeEditedBy(User $user): bool
    {
        // Finalized and locked records are append-only: corrections go through
        // an addendum, and no role (admins included) rewrites clinical content.
        if ($this->status !== self::STATUS_DRAFT) {
            return false;
        }

        // Admins are not clinicians and do not write clinical content.
        return $user->hasRoleAccess('veterinary', 'vet', 'veterinarian') && $this->veterinarian_id === $user->id;
    }

    /**
     * Only the veterinarian who authored the record, or the vet assigned to its
     * visit, may add an addendum. Admins are not clinicians.
     */
    public function canReceiveAddendumFrom(User $user): bool
    {
        if (!$user->hasRoleAccess('veterinary', 'vet', 'veterinarian')) {
            return false;
        }

        if ((int) $this->veterinarian_id === (int) $user->id) {
            return true;
        }

        return (bool) $this->appointment_id
            && Appointment::whereKey($this->appointment_id)->where('veterinarian_id', $user->id)->exists();
    }

    public function canBeViewedBy(User $user): bool
    {
        // All staff roles can view medical records
        return $user->hasRoleAccess('admin', 'veterinary', 'vet', 'veterinarian', 'receptionist', 'manager');
    }

    public function lock(User $user): void
    {
        $this->update([
            'status' => self::STATUS_LOCKED,
            'is_editable' => false,
            'locked_at' => now(),
            'locked_by' => $user->id,
        ]);
    }

    public function finalize(): void
    {
        $this->update([
            'status' => self::STATUS_FINALIZED,
            'is_editable' => true,
        ]);
    }

    /**
     * Scopes
     */
    public function scopeForPet($query, $petId)
    {
        return $query->where('pet_id', $petId);
    }

    public function scopeByVeterinarian($query, $vetId)
    {
        return $query->where('veterinarian_id', $vetId);
    }

    public function scopeEditable($query)
    {
        return $query->where('is_editable', true);
    }

    public function scopeLocked($query)
    {
        return $query->where('status', self::STATUS_LOCKED);
    }

    public function scopeRecent($query, $days = 30)
    {
        return $query->where('visit_date', '>=', now()->subDays($days));
    }
}
