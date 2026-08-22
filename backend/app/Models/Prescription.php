<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Prescription extends Model
{
    use HasFactory;

    protected $fillable = [
        'medical_record_id',
        'veterinarian_id',
        'medication_name',
        'generic_name',
        'medication_type',
        'dosage',
        'dosage_unit',
        'frequency',
        'duration',
        'route',
        'instructions',
        'quantity_prescribed',
        'quantity_unit',
        'refills_allowed',
        'refills_remaining',
        'start_date',
        'end_date',
        'is_active',
        'side_effects_notes',
        'pharmacist_notes',
        'is_editable',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'quantity_prescribed' => 'decimal:2',
        'refills_allowed' => 'integer',
        'refills_remaining' => 'integer',
        'is_active' => 'boolean',
        'is_editable' => 'boolean',
    ];

    // Common medication types
    const TYPE_ANTIBIOTIC = 'Antibiotic';
    const TYPE_ANTI_INFLAMMATORY = 'Anti-inflammatory';
    const TYPE_PAIN_RELIEVER = 'Pain Reliever';
    const TYPE_ANTIPARASITIC = 'Antiparasitic';
    const TYPE_VITAMIN_SUPPLEMENT = 'Vitamin/Supplement';
    const TYPE_TOPICAL = 'Topical';
    const TYPE_OTHER = 'Other';

    // Common routes
    const ROUTE_ORAL = 'Oral';
    const ROUTE_TOPICAL = 'Topical';
    const ROUTE_SUBCUTANEOUS = 'Subcutaneous';
    const ROUTE_INTRAMUSCULAR = 'Intramuscular';
    const ROUTE_INTRAVENOUS = 'Intravenous';
    const ROUTE_OPHTHALMIC = 'Ophthalmic';
    const ROUTE_OTIC = 'Otic';
    const ROUTE_INHALATION = 'Inhalation';
    const ROUTE_RECTAL = 'Rectal';

    /**
     * Relationships
     */
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
     * Check if prescription is still active
     */
    public function isActive(): bool
    {
        if (!$this->is_active) {
            return false;
        }

        if ($this->end_date && now()->gt($this->end_date)) {
            return false;
        }

        return true;
    }

    /**
     * Decrement refills remaining
     */
    public function useRefill(): bool
    {
        if ($this->refills_remaining > 0) {
            $this->decrement('refills_remaining');
            return true;
        }
        return false;
    }

    /**
     * Scopes
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true)
                     ->where(function ($q) {
                         $q->whereNull('end_date')
                           ->orWhere('end_date', '>=', now());
                     });
    }

    public function scopeForMedicalRecord($query, $recordId)
    {
        return $query->where('medical_record_id', $recordId);
    }

    public function scopeByMedication($query, $medicationName)
    {
        return $query->where('medication_name', $medicationName);
    }

    public function scopeEditable($query)
    {
        return $query->where('is_editable', true);
    }

    /**
     * Get formatted dosage string
     */
    public function getFormattedDosageAttribute(): string
    {
        return "{$this->dosage} {$this->dosage_unit}";
    }

    /**
     * Get full prescription instructions
     */
    public function getFullInstructionsAttribute(): string
    {
        $parts = [
            $this->formatted_dosage,
            $this->frequency,
            $this->route ? "via {$this->route}" : null,
            "for {$this->duration}",
        ];

        return implode(', ', array_filter($parts));
    }

    /**
     * Get common medication types for dropdown
     */
    public static function getMedicationTypes(): array
    {
        return [
            self::TYPE_ANTIBIOTIC,
            self::TYPE_ANTI_INFLAMMATORY,
            self::TYPE_PAIN_RELIEVER,
            self::TYPE_ANTIPARASITIC,
            self::TYPE_VITAMIN_SUPPLEMENT,
            self::TYPE_TOPICAL,
            self::TYPE_OTHER,
        ];
    }

    /**
     * Get common routes for dropdown
     */
    public static function getRoutes(): array
    {
        return [
            self::ROUTE_ORAL,
            self::ROUTE_TOPICAL,
            self::ROUTE_SUBCUTANEOUS,
            self::ROUTE_INTRAMUSCULAR,
            self::ROUTE_INTRAVENOUS,
            self::ROUTE_OPHTHALMIC,
            self::ROUTE_OTIC,
            self::ROUTE_INHALATION,
            self::ROUTE_RECTAL,
        ];
    }
}
