<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\SoftDeletes;

class User extends Authenticatable
{
    use SoftDeletes;
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'username',
        'employee_no',
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
     * When no photo is uploaded, falls back to a locally generated initials
     * avatar (data-URI SVG) so every user has an identity image with no
     * external dependency. The raw stored value is still available via
     * getRawOriginal('profile_photo').
     */
    public function getProfilePhotoAttribute($value): ?string
    {
        if (!$value) {
            return $this->initialsAvatarUrl();
        }
        // Already a full URL or API path (possibly with ?v= cache buster)
        $base = strtok($value, '?');
        if (str_starts_with($base, '/api/') || str_starts_with($base, 'http')) {
            return $value;
        }
        return "/api/files/profile-photos/{$this->id}/view";
    }

    /**
     * Inline SVG initials avatar — deterministic color derived from the name
     * so each user keeps a consistent identity color.
     */
    private function initialsAvatarUrl(): string
    {
        $name = trim((string) ($this->name ?: $this->email ?: '?'));
        $parts = preg_split('/\s+/', $name) ?: [];
        $initials = count($parts) > 1
            ? mb_strtoupper(mb_substr($parts[0], 0, 1) . mb_substr(end($parts), 0, 1))
            : mb_strtoupper(mb_substr($name, 0, 1));

        $palette = ['#d63384', '#7c3aed', '#0d9488', '#ea580c', '#2563eb', '#be185d', '#4d7c0f'];
        $bg = $palette[crc32(strtolower($name)) % count($palette)];

        $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">'
            . '<rect width="200" height="200" fill="' . $bg . '"/>'
            . '<text x="50%" y="50%" dy=".36em" text-anchor="middle" fill="#fff"'
            . ' font-family="Arial, sans-serif" font-size="84" font-weight="700">'
            . htmlspecialchars($initials, ENT_XML1) . '</text></svg>';

        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }

    public function customer()
    {
        return $this->hasOne(Customer::class);
    }

    public function employeeRecord()
    {
        return $this->hasOne(Employee::class);
    }

    public function isAdmin(): bool
    {
        return in_array($this->role, ['admin', 'super_admin'], true);
    }

    /**
     * Auto-assign a unified employee number (used as the attendance kiosk
     * barcode) to staff accounts. Customers don't get one.
     */
    protected static function booted(): void
    {
        static::creating(function (User $user) {
            if (!$user->employee_no && $user->role && $user->role !== 'customer') {
                $user->employee_no = Employee::nextEmployeeNo();
            }
        });
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === 'super_admin';
    }

    /**
     * Centralized role access check that honors composite super roles.
     *
     * - super_admin has access to all STAFF roles, but never the customer role.
     * - super_receptionist inherits receptionist + cashier + inventory.
     * - All other roles use a normal in_array check (existing behaviour unchanged).
     */
    public function hasRoleAccess(string ...$roles): bool
    {
        if ($this->role === 'super_admin') {
            if (count($roles) === 1 && $roles[0] === 'customer') {
                return false;
            }
            return true;
        }

        if ($this->role === 'super_receptionist') {
            $expanded = ['receptionist', 'cashier', 'inventory'];
            return !empty(array_intersect($expanded, $roles));
        }

        return in_array($this->role, $roles, true);
    }
}
