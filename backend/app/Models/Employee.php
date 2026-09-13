<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class Employee extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_no',
        'user_id',
        'first_name',
        'middle_name',
        'last_name',
        'suffix',
        'birthdate',
        'gender',
        'civil_status',
        'phone',
        'email',
        'address',
        'emergency_contact_name',
        'emergency_contact_phone',
        'position',
        'department',
        'hire_date',
        'employment_status',
        'employment_type',
        'is_active',
        'base_salary',
        'hourly_rate',
        'sss_no',
        'philhealth_no',
        'pagibig_no',
        'tin_no',
    ];

    protected $casts = [
        'birthdate' => 'date',
        'hire_date' => 'date',
        'is_active' => 'boolean',
        'base_salary' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
    ];

    /**
     * Full display name — mirrors the `name` attribute on User so payroll,
     * attendance, and kiosk code can treat both person types uniformly.
     */
    public function getNameAttribute(): string
    {
        return trim(implode(' ', array_filter([
            $this->first_name,
            $this->middle_name,
            $this->last_name,
            $this->suffix,
        ]))) ?: 'Employee';
    }

    /**
     * Pseudo-role so shared payroll rows render consistently.
     */
    public function getRoleAttribute(): string
    {
        return 'employee';
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class, 'employee_id');
    }

    public function payrolls(): HasMany
    {
        return $this->hasMany(Payroll::class, 'employee_id');
    }

    /**
     * Next unified employee number across users + employees (PAW-0007 style).
     */
    public static function nextEmployeeNo(): string
    {
        $maxUser = DB::table('users')
            ->whereNotNull('employee_no')
            ->where('employee_no', 'like', 'PAW-%')
            ->selectRaw("MAX(CAST(SUBSTRING(employee_no, 5) AS UNSIGNED)) as max_no")
            ->value('max_no');

        $maxEmployee = static::where('employee_no', 'like', 'PAW-%')
            ->selectRaw("MAX(CAST(SUBSTRING(employee_no, 5) AS UNSIGNED)) as max_no")
            ->value('max_no');

        $next = max((int) $maxUser, (int) $maxEmployee) + 1;

        return 'PAW-' . str_pad($next, 4, '0', STR_PAD_LEFT);
    }
}
