<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Pet extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_id',
        'name',
        'type',
        'species',
        'breed',
        'birthdate',
        'birth_date',
        'age',
        'gender',
        'image',
        'notes',
        'status',
        'archived_at',
        'archived_by',
    ];

    protected $dates = ['archived_at', 'birthdate', 'birth_date'];

    protected $casts = [
        'birthdate' => 'date',
        'birth_date' => 'date',
    ];

    protected $appends = ['image_url'];

    /**
     * Scope to get only active pets
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope to get only archived pets
     */
    public function scopeArchived($query)
    {
        return $query->where('status', 'archived');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Get the full URL for the pet's image.
     */
    public function getImageUrlAttribute(): ?string
    {
        if (!$this->image) {
            return null;
        }

        if (str_starts_with($this->image, 'http')) {
            return $this->image;
        }

        $cacheBuster = $this->updated_at ? $this->updated_at->timestamp : time();
        return "/api/files/pet-photos/{$this->id}/view?t={$cacheBuster}";
    }

    public function appointments()
    {
        return $this->hasMany(Appointment::class);
    }

    public function boardings()
    {
        return $this->hasMany(Boarding::class);
    }

    public function medicalRecords()
    {
        return $this->hasMany(MedicalRecord::class)->orderBy('visit_date', 'desc');
    }

    public function vaccinations()
    {
        return $this->hasMany(Vaccination::class)->orderBy('date_administered', 'desc');
    }

    public function groomingAppointments()
    {
        return $this->hasMany(ServiceRequest::class)->where('service_type', 'grooming');
    }

    /**
     * Get latest medical record
     */
    public function latestMedicalRecord()
    {
        return $this->hasOne(MedicalRecord::class)->latest('visit_date');
    }

    /**
     * Get upcoming vaccinations
     */
    public function upcomingVaccinations($days = 30)
    {
        return $this->vaccinations()
            ->whereNotNull('next_due_date')
            ->whereBetween('next_due_date', [now(), now()->addDays($days)])
            ->orderBy('next_due_date');
    }

    /**
     * Relationship to user who archived this pet
     */
    public function archivedBy()
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    /**
     * Archive the pet
     */
    public function archive($reason = '', $userId = null)
    {
        $this->status = 'archived';
        $this->archived_at = now();
        $this->archived_by = $userId ?? auth()->id();
        $this->save();

        // Log the archiving action
        ActivityLog::create([
            'user_id' => $this->archived_by,
            'action' => 'archived',
            'subject_type' => 'Pet',
            'subject_id' => $this->id,
            'description' => "Archived pet: {$this->name}. Reason: {$reason}",
            'properties' => [
                'old_status' => 'active',
                'new_status' => 'archived',
                'archive_reason' => $reason,
            ],
        ]);
    }

    /**
     * Unarchive the pet
     */
    public function unarchive($userId = null)
    {
        $this->status = 'active';
        $this->archived_at = null;
        $this->archived_by = null;
        $this->save();

        // Log the unarchiving action
        ActivityLog::create([
            'user_id' => $userId ?? auth()->id(),
            'action' => 'unarchived',
            'subject_type' => 'Pet',
            'subject_id' => $this->id,
            'description' => "Unarchived pet: {$this->name}",
            'properties' => [
                'old_status' => 'archived',
                'new_status' => 'active',
            ],
        ]);
    }

    /**
     * Check if pet is archived
     */
    public function isArchived(): bool
    {
        return $this->status === 'archived';
    }
}
