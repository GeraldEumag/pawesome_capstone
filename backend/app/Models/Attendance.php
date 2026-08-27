<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    use HasFactory;

    protected $table = 'attendance';

    protected $fillable = [
        'user_id',
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
            $checkIn = \Carbon\Carbon::parse($this->check_in);
            $checkOut = \Carbon\Carbon::parse($this->check_out);
            
            $totalMinutes = $checkIn->diffInMinutes($checkOut);
            
            // Subtract break time (default 1 hour = 60 minutes)
            $breakMinutes = $this->break_time 
                ? \Carbon\Carbon::parse($this->break_time)->diffInMinutes(\Carbon\Carbon::parse('00:00')) 
                : 60;
            
            $workMinutes = max(0, $totalMinutes - $breakMinutes);
            $this->total_hours = (float) round($workMinutes / 60, 2);
            
            // Calculate overtime (standard 8 hours)
            $standardHours = 8;
            if ($this->total_hours > $standardHours) {
                $this->overtime_hours = (float) round($this->total_hours - $standardHours, 2);
            } else {
                $this->overtime_hours = 0.0;
            }
            
            // Check if late (after 08:00)
            $this->is_late = $checkIn->format('H:i') > '08:00';
            
            // Check early leave (before 17:00)
            $this->is_early_leave = $checkOut->format('H:i') < '17:00';
            
            // Update status based on time
            if ($this->is_late && !$this->is_early_leave) {
                $this->status = 'late';
            } elseif ($this->is_early_leave && !$this->is_late) {
                $this->status = 'early_leave';
            } elseif ($this->is_late && $this->is_early_leave) {
                $this->status = 'late';
            } else {
                $this->status = 'present';
            }
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
