<?php

namespace App\Models;

use App\Support\CompanySchedule;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payroll extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'payroll_id',
        'user_id',
        'employee_id',
        'employee_name',
        'department',
        'position',
        'employment_type',
        'rate_type',
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
        'commission',
        'other_earnings',
        'deductions',
        'tax_deduction',
        'sss_contribution',
        'philhealth_contribution',
        'pagibig_contribution',
        'late_deductions',
        'absent_deductions',
        'paid_leave_days',
        'salary_loan',
        'cash_advance',
        'gross_pay',
        'net_pay',
        'pay_period_start',
        'pay_period_end',
        'pay_period_label',
        'status',
        'payment_date',
        'payment_method',
        'payment_reference',
        'remarks',
        'processed_by',
        'processed_at',
        'approved_by',
        'approved_at',
        'manual_attendance',
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
        'pay_period_start' => 'date',
        'pay_period_end' => 'date',
        'processed_at' => 'datetime',
        'approved_at' => 'datetime',
        'manual_attendance' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function processor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
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
        $person = $this->user ?? $this->employee;

        if (!$person) {
            return;
        }

        // Set employee details
        $this->department = $person->department ?? 'Unassigned';
        $this->position = $person->position ?? 'Staff';
        $this->employee_name = $this->employee_name ?: $person->name;

        $startDate = \Carbon\Carbon::parse($this->pay_period_start)->toDateString();
        $endDate = \Carbon\Carbon::parse($this->pay_period_end)->toDateString();

        /** @var \App\Services\Payroll\PayrollComputationService $service */
        $service = app(\App\Services\Payroll\PayrollComputationService::class);

        // Get attendance records for the period (user account or employee record)
        $attendanceQuery = Attendance::forPeriod($startDate, $endDate);
        $attendanceRecords = $this->employee_id
            ? $attendanceQuery->forEmployee($this->employee_id)->get()
            : $attendanceQuery->forUser($this->user_id)->get();

        // Shared attendance rollup: present/late/early-leave/absent plus
        // auto-absence for scheduled workdays and absent→paid-leave conversion.
        // Skip the period-aware loop (which auto-marks past workdays as absent)
        // when there are no actual punch records and no manual_attendance data —
        // this avoids incorrect mass-absence deductions in unit/formula tests and
        // when payroll is previewed before attendance has been recorded.
        $statsStart = ($attendanceRecords->isEmpty() && empty($this->manual_attendance)) ? null : $startDate;
        $statsEnd   = ($attendanceRecords->isEmpty() && empty($this->manual_attendance)) ? null : $endDate;
        $stats = $service->attendanceStats($person, $attendanceRecords, $statsStart, $statsEnd);
        $factor = $service->periodFactor($startDate, $endDate);

        if ($stats['working_days'] !== null) {
            $this->working_days = $stats['working_days'];
        }

        $this->present_days = $stats['present_days'];
        $this->absent_days = $stats['absent_days'];
        $this->paid_leave_days = $stats['paid_leave_days'];
        $this->regular_hours = $stats['regular_hours'];
        $this->overtime_hours = $stats['overtime_hours'];

        // Stored hourly_rate is authoritative; fallback = base_salary ÷ 208 (26 days × 8 h)
        $this->hourly_rate = (float) ($person->hourly_rate
            ? $person->hourly_rate
            : ($person->base_salary ? round($person->base_salary / 208, 4) : 0));

        $divisor   = CompanySchedule::dailyRateDivisor(); // 26
        $dailyRate = (float) $this->base_salary / $divisor;

        $this->absent_deductions = (float) ($this->absent_days * $dailyRate);

        // Per-minute late deduction (15-min grace tracked in stats)
        $totalLateMinutes    = $stats['total_late_minutes'] ?? ($stats['late_days'] * 0);
        $this->late_deductions = (float) ($totalLateMinutes * ($this->hourly_rate / 60));

        // Night differential: 10% of hourly rate × night hours
        $nightDiffMinutes       = $stats['night_diff_minutes'] ?? 0;
        $this->night_differential = (float) (($nightDiffMinutes / 60) * ($this->hourly_rate * 0.10));

        // Overtime (1.5×)
        $this->overtime_pay = (float) ($this->overtime_hours * ($this->hourly_rate * 1.5));

        // Semi-monthly periods (1–15 / 16–end): half monthly base + half contributions
        $periodBase = (float) $this->base_salary * $factor;

        // Mandatory deductions (Philippine standard)
        $this->sss_contribution        = (float) $this->calculateSSS() * $factor;
        $this->philhealth_contribution = (float) $this->calculatePhilHealth() * $factor;
        // Pag-IBIG: 2% of salary capped at ₱100 employee share (HDMF Circular 274)
        $this->pagibig_contribution    = (float) (min((float) $this->base_salary * 0.02, 100.0) * $factor);

        // Gross pay: base + earnings − attendance deductions (before tax)
        $this->gross_pay = (float) max(0,
            $periodBase
            + $this->overtime_pay
            + $this->night_differential
            + (float) ($this->regular_holiday_pay ?? 0)
            + (float) ($this->special_holiday_pay ?? 0)
            + (float) ($this->bonus ?? 0)
            + (float) ($this->allowances ?? 0)
            - $this->absent_deductions
            - $this->late_deductions
        );

        // Withholding tax (BIR 2023+, RR 11-2018 Annex E)
        $this->tax_deduction = $factor >= 1.0
            ? (float) $this->calculateWithholdingTax()
            : (float) ($factor * $this->calculateWithholdingTax(
                $this->gross_pay / $factor,
                $this->sss_contribution / $factor,
                $this->philhealth_contribution / $factor,
                $this->pagibig_contribution / $factor
            ));

        $totalDeductions = $this->sss_contribution + $this->philhealth_contribution
            + $this->pagibig_contribution + $this->tax_deduction
            + $this->late_deductions + $this->absent_deductions
            + (float) ($this->deductions ?? 0)
            + (float) ($this->salary_loan ?? 0)
            + (float) ($this->cash_advance ?? 0);

        $this->net_pay = (float) max(0, $this->gross_pay - $totalDeductions);
    }

    /**
     * Calculate BIR monthly withholding tax on compensation (2023 onwards, RR 11-2018 Annex E).
     * Taxable income = gross_pay - SSS - PhilHealth - Pag-IBIG (non-taxable statutory contributions).
     */
    private function calculateWithholdingTax(
        ?float $grossPay = null,
        ?float $sss = null,
        ?float $philhealth = null,
        ?float $pagibig = null
    ): float {
        $taxableIncome = ($grossPay ?? (float) $this->gross_pay)
            - ($sss ?? (float) $this->sss_contribution)
            - ($philhealth ?? (float) $this->philhealth_contribution)
            - ($pagibig ?? (float) $this->pagibig_contribution);

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
        return $query->whereDate('pay_period_start', $startDate)
                     ->whereDate('pay_period_end', $endDate);
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
