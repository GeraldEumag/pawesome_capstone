<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BoardingCareLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'boarding_id',
        'confinement_id',
        'logged_by',
        'log_type',
        'title',
        'notes',
        'feeding_amount',
        'medication_given',
        'behavior_notes',
        'health_observation',
        'photo_path',
    ];

    protected $hidden = ['photo_path'];

    protected $appends = ['photo_url'];

    /**
     * Care-log photos are private files — expose an authenticated viewing
     * endpoint instead of the storage path.
     */
    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path ? "/api/files/care-logs/{$this->id}/view" : null;
    }

    public const VALID_TYPES = [
        'feeding',
        'water',
        'walk',
        'playtime',
        'medication',
        'cleaning',
        'behavior',
        'health_observation',
        'general_update',
    ];

    public function boarding()
    {
        return $this->belongsTo(Boarding::class);
    }

    public function confinement()
    {
        return $this->belongsTo(MedicalConfinement::class, 'confinement_id');
    }

    public function loggedBy()
    {
        return $this->belongsTo(User::class, 'logged_by');
    }
}
