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

        // Calculate withholding tax (BIR 2023-onwards, RR 11-2018 Annex E)
        // Taxable income = gross_pay - statutory contributions (SSS, PhilHealth, Pag-IBIG)
        $this->tax_deduction = (float) $this->calculateWithholdingTax();

        // Calculate total deductions
        $totalDeductions = $this->sss_contribution + $this->philhealth_contribution +
                          $this->pagibig_contribution + $this->tax_deduction +
                          $this->late_deductions + $this->absent_deductions + $this->deductions;

        // Calculate net pay
        $this->net_pay = (float) max(0, $this->gross_pay - $totalDeductions);
    }

    /**
     * Calculate BIR monthly withholding tax on compensation (2023 onwards, RR 11-2018 Annex E).
     * Taxable income = gross_pay - SSS - PhilHealth - Pag-IBIG (non-taxable statutory contributions).
     */
    private function calculateWithholdingTax(): float
    {
        $taxableIncome = (float) $this->gross_pay
            - (float) $this->sss_contribution
            - (float) $this->philhealth_contribution
            - (float) $this->pagibig_contribution;

        if ($taxableIncome <= 0) {
            return 0.0;
        }

        // BIR Monthly Withholding Tax Table (effective January 1, 2023)
        if ($taxableIncome <= 20833) {
            return 0.0;
        }
        if ($taxableIncome <= 33332) {
            return ($taxableIncome - 20833) * 0.15;
        }
        if ($taxableIncome <= 66666) {
            return 1875 + ($taxableIncome - 33333) * 0.20;
        }
        if ($taxableIncome <= 166666) {
            return 8541.80 + ($taxableIncome - 66667) * 0.25;
        }
        if ($taxableIncome <= 666666) {
            return 33541.80 + ($taxableIncome - 166667) * 0.30;
        }
        return 183541.80 + ($taxableIncome - 666667) * 0.35;
    }

    private function calculateSSS(): float
    {
        // SSS 2025 (effective January 1, 2025, SSS Circular No. 2024-006)
        // Employee share = 5.0% of Monthly Salary Credit (MSC)
        // MSC ranges from 5,000 to 35,000 in 500-peso increments
        $salary = (float) $this->base_salary;

        if ($salary <= 0) {
            return 0.0;
        }

        // Determine MSC from salary
        if ($salary <= 5250) {
            $msc = 5000;
        } elseif ($salary >= 34750) {
            $msc = 35000;
        } else {
            // Round up to nearest 500
            $msc = (int) ceil($salary / 500) * 500;
        }

        return round($msc * 0.05, 2);
    }

    private function calculatePhilHealth(): float
    {
        // PhilHealth 2024: 5% premium rate, max P5,000
        // Employee share = 50% of premium
        // Min premium: P500 (for salary <= 10,000)
        // Max premium: P5,000 (for salary >= 100,000)
        $salary = (float) $this->base_salary;
        $premium = max(500, min($salary * 0.05, 5000));
        return $premium / 2; // Employee share is half
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
