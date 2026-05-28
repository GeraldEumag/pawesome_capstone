<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Service extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'category',
        'price',
        'description',
        'is_active',
        'duration_minutes',
    ];

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
        if (!$this->duration) {
            return 'N/A';
        }
        return $this->duration . ' min';
    }
}
