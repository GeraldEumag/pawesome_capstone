<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'username',
        'email',
        'password',
        'role',
        'base_salary',
        'hourly_rate',
        'work_start_time',
        'work_end_time',
        'working_days_per_week',
        'department',
        'position',
        'employment_date',
        'employment_status',
        'is_active',
        'first_name',
        'middle_name',
        'last_name',
        'suffix',
        'phone',
        'address',
        'city',
        'state',
        'zip_code',
        'country',
        'bio',
        'profile_photo',
        'profile_image',
        'date_of_birth',
        'gender',
        'emergency_contact_person',
        'emergency_contact_number',
        'api_token',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'api_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    /**
     * Always return the API-accessible URL for the profile photo.
     * This ensures img tags can load it directly without auth headers.
     */
    public function getProfilePhotoAttribute($value): ?string
    {
        if (!$value) return null;
        // Already a full URL or API path (possibly with ?v= cache buster)
        $base = strtok($value, '?');
        if (str_starts_with($base, '/api/') || str_starts_with($base, 'http')) {
            return $value;
        }
        return "/api/files/profile-photos/{$this->id}/view";
    }

    public function customer()
    {
        return $this->hasOne(Customer::class);
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }
}
