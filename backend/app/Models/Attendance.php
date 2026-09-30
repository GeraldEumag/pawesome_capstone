<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Attendance extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'attendance';

    protected $fillable = [
        'user_id',
        'employee_id',
        'date',
        'check_in',
        'check_out',
        'break_time',
        'total_hours',
        'overtime_hours',
        'status',
        'is_late',
        'is_early_leave',
        'location',
        'notes',
        'remarks',
        'review_status',
        'approved_by',
        'salary_rate',
        'daily_earnings',
        'source',
        'biometric_id',
        'terminal_id',
    ];

    protected $casts = [
        'date' => 'date',
        'check_in' => 'datetime:H:i',
        'check_out' => 'datetime:H:i',
        'break_time' => 'datetime:H:i',
        'total_hours' => 'decimal:2',
        'overtime_hours' => 'decimal:2',
        'is_late' => 'boolean',
        'is_early_leave' => 'boolean',
        'salary_rate' => 'decimal:2',
        'daily_earnings' => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    protected static function boot()
    {
        parent::boot();

        static::saving(function ($attendance) {
            $attendance->calculateHours();
            $attendance->calculateEarnings();
        });
    }

    public function calculateHours(): void
    {
        if ($this->check_in && $this->check_out) {
            $checkIn  = \Carbon\Carbon::parse($this->check_in);
            $checkOut = \Carbon\Carbon::parse($this->check_out);

            $totalMinutes = $checkIn->diffInMinutes($checkOut);

            // Break time: parse H:i as integer minutes (avoids diffInMinutes-from-midnight bug)
            if ($this->break_time) {
                $parts        = explode(':', (string) $this->break_time);
                $breakMinutes = ((int) $parts[0]) * 60 + ((int) ($parts[1] ?? 0));
            } else {
                $breakMinutes = \App\Support\CompanySchedule::breakMinutes();
            }

            $workMinutes        = max(0, $totalMinutes - $breakMinutes);
            $this->total_hours  = (float) round($workMinutes / 60, 2);

            // Overtime beyond company threshold (default 8 h)
            $threshold = \App\Support\CompanySchedule::overtimeThreshold();
            $this->overtime_hours = $this->total_hours > $threshold
                ? (float) round($this->total_hours - $threshold, 2)
                : 0.0;

            // NOTE: is_late, is_early_leave, and status are intentionally NOT set
            // here — the barcode kiosk and PayrollComputationService set them using
            // the company shift_start / grace period so they are schedule-aware.
        }
    }

    public function calculateEarnings(): void
    {
        if ($this->salary_rate && $this->total_hours) {
            $regularPay = $this->total_hours * $this->salary_rate;
            $overtimePay = $this->overtime_hours * ($this->salary_rate * 1.5); // 1.5x for overtime
            $this->daily_earnings = (float) round($regularPay + $overtimePay, 2);
        }
    }

    public function scopeForDate($query, $date)
    {
        return $query->where('date', $date);
    }

    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeForEmployee($query, $employeeId)
    {
        return $query->where('employee_id', $employeeId);
    }

    public function scopeForPeriod($query, $startDate, $endDate)
    {
        return $query->whereBetween('date', [$startDate, $endDate]);
    }

    public function scopePresent($query)
    {
        return $query->whereIn('status', ['present', 'late', 'early_leave']);
    }

    public function scopeAbsent($query)
    {
        return $query->where('status', 'absent');
    }
}
