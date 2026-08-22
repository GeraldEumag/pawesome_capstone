<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MedicalRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'pet_id',
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
        'is_editable',
        'locked_at',
        'locked_by',
        'notes',
    ];

    protected $casts = [
        'visit_date' => 'datetime',
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

    /**
     * Access control methods
     */
    public function canBeEditedBy(User $user): bool
    {
        // Only veterinarians can edit
        if (!$user->hasRoleAccess('veterinary', 'vet', 'veterinarian')) {
            return false;
        }

        // Locked records cannot be edited
        if ($this->status === self::STATUS_LOCKED) {
            return false;
        }

        // Draft records can be edited by the creating vet
        if ($this->status === self::STATUS_DRAFT) {
            return $this->veterinarian_id === $user->id;
        }

        // Finalized records can only be edited by admin or the original vet
        if ($this->status === self::STATUS_FINALIZED) {
            return $user->hasRoleAccess('admin') || $this->veterinarian_id === $user->id;
        }

        return false;
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
