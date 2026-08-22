<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Vaccination extends Model
{
    use HasFactory;

    protected $fillable = [
        'pet_id',
        'medical_record_id',
        'veterinarian_id',
        'vaccine_name',
        'vaccine_type',
        'manufacturer',
        'lot_number',
        'date_administered',
        'next_due_date',
        'dosage',
        'dosage_unit',
        'route_of_administration',
        'site_of_administration',
        'status',
        'notes',
        'is_editable',
    ];

    protected $casts = [
        'date_administered' => 'date',
        'next_due_date' => 'date',
        'dosage' => 'decimal:3',
        'is_editable' => 'boolean',
    ];

    // Status constants
    const STATUS_GIVEN = 'given';
    const STATUS_PENDING = 'pending';
    const STATUS_OVERDUE = 'overdue';
    const STATUS_WAIVED = 'waived';

    // Vaccine type constants
    const TYPE_CORE = 'Core';
    const TYPE_NON_CORE = 'Non-core';
    const TYPE_LIFESTYLE = 'Lifestyle';

    /**
     * Relationships
     */
    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function medicalRecord(): BelongsTo
    {
        return $this->belongsTo(MedicalRecord::class);
    }

    public function veterinarian(): BelongsTo
    {
        return $this->belongsTo(User::class, 'veterinarian_id');
    }

    /**
     * Access control
     */
    public function canBeEditedBy(User $user): bool
    {
        if (!$this->is_editable) {
            return false;
        }

        return $user->hasRoleAccess('admin', 'veterinary', 'vet');
    }

    /**
     * Check if vaccination is due or overdue
     */
    public function isDue(): bool
    {
        if (!$this->next_due_date) {
            return false;
        }

        return now()->gte($this->next_due_date);
    }

    public function daysUntilDue(): ?int
    {
        if (!$this->next_due_date) {
            return null;
        }

        return now()->diffInDays($this->next_due_date, false);
    }

    /**
     * Scopes
     */
    public function scopeForPet($query, $petId)
    {
        return $query->where('pet_id', $petId);
    }

    public function scopeDue($query)
    {
        return $query->whereNotNull('next_due_date')
                     ->where('next_due_date', '<=', now());
    }

    public function scopeUpcoming($query, $days = 30)
    {
        return $query->whereNotNull('next_due_date')
                     ->whereBetween('next_due_date', [now(), now()->addDays($days)]);
    }

    public function scopeByVaccine($query, $vaccineName)
    {
        return $query->where('vaccine_name', $vaccineName);
    }

    public function scopeCoreVaccines($query)
    {
        return $query->where('vaccine_type', self::TYPE_CORE);
    }

    public function scopeEditable($query)
    {
        return $query->where('is_editable', true);
    }

    /**
     * Get the most recent vaccination for a specific vaccine
     */
    public static function getLatestForVaccine($petId, $vaccineName): ?self
    {
        return self::forPet($petId)
            ->byVaccine($vaccineName)
            ->where('status', self::STATUS_GIVEN)
            ->latest('date_administered')
            ->first();
    }
}
