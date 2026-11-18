<?php

namespace App\Models;

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
        'rest_day_pay',
        'rest_day_ot_pay',
        'bonus',
        'allowances',
        'non_taxable_allowances',
        'commission',
        'other_earnings',
        'deductions',
        'tax_deduction',
        'sss_contribution',
        'philhealth_contribution',
        'pagibig_contribution',
        'sss_er_share',
        'philhealth_er_share',
        'pagibig_er_share',
        'late_deductions',
        'absent_deductions',
        'undertime_deductions',
        'undertime_minutes',
        'incomplete_punch_days',
        'paid_leave_days',
        'vacation_leave_days',
        'sick_leave_days',
        'salary_loan',
        'cash_advance',
        'loans_settled',
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
        'working_days' => 'float',
        'present_days' => 'float',
        'absent_days' => 'float',
        'paid_leave_days' => 'float',
        'vacation_leave_days' => 'float',
        'sick_leave_days' => 'float',
        'regular_hours' => 'decimal:2',
        'overtime_hours' => 'decimal:2',
        'overtime_pay' => 'decimal:2',
        'regular_holiday_pay' => 'decimal:2',
        'special_holiday_pay' => 'decimal:2',
        'night_differential' => 'decimal:2',
        'regular_holiday_ot_pay' => 'decimal:2',
        'special_holiday_ot_pay' => 'decimal:2',
        'rest_day_pay' => 'decimal:2',
        'rest_day_ot_pay' => 'decimal:2',
        'bonus' => 'decimal:2',
        'allowances' => 'decimal:2',
        'non_taxable_allowances' => 'decimal:2',
        'deductions' => 'decimal:2',
        'tax_deduction' => 'decimal:2',
        'sss_contribution' => 'decimal:2',
        'philhealth_contribution' => 'decimal:2',
        'pagibig_contribution' => 'decimal:2',
        'sss_er_share' => 'decimal:2',
        'philhealth_er_share' => 'decimal:2',
        'pagibig_er_share' => 'decimal:2',
        'late_deductions' => 'decimal:2',
        'absent_deductions' => 'decimal:2',
        'undertime_deductions' => 'decimal:2',
        'undertime_minutes' => 'integer',
        'incomplete_punch_days' => 'integer',
        'loans_settled' => 'boolean',
        'gross_pay' => 'decimal:2',
        'net_pay' => 'decimal:2',
        'payment_date' => 'date',
        'pay_period_start' => 'date',
        'pay_period_end' => 'date',
        'processed_at' => 'datetime',
        'approved_at' => 'datetime',
        'manual_attendance' => 'array',
    ];

    protected $appends = [
        'total_deductions',
        'is_unlinked',
    ];

    /**
     * Sum of the actual employee deduction components — statutory, tax,
     * manual and loan lines. Attendance adjustments are already reflected
     * inside gross_pay, never here. NOT derived from gross−net: when
     * deductions exceed gross, net floors at 0 and gross−net would
     * overstate the deduction total.
     */
    public function getTotalDeductionsAttribute(): float
    {
        return round(
            (float) $this->sss_contribution
            + (float) $this->philhealth_contribution
            + (float) $this->pagibig_contribution
            + (float) $this->tax_deduction
            + (float) $this->deductions
            + (float) $this->salary_loan
            + (float) $this->cash_advance,
            2
        );
    }

    /**
     * Free-text manual payroll — no linked user account or employee record,
     * so entered totals cannot be recomputed server-side. These rows carry
     * the maker-checker approval gate (creator cannot approve).
     */
    public function getIsUnlinkedAttribute(): bool
    {
        return $this->user_id === null && $this->employee_id === null;
    }

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
                // Max existing sequence INCLUDING soft-deleted rows — the
                // unique index still holds trashed payroll_ids, so counting
                // live rows would reuse them and the insert would 500.
                $year = date('Y');
                $seq = (int) (static::withTrashed()
                    ->where('payroll_id', 'like', "PAY-{$year}-%")
                    ->selectRaw("MAX(CAST(SUBSTRING(payroll_id, -4) AS UNSIGNED)) AS seq")
                    ->value('seq') ?? 0);
                $payroll->payroll_id = 'PAY-' . $year . '-' . str_pad($seq + 1, 4, '0', STR_PAD_LEFT);
            }
        });
    }

    /**
     * Recompute this payroll row through PayrollComputationService — the single
     * source of truth for all payroll math.
     *
     * @param  bool  $respectAttendance  When true (generate/update paths), the
     *      service counts auto-absences for every past workday with no punch.
     *      When false (unit/formula tests, pre-attendance previews), an empty
     *      attendance set keeps the legacy "no period context" behaviour so a
     *      bare payroll row isn't auto-zeroed.
     */
    public function calculatePayroll(bool $respectAttendance = false): void
    {
        $person = $this->user ?? $this->employee;

        if (!$person) {
            return;
        }

        if (($this->rate_type ?? 'monthly') !== 'monthly') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'rate_type' => ['Daily/hourly payroll cannot be calculated until an approved rate policy is configured.'],
            ]);
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

        // Manager-entered manual attendance rows override kiosk punches for
        // the same dates (ManualPayrollModal saves time_in/time_out keys).
        if (!empty($this->manual_attendance)) {
            $manualRecords = collect($this->manual_attendance)
                ->filter(fn ($row) => !empty($row['date']))
                ->map(function ($row) {
                    $timeIn  = $row['check_in'] ?? $row['time_in'] ?? null;
                    $timeOut = $row['check_out'] ?? $row['time_out'] ?? null;

                    return new Attendance([
                        'date'           => $row['date'],
                        'check_in'       => $timeIn,
                        'check_out'      => $timeOut,
                        'status'         => $row['status'] ?? ($timeIn ? 'present' : 'absent'),
                        'total_hours'    => (float) ($row['total_hours'] ?? $row['regular_hours'] ?? 0)
                            + (float) ($row['overtime_hours'] ?? 0),
                        'overtime_hours' => (float) ($row['overtime_hours'] ?? 0),
                    ]);
                });

            $realByDate   = $attendanceRecords->keyBy(fn ($a) => \Carbon\Carbon::parse($a->date)->toDateString());
            $manualByDate = $manualRecords->keyBy(fn ($a) => \Carbon\Carbon::parse($a->date)->toDateString());
            // merge() keeps later entries on duplicate keys — manual wins
            $attendanceRecords = $realByDate->merge($manualByDate)->values();
        }

        // Real period dates always reach the service so the semi-monthly
        // factor stays correct; the flag only controls whether empty
        // attendance triggers auto-absence counting (true for generated/
        // edited payrolls, false for bare unit-test rows).
        $computed = $service->computeFromAttendance(
            $person,
            $attendanceRecords,
            $startDate,
            $endDate,
            [
                'base_salary'            => $this->base_salary !== null ? (float) $this->base_salary : null,
                'hourly_rate'            => $this->hourly_rate !== null ? (float) $this->hourly_rate : null,
                'bonus'                  => (float) ($this->bonus ?? 0),
                'allowances'             => (float) ($this->allowances ?? 0),
                'non_taxable_allowances' => (float) ($this->non_taxable_allowances ?? 0),
                'commission'             => (float) ($this->commission ?? 0),
                'other_earnings'         => (float) ($this->other_earnings ?? 0),
                'deductions'             => (float) ($this->deductions ?? 0),
                'salary_loan'            => (float) ($this->salary_loan ?? 0),
                'cash_advance'           => (float) ($this->cash_advance ?? 0),
            ],
            $respectAttendance || $attendanceRecords->isNotEmpty()
        );

        $this->base_salary              = $computed['base_salary'];
        $this->hourly_rate              = $computed['hourly_rate'];
        if ($computed['working_days'] !== null) {
            $this->working_days = $computed['working_days'];
        }
        $this->present_days             = $computed['present_days'];
        $this->absent_days              = $computed['absent_days'];
        $this->paid_leave_days          = $computed['paid_leave_days'];
        $this->vacation_leave_days      = $computed['vacation_leave_days'];
        $this->sick_leave_days          = $computed['sick_leave_days'];
        $this->regular_hours            = $computed['regular_hours'];
        $this->overtime_hours           = $computed['overtime_hours'];
        $this->overtime_pay             = $computed['overtime_pay'];
        $this->rest_day_pay             = $computed['rest_day_pay'];
        $this->regular_holiday_pay      = $computed['regular_holiday_pay'];
        $this->special_holiday_pay      = $computed['special_holiday_pay'];
        $this->night_differential       = $computed['night_differential'];
        $this->rest_day_ot_pay          = $computed['rest_day_ot_pay'];
        $this->regular_holiday_ot_pay   = $computed['regular_holiday_ot_pay'];
        $this->special_holiday_ot_pay   = $computed['special_holiday_ot_pay'];
        $this->late_deductions          = $computed['late_deductions'];
        $this->absent_deductions        = $computed['absent_deductions'];
        $this->undertime_deductions     = $computed['undertime_deductions'];
        $this->undertime_minutes        = $computed['total_undertime_minutes'];
        $this->incomplete_punch_days    = $computed['incomplete_punch_days'];
        $this->sss_contribution         = $computed['sss_contribution'];
        $this->philhealth_contribution  = $computed['philhealth_contribution'];
        $this->pagibig_contribution     = $computed['pagibig_contribution'];
        $this->sss_er_share             = $computed['sss_er_share'];
        $this->philhealth_er_share      = $computed['philhealth_er_share'];
        $this->pagibig_er_share         = $computed['pagibig_er_share'];
        $this->tax_deduction            = $computed['tax_deduction'];
        $this->salary_loan              = $computed['salary_loan'];
        $this->cash_advance             = $computed['cash_advance'];
        $this->gross_pay                = $computed['gross_pay'];
        $this->net_pay                  = $computed['net_pay'];
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

    public function scopeForEmployee($query, $employeeId)
    {
        return $query->where('employee_id', $employeeId);
    }

    public function scopeByStatus($query, $status)
    {
        return $query->where('status', $status);
    }
}
