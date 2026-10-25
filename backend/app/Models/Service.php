<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Service extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'category',
        'price',
        'description',
        'is_active',
        'duration_minutes',
        'image_path',
    ];

    protected $appends = ['image_url'];

    public function getImageUrlAttribute(): ?string
    {
        return $this->image_path ? \Illuminate\Support\Facades\Storage::disk('public')->url($this->image_path) : null;
    }

    protected $casts = [
        'price' => 'decimal:2',
        'is_active' => 'boolean',
        'duration_minutes' => 'integer',
    ];

    /**
     * Valid service categories
     */
    public const VALID_CATEGORIES = [
        'Consultation',
        'Vaccination',
        'Treatment',
        'Emergency',
        'Surgery',
        'Dental',
        'Diagnostics',
        'Boarding Care',
        'Medication',
        'Grooming',
        'Hotel',
        'Daycare',
        'Other',
    ];

    /**
     * Categories the veterinary role may create/edit — medical services only.
     * Front-desk categories (Boarding Care, Grooming, Hotel, Daycare, Other)
     * are managed by receptionist/manager/admin.
     */
    public const VET_CATEGORIES = [
        'Consultation',
        'Vaccination',
        'Treatment',
        'Emergency',
        'Surgery',
        'Dental',
        'Diagnostics',
        'Medication',
    ];

    /**
     * Appointment statuses that block service deletion — every non-terminal
     * status in the Phase B vocabulary (see Appointment::VALID_STATUSES), plus
     * the legacy spellings that are mapped forward on write.
     */
    public const BLOCKING_APPOINTMENT_STATUSES = [
        'requested',
        'scheduled',
        'checked_in',
        'in_consultation',
        'in_treatment',
        'awaiting_results',
        'clinical_complete',
        'checkout',
        // Legacy spellings (mapped forward to requested/scheduled on save)
        'pending',
        'approved',
    ];

    
    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    /**
     * Scope: Active services only
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * Scope: By category
     */
    public function scopeByCategory($query, $category)
    {
        return $query->where('category', $category);
    }

    /**
     * Activate service
     */
    public function activate(): void
    {
        $this->update(['is_active' => true]);
    }

    /**
     * Deactivate service
     */
    public function deactivate(): void
    {
        $this->update(['is_active' => false]);
    }

    /**
     * Get formatted price
     */
    public function getFormattedPrice(): string
    {
        return '₱' . number_format((float) $this->price, 2);
    }

    /**
     * Get duration in minutes with label
     */
    public function getDurationLabel(): string
    {
        if (!$this->duration_minutes) {
            return 'N/A';
        }
        return $this->duration_minutes . ' min';
    }
}
