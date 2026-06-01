<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payroll extends Model
{
    use HasFactory;

    protected $fillable = [
        'payroll_id',
        'user_id',
        'department',
        'position',
        'base_salary',
        'hourly_rate',
        'working_days',
        'present_days',
        'absent_days',
        'regular_hours',
        'overtime_hours',
        'overtime_pay',
        'regular_holiday_pay',
        'special_holiday_pay',
        'night_differential',
        'regular_holiday_ot_pay',
        'special_holiday_ot_pay',
        'bonus',
        'allowances',
        'deductions',
        'tax_deduction',
        'sss_contribution',
        'philhealth_contribution',
        'pagibig_contribution',
        'late_deductions',
        'absent_deductions',
        'gross_pay',
        'net_pay',
        'pay_period_start',
        'pay_period_end',
        'pay_period_label',
        'status',
        'payment_date',
        'payment_method',
        'remarks',
        'processed_by',
        'processed_at',
    ];

    protected $casts = [
        'base_salary' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'regular_hours' => 'decimal:2',
        'overtime_hours' => 'decimal:2',
        'overtime_pay' => 'decimal:2',
        'regular_holiday_pay' => 'decimal:2',
        'special_holiday_pay' => 'decimal:2',
        'night_differential' => 'decimal:2',
        'regular_holiday_ot_pay' => 'decimal:2',
        'special_holiday_ot_pay' => 'decimal:2',
        'bonus' => 'decimal:2',
        'allowances' => 'decimal:2',
        'deductions' => 'decimal:2',
        'tax_deduction' => 'decimal:2',
        'sss_contribution' => 'decimal:2',
        'philhealth_contribution' => 'decimal:2',
        'pagibig_contribution' => 'decimal:2',
        'late_deductions' => 'decimal:2',
        'absent_deductions' => 'decimal:2',
        'gross_pay' => 'decimal:2',
        'net_pay' => 'decimal:2',
        'payment_date' => 'date',
        'processed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function processor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($payroll) {
            if (empty($payroll->payroll_id)) {
                $payroll->payroll_id = 'PAY-' . date('Y') . '-' . str_pad(static::count() + 1, 4, '0', STR_PAD_LEFT);
            }
        });
    }

    public function calculatePayroll(): void
    {
        $user = $this->user;
        
        if (!$user) {
            return;
        }

        // Set employee details
        $this->department = $user->department ?? 'Unassigned';
        $this->position = $user->position ?? 'Staff';
        
        // Calculate working days in period
        $startDate = \Carbon\Carbon::parse($this->pay_period_start);
        $endDate = \Carbon\Carbon::parse($this->pay_period_end);
        $this->working_days = $startDate->diffInDaysFiltered(function ($date) {
            return !$date->isWeekend();
        }, $endDate);

        // Get attendance records for the period
        $attendanceRecords = Attendance::forPeriod($this->pay_period_start, $this->pay_period_end)
            ->forUser($this->user_id)
            ->get();

        $this->present_days = $attendanceRecords->whereIn('status', ['present', 'late', 'early_leave'])->count();
        $this->absent_days = $attendanceRecords->where('status', 'absent')->count();
        $this->regular_hours = $attendanceRecords->sum('total_hours');
        $this->overtime_hours = $attendanceRecords->sum('overtime_hours');

        // Use user's hourly rate or calculate from base salary
        $this->hourly_rate = (float) ($user->hourly_rate ?? ($user->base_salary ? $user->base_salary / 160 : 0));

        // Calculate earnings
        $dailyRate = $this->base_salary / 22; // Assuming 22 working days per month
        $this->absent_deductions = (float) ($this->absent_days * $dailyRate);
        $this->late_deductions = (float) ($attendanceRecords->where('is_late', true)->count() * ($dailyRate * 0.1)); // 10% deduction per late

        // Calculate overtime pay (1.5x rate)
        $this->overtime_pay = (float) ($this->overtime_hours * ($this->hourly_rate * 1.5));

        // Calculate mandatory deductions (Philippine standard)
        $this->sss_contribution = (float) $this->calculateSSS();
        $this->philhealth_contribution = (float) $this->calculatePhilHealth();
        $this->pagibig_contribution = 100.0; // Fixed P100 for Pag-IBIG

        // Calculate gross pay
        $this->gross_pay = (float) ($this->base_salary + $this->overtime_pay + $this->bonus + $this->allowances);

        // Calculate total deductions
        $totalDeductions = $this->sss_contribution + $this->philhealth_contribution + 
                          $this->pagibig_contribution + $this->tax_deduction + 
                          $this->late_deductions + $this->absent_deductions + $this->deductions;

        // Calculate net pay
        $this->net_pay = (float) max(0, $this->gross_pay - $totalDeductions);
    }

    private function calculateSSS(): float
    {
        // SSS contribution table (simplified)
        $monthlySalary = $this->base_salary;
        
        if ($monthlySalary <= 3250) return 135;
        if ($monthlySalary <= 3750) return 157.50;
        if ($monthlySalary <= 4250) return 180;
        if ($monthlySalary <= 4750) return 202.50;
        if ($monthlySalary <= 5250) return 225;
        if ($monthlySalary <= 5750) return 247.50;
        if ($monthlySalary <= 6250) return 270;
        if ($monthlySalary <= 6750) return 292.50;
        if ($monthlySalary <= 7250) return 315;
        if ($monthlySalary <= 7750) return 337.50;
        if ($monthlySalary <= 8250) return 360;
        if ($monthlySalary <= 8750) return 382.50;
        if ($monthlySalary <= 9250) return 405;
        if ($monthlySalary <= 9750) return 427.50;
        if ($monthlySalary <= 10250) return 450;
        if ($monthlySalary <= 10750) return 472.50;
        if ($monthlySalary <= 11250) return 495;
        if ($monthlySalary <= 11750) return 517.50;
        if ($monthlySalary <= 12250) return 540;
        if ($monthlySalary <= 12750) return 562.50;
        if ($monthlySalary <= 13250) return 585;
        if ($monthlySalary <= 13750) return 607.50;
        if ($monthlySalary <= 14250) return 630;
        if ($monthlySalary <= 14750) return 652.50;
        if ($monthlySalary <= 15250) return 675;
        if ($monthlySalary <= 15750) return 697.50;
        if ($monthlySalary <= 16250) return 720;
        if ($monthlySalary <= 16750) return 742.50;
        if ($monthlySalary <= 17250) return 765;
        if ($monthlySalary <= 17750) return 787.50;
        if ($monthlySalary <= 18250) return 810;
        if ($monthlySalary <= 18750) return 832.50;
        if ($monthlySalary <= 19250) return 855;
        if ($monthlySalary <= 19750) return 877.50;
        if ($monthlySalary <= 20250) return 900;
        if ($monthlySalary <= 20750) return 922.50;
        if ($monthlySalary <= 21250) return 945;
        if ($monthlySalary <= 21750) return 967.50;
        if ($monthlySalary <= 22250) return 990;
        if ($monthlySalary <= 22750) return 1012.50;
        if ($monthlySalary <= 23250) return 1035;
        if ($monthlySalary <= 23750) return 1057.50;
        if ($monthlySalary <= 24250) return 1080;
        if ($monthlySalary <= 24750) return 1102.50;
        return 1125; // Maximum
    }

    private function calculatePhilHealth(): float
    {
        // PhilHealth premium: 3% of monthly salary (capped)
        $premium = $this->base_salary * 0.03;
        return min($premium, 1800) / 2; // Employee share is half
    }

    public function scopeForPeriod($query, $startDate, $endDate)
    {
        return $query->where('pay_period_start', $startDate)
                     ->where('pay_period_end', $endDate);
    }

    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeByStatus($query, $status)
    {
        return $query->where('status', $status);
    }
}
