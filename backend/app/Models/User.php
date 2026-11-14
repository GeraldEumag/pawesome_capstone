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
        'sss_no',
        'philhealth_no',
        'pagibig_no',
        'tin',
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
     * Person names are stored in ALL CAPS — business/email convention.
     */
    private static function upperName(?string $value): ?string
    {
        if ($value === null) return null;
        $trimmed = trim($value);
        return $trimmed === '' ? null : mb_strtoupper($trimmed);
    }

    public function setNameAttribute($value): void
    {
        $this->attributes['name'] = self::upperName($value);
    }

    public function setFirstNameAttribute($value): void
    {
        $this->attributes['first_name'] = self::upperName($value);
    }

    public function setMiddleNameAttribute($value): void
    {
        $this->attributes['middle_name'] = self::upperName($value);
    }

    public function setLastNameAttribute($value): void
    {
        $this->attributes['last_name'] = self::upperName($value);
    }

    public function setSuffixAttribute($value): void
    {
        $this->attributes['suffix'] = self::upperName($value);
    }

    public function setEmergencyContactPersonAttribute($value): void
    {
        $this->attributes['emergency_contact_person'] = self::upperName($value);
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

    public function dayOffs()
    {
        return $this->hasMany(EmployeeDayOff::class, 'user_id');
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

        // Soft-delete frees the unique identity columns (email, username,
        // employee_no are DB-unique) so the same identity can register again;
        // originals are preserved in original_* for audit and restore.
        // runSoftDelete() only writes deleted_at — the swap must save itself.
        static::deleting(function (User $user) {
            $user->tombstoneIdentity();
            $user->save();
        });

        static::restoring(function (User $user) {
            return $user->restoreIdentity();
        });
    }

    /**
     * Replace unique identity columns with deterministic tombstones so the
     * real values leave the unique indexes while the row is trashed.
     */
    public function tombstoneIdentity(): void
    {
        if ($this->email) {
            $this->original_email = $this->email;
            $this->email = "deleted_{$this->id}@users.invalid";
        }
        if ($this->username) {
            $this->original_username = $this->username;
            $this->username = "deleted_{$this->id}";
        }
        if ($this->employee_no) {
            $this->original_employee_no = $this->employee_no;
            $this->employee_no = "DEL-{$this->id}";
        }
    }

    /**
     * Put the preserved identity back on restore. Returns false when another
     * account has since claimed the email, username, or employee number —
     * the restore must not steal identifiers from a live account.
     */
    public function restoreIdentity(): bool
    {
        $hasOriginals = $this->original_email || $this->original_username || $this->original_employee_no;

        if ($hasOriginals) {
            $conflict = static::withTrashed()
                ->where('id', '!=', $this->id)
                ->where(function ($q) {
                    if ($this->original_email) {
                        $q->orWhere('email', $this->original_email);
                    }
                    if ($this->original_username) {
                        $q->orWhere('username', $this->original_username);
                    }
                    if ($this->original_employee_no) {
                        $q->orWhere('employee_no', $this->original_employee_no);
                    }
                })->exists();

            if ($conflict) {
                return false;
            }
        }

        if ($this->original_email) {
            $this->email = $this->original_email;
            $this->original_email = null;
        }
        if ($this->original_username) {
            $this->username = $this->original_username;
            $this->original_username = null;
        }
        if ($this->original_employee_no) {
            $this->employee_no = $this->original_employee_no;
            $this->original_employee_no = null;
        }

        return true;
    }

    /**
     * Centralized role access check that honors composite roles.
     *
     * - admin has access to all STAFF roles, but never the customer role.
     * - super_receptionist inherits receptionist + cashier + inventory.
     * - All other roles use a normal in_array check (existing behaviour unchanged).
     */
    public function hasRoleAccess(string ...$roles): bool
    {
        $effectiveRole = $this->role === 'super_admin' ? 'admin' : $this->role;

        if ($effectiveRole === 'admin') {
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
