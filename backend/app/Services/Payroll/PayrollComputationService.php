<?php

namespace App\Services\Payroll;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use App\Support\CompanySchedule;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Attendance-driven payroll computation shared by preview (compute),
 * generation (generate), and report views. Works for both account
 * users and non-account employee records.
 *
 * Calculation rules (all Philippine-compliant):
 *  - Daily rate = base_salary ÷ 26 (Mon–Sat workweek)
 *  - Hourly rate = stored value (preferred) or base_salary ÷ 208 fallback
 *  - Late deduction = max(0, minutes_late − grace) × (hourly_rate ÷ 60)
 *  - Night differential = 10% of hourly rate × night hours (10PM–6AM)
 *  - Rest day (off-day) = 130% (regular off-day) or 200% (holiday off-day)
 *  - Holiday premium = 200% regular worked / 130% special non-working worked
 *  - Regular holiday NOT worked = 100% pay (DOLE Art. 94)
 *  - Pag-IBIG = min(salary × 2%, ₱100) employee share
 *  - Gross = periodBase + OT + nightDiff + restDay + holiday + bonus + allowances
 *            − absent_deductions − late_deductions
 *  - Tax bracket on gross − SSS − PhilHealth − PagIbig (taxable income)
 *  - Salary loans auto-deducted from active salary_loans records
 */
class PayrollComputationService
{
    /**
     * Compute a payroll row for one employee from their attendance in a period.
     */
    public function computeForUser(User|Employee $employee, string $startDate, string $endDate): array
    {
        $attendanceRecords = $employee instanceof Employee
            ? Attendance::where('employee_id', $employee->id)
            : Attendance::where('user_id', $employee->id);

        $attendanceRecords = $attendanceRecords
            ->whereBetween('date', [$startDate, $endDate])
            ->get();

        return $this->computeFromAttendance($employee, $attendanceRecords, $startDate, $endDate);
    }

    /**
     * Valid payroll periods are exactly the semi-monthly cutoffs:
     * the 1st–15th or the 16th–last day of the same month.
     */
    public static function isSemiMonthlyPeriod(string $startDate, string $endDate): bool
    {
        $start = Carbon::parse($startDate);
        $end   = Carbon::parse($endDate);

        if ($start->format('Y-m') !== $end->format('Y-m')) {
            return false;
        }

        return ($start->day === 1 && $end->day === 15)
            || ($start->day === 16 && $end->isLastOfMonth());
    }

    /**
     * Returns 0.5 for a semi-monthly period and 1.0 otherwise so base salary
     * and statutory contributions reconcile to the monthly amount across both
     * cutoffs.
     */
    public function periodFactor(?string $startDate, ?string $endDate): float
    {
        if (!$startDate || !$endDate) {
            return 1.0;
        }

        $start = Carbon::parse($startDate);
        $end   = Carbon::parse($endDate);

        if (
            $start->format('Y-m') === $end->format('Y-m')
            && $start->diffInDays($end) < 20
        ) {
            return 0.5;
        }

        return 1.0;
    }

    /**
     * Attendance + leave + holiday rollup for one person over a period.
     *
     * Returns:
     *  - working_days, present_days, late_days, absent_days, paid_leave_days
     *  - total_late_minutes  — used for per-minute late deduction
     *  - regular_hours, overtime_hours
     *  - night_diff_minutes  — total night-window minutes across the period
     *  - rest_day_days       — number of off-day punches (for rest day premium)
     *  - regular_holiday_worked_days, regular_holiday_unworked_days
     *  - special_holiday_worked_days
     *
     * @param  \Illuminate\Support\Collection<int, Attendance>  $attendanceRecords
     * @return array<string, mixed>
     */
    public function attendanceStats(
        User|Employee $employee,
        $attendanceRecords,
        ?string $startDate = null,
        ?string $endDate   = null
    ): array {
        $isEmployee = $employee instanceof Employee;

        $byDate = $attendanceRecords->keyBy(
            fn ($a) => Carbon::parse($a->date)->toDateString()
        );

        $presentDays        = 0;
        $lateDays           = 0;
        $earlyLeaveDays     = 0;
        $absentDays         = 0;
        $paidLeaveDays      = 0;
        $totalLateMinutes   = 0;
        $nightDiffMinutes   = 0;
        $restDayDays        = 0;

        $regularHours  = (float) $attendanceRecords->sum('total_hours');
        $overtimeHours = (float) $attendanceRecords->sum('overtime_hours');

        $leaveDates = [];
        $workingDays = null;

        $regularHolidayWorkedDays    = 0;
        $regularHolidayUnworkedDays  = 0;
        $specialHolidayWorkedDays    = 0;

        // Build working day set from CompanySchedule (replaces work_schedules query)
        if ($startDate && $endDate) {
            $start = Carbon::parse($startDate);
            $end   = Carbon::parse($endDate);
            $today = Carbon::today();

            // Approved leave dates overlapping the period
            $approvedLeaveDates = [];
            $leaveQuery = $isEmployee
                ? DB::table('leave_requests')->where('employee_id', $employee->id)
                : DB::table('leave_requests')->where('user_id', $employee->id);

            $leaveQuery
                ->where('status', 'approved')
                ->whereDate('start_date', '<=', $endDate)
                ->whereDate('end_date', '>=', $startDate)
                ->get(['start_date', 'end_date', 'type', 'days_counted'])
                ->each(function ($leave) use (&$approvedLeaveDates, $start, $end) {
                    $from = Carbon::parse($leave->start_date)->max($start);
                    $to   = Carbon::parse($leave->end_date)->min($end);
                    for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
                        $approvedLeaveDates[$d->toDateString()] = $leave->type;
                    }
                });

            // Load holidays for this period
            $holidays = DB::table('holidays')
                ->whereBetween('date', [$startDate, $endDate])
                ->get()
                ->keyBy(fn ($h) => Carbon::parse($h->date)->toDateString());

            $workingDays      = 0;
            $shiftStart       = CompanySchedule::shiftStart();
            $shiftEnd         = CompanySchedule::shiftEnd();
            $graceMinutes     = CompanySchedule::graceMinutes();

            for ($day = $start->copy(); $day->lte($end); $day->addDay()) {
                $dateKey  = $day->toDateString();
                $isWorkday = CompanySchedule::isWorkday($day);
                $holiday   = $holidays->get($dateKey);

                // Count regular holiday unworked days (even off-schedule)
                if ($holiday && $holiday->type === 'regular') {
                    if (!isset($byDate[$dateKey]) || $byDate[$dateKey]->status === 'absent') {
                        $regularHolidayUnworkedDays++;
                    }
                }

                if (!$isWorkday) {
                    // Check if someone worked on their rest day
                    $record = $byDate->get($dateKey);
                    if ($record && $record->check_in) {
                        $restDayDays++;

                        if ($holiday && $holiday->type === 'regular') {
                            $regularHolidayWorkedDays++;
                        } elseif ($holiday && $holiday->type === 'special_non_working') {
                            $specialHolidayWorkedDays++;
                        }

                        // Night diff for rest-day punches too
                        if ($record->check_in && $record->check_out) {
                            $nightDiffMinutes += CompanySchedule::nightDiffMinutes(
                                $dateKey,
                                substr((string) $record->check_in, 0, 5),
                                substr((string) $record->check_out, 0, 5)
                            );
                        }
                    }
                    continue;
                }

                $workingDays++;
                $record = $byDate->get($dateKey);

                if ($record) {
                    $status = $record->status ?? 'present';

                    if (in_array($status, ['present', 'late', 'early_leave'], true)) {
                        $presentDays++;
                    } elseif ($status === 'absent') {
                        $absentDays++;
                    } elseif ($status === 'on_leave') {
                        $paidLeaveDays++;
                        $leaveDates[$dateKey] = true;
                    }

                    // Check late using CompanySchedule grace
                    $checkIn = $record->check_in
                        ? substr((string) $record->check_in, 0, 5)
                        : null;
                    $checkOut = $record->check_out
                        ? substr((string) $record->check_out, 0, 5)
                        : null;

                    if ($checkIn) {
                        $lateMin = CompanySchedule::lateMinutes($checkIn);
                        if ($lateMin > 0) {
                            $lateDays++;
                            $totalLateMinutes += $lateMin;
                        }

                        // Early leave check
                        if ($checkOut && $checkOut < $shiftEnd) {
                            $earlyLeaveDays++;
                        }

                        // Night differential
                        if ($checkOut) {
                            $nightDiffMinutes += CompanySchedule::nightDiffMinutes(
                                $dateKey, $checkIn, $checkOut
                            );
                        }
                    }

                    // Holiday premium on workdays
                    if ($record->check_in && $holiday) {
                        if ($holiday->type === 'regular') {
                            $regularHolidayWorkedDays++;
                            // Undo the unworked count we added above
                            $regularHolidayUnworkedDays = max(0, $regularHolidayUnworkedDays - 1);
                        } elseif ($holiday->type === 'special_non_working') {
                            $specialHolidayWorkedDays++;
                        }
                    }

                    continue;
                }

                // No attendance record — check approved leave
                if (isset($approvedLeaveDates[$dateKey]) && !isset($leaveDates[$dateKey])) {
                    $leaveType = $approvedLeaveDates[$dateKey];
                    if ($leaveType === 'unpaid_leave') {
                        $absentDays++;
                    } else {
                        $paidLeaveDays++;
                    }
                    $leaveDates[$dateKey] = true;
                    continue;
                }

                // Auto-absence: past workday with no punch and no approved leave
                if ($day->lt($today)) {
                    $absentDays++;
                }
            }
        } else {
            // No period context — read stored flags only
            foreach ($attendanceRecords as $record) {
                $status = $record->status ?? 'present';
                if (in_array($status, ['present', 'late', 'early_leave'], true)) {
                    $presentDays++;
                }
                if ($status === 'absent') {
                    $absentDays++;
                }
                if ($status === 'on_leave') {
                    $paidLeaveDays++;
                }
                $checkIn = $record->check_in
                    ? substr((string) $record->check_in, 0, 5)
                    : null;
                if ($checkIn) {
                    $lateMin = CompanySchedule::lateMinutes($checkIn);
                    if ($lateMin > 0) {
                        $lateDays++;
                        $totalLateMinutes += $lateMin;
                    }
                }
            }
        }

        return [
            'is_employee'                    => $isEmployee,
            'working_days'                   => $workingDays,
            'present_days'                   => $presentDays,
            'late_days'                      => $lateDays,
            'early_leave_days'               => $earlyLeaveDays,
            'absent_days'                    => $absentDays,
            'paid_leave_days'                => $paidLeaveDays,
            'total_late_minutes'             => $totalLateMinutes,
            'night_diff_minutes'             => $nightDiffMinutes,
            'rest_day_days'                  => $restDayDays,
            'regular_holiday_worked_days'    => $regularHolidayWorkedDays,
            'regular_holiday_unworked_days'  => $regularHolidayUnworkedDays,
            'special_holiday_worked_days'    => $specialHolidayWorkedDays,
            'regular_hours'                  => $regularHours,
            'overtime_hours'                 => $overtimeHours,
        ];
    }

    /**
     * Full payroll computation from an attendance collection.
     *
     * @param  \Illuminate\Support\Collection<int, Attendance>  $attendanceRecords
     */
    public function computeFromAttendance(
        User|Employee $employee,
        $attendanceRecords,
        ?string $startDate = null,
        ?string $endDate   = null
    ): array {
        $stats  = $this->attendanceStats($employee, $attendanceRecords, $startDate, $endDate);
        $factor = $this->periodFactor($startDate, $endDate);

        $baseSalary = (float) ($employee->base_salary ?? 15000);
        // Stored hourly_rate is authoritative; fallback = base_salary ÷ 208
        $hourlyRate = $employee->hourly_rate
            ? (float) $employee->hourly_rate
            : round($baseSalary / 208, 4);

        $divisor   = CompanySchedule::dailyRateDivisor(); // 26
        $dailyRate = $baseSalary / $divisor;

        // --- Earnings ---
        $overtimePay = $stats['overtime_hours'] * ($hourlyRate * 1.5);

        // Night differential: 10% of hourly rate × night hours
        $nightDiff = ($stats['night_diff_minutes'] / 60) * ($hourlyRate * 0.10);

        // Rest day premium: 30% of daily rate per day (total 130%)
        $restDayPay = $stats['rest_day_days'] * ($dailyRate * 0.30);

        // Regular holiday worked: +100% of daily rate (total 200%)
        $regularHolidayPay = $stats['regular_holiday_worked_days'] * $dailyRate;
        // Regular holiday NOT worked: full daily rate (DOLE Art. 94 mandatory)
        $regularHolidayUnworkedPay = $stats['regular_holiday_unworked_days'] * $dailyRate;
        // Special non-working worked: +30% of daily rate (total 130%)
        $specialHolidayPay = $stats['special_holiday_worked_days'] * ($dailyRate * 0.30);

        // --- Deductions ---
        // Late: per-minute deduction using hourly rate (after 15-min grace, tracked in stats)
        $lateDeductions   = $stats['total_late_minutes'] * ($hourlyRate / 60);
        $absentDeductions = $stats['absent_days'] * $dailyRate;

        // --- Semi-monthly period base ---
        $periodBase = $baseSalary * $factor;

        // --- Gross pay (corrected formula) ---
        $grossPay = $periodBase
            + $overtimePay
            + $nightDiff
            + $restDayPay
            + $regularHolidayPay
            + $regularHolidayUnworkedPay
            + $specialHolidayPay
            - $absentDeductions
            - $lateDeductions;

        $grossPay = max(0, $grossPay);

        // --- Statutory contributions (half per semi-monthly cutoff) ---
        $sss       = $this->calculateSss($baseSalary) * $factor;
        $philhealth = $this->calculatePhilHealth($baseSalary) * $factor;
        $pagibig    = $this->calculatePagibig($baseSalary) * $factor;

        // --- Withholding tax (monthly bracket, halved for semi-monthly) ---
        if ($factor >= 1.0) {
            $tax = $this->calculateWithholdingTax($grossPay, $sss, $philhealth, $pagibig);
        } else {
            // Annualise/de-annualise to get correct bracket
            $tax = $factor * $this->calculateWithholdingTax(
                $grossPay / $factor,
                $sss / $factor,
                $philhealth / $factor,
                $pagibig / $factor
            );
        }

        // --- Salary loans & cash advances auto-deduction ---
        [$loanDeduction, $cashAdvanceDeduction] = $this->computeLoanDeductions(
            $employee, $startDate
        );

        $totalDeductions = $sss + $philhealth + $pagibig + $tax
            + $lateDeductions + $absentDeductions
            + $loanDeduction + $cashAdvanceDeduction;

        $netPay = max(0, $grossPay - $totalDeductions);

        return [
            'user_id'                     => $stats['is_employee'] ? null : $employee->id,
            'employee_id'                 => $stats['is_employee'] ? $employee->id : null,
            'person_type'                 => $stats['is_employee'] ? 'employee' : 'account',
            'employee_no'                 => $employee->employee_no ?? null,
            'employee_name'               => $employee->name,
            'role'                        => $stats['is_employee']
                ? ($employee->position ?? 'employee')
                : $employee->role,
            'department'                  => $employee->department ?? 'Unassigned',
            'position'                    => $employee->position
                ?? ($stats['is_employee'] ? 'Staff' : ($employee->role ?? 'Staff')),
            'base_salary'                 => round($baseSalary, 2),
            'period_base_salary'          => round($periodBase, 2),
            'period_factor'               => $factor,
            'hourly_rate'                 => round($hourlyRate, 4),
            'daily_rate'                  => round($dailyRate, 4),
            'daily_rate_divisor'          => $divisor,
            'working_days'                => $stats['working_days'],
            'present_days'                => $stats['present_days'],
            'late_days'                   => $stats['late_days'],
            'total_late_minutes'          => $stats['total_late_minutes'],
            'early_leave_days'            => $stats['early_leave_days'],
            'absent_days'                 => $stats['absent_days'],
            'paid_leave_days'             => $stats['paid_leave_days'],
            'regular_hours'               => round($stats['regular_hours'], 2),
            'overtime_hours'              => round($stats['overtime_hours'], 2),
            'overtime_pay'                => round($overtimePay, 2),
            'night_differential'          => round($nightDiff, 2),
            'rest_day_pay'                => round($restDayPay, 2),
            'regular_holiday_pay'         => round($regularHolidayPay + $regularHolidayUnworkedPay, 2),
            'special_holiday_pay'         => round($specialHolidayPay, 2),
            'late_deductions'             => round($lateDeductions, 2),
            'absent_deductions'           => round($absentDeductions, 2),
            'sss_contribution'            => round($sss, 2),
            'philhealth_contribution'     => round($philhealth, 2),
            'pagibig_contribution'        => round($pagibig, 2),
            'tax_deduction'               => round($tax, 2),
            'salary_loan'                 => round($loanDeduction, 2),
            'cash_advance'                => round($cashAdvanceDeduction, 2),
            'gross_pay'                   => round($grossPay, 2),
            'total_deductions'            => round($totalDeductions, 2),
            'net_pay'                     => round($netPay, 2),
        ];
    }

    /**
     * Compute salary loan and cash advance deductions for the current period.
     * Returns [loanDeduction, cashAdvanceDeduction].
     */
    private function computeLoanDeductions(User|Employee $employee, ?string $startDate): array
    {
        if (!$startDate) {
            return [0.0, 0.0];
        }

        $query = DB::table('salary_loans')
            ->where('status', 'active')
            ->where('start_period', '<=', $startDate)
            ->where(function ($q) use ($startDate) {
                $q->whereNull('end_period')->orWhere('end_period', '>=', $startDate);
            });

        if ($employee instanceof User) {
            $query->where('user_id', $employee->id);
        } else {
            $query->where('employee_id', $employee->id);
        }

        $loans = $query->get();

        $loanDeduction        = 0.0;
        $cashAdvanceDeduction = 0.0;

        foreach ($loans as $loan) {
            $installment = min((float) $loan->installment_amount, (float) $loan->balance);
            if ($loan->loan_type === 'cash_advance') {
                $cashAdvanceDeduction += $installment;
            } else {
                $loanDeduction += $installment;
            }
        }

        return [$loanDeduction, $cashAdvanceDeduction];
    }

    /**
     * After a payroll is generated, reduce loan balances and mark paid loans.
     */
    public function settleLoanDeductions(User|Employee $employee, ?string $startDate): void
    {
        if (!$startDate) {
            return;
        }

        $query = DB::table('salary_loans')
            ->where('status', 'active')
            ->where('start_period', '<=', $startDate)
            ->where(function ($q) use ($startDate) {
                $q->whereNull('end_period')->orWhere('end_period', '>=', $startDate);
            });

        if ($employee instanceof User) {
            $query->where('user_id', $employee->id);
        } else {
            $query->where('employee_id', $employee->id);
        }

        foreach ($query->get() as $loan) {
            $installment   = min((float) $loan->installment_amount, (float) $loan->balance);
            $newBalance    = (float) $loan->balance - $installment;
            $newStatus     = $newBalance <= 0 ? 'paid' : 'active';
            DB::table('salary_loans')
                ->where('id', $loan->id)
                ->update([
                    'balance'    => max(0, $newBalance),
                    'status'     => $newStatus,
                    'updated_at' => now(),
                ]);
        }
    }

    /**
     * Accrue 13th month for a given employee/user for a given month.
     * Called after each payroll run. Uses the basic salary paid in that month.
     */
    public function accrue13thMonth(User|Employee $employee, int $year, int $month, float $basicSalary): void
    {
        $monthCol  = Carbon::createFromDate($year, $month, 1)->format('M') . '_basic';
        $monthCol  = strtolower($monthCol); // e.g. jan_basic

        $clause = $employee instanceof User
            ? ['user_id' => $employee->id, 'year' => $year]
            : ['employee_id' => $employee->id, 'year' => $year];

        $record = DB::table('thirteenth_month_accruals')
            ->where($clause)
            ->first();

        if ($record) {
            // Update the month column and recalculate total
            DB::table('thirteenth_month_accruals')
                ->where('id', $record->id)
                ->update([
                    $monthCol     => max((float) ($record->$monthCol ?? 0), $basicSalary),
                    'total_accrued' => DB::raw("
                        ROUND((jan_basic+feb_basic+mar_basic+apr_basic+may_basic+jun_basic+
                               jul_basic+aug_basic+sep_basic+oct_basic+nov_basic+dec_basic) / 12, 2)
                    "),
                    'updated_at'  => now(),
                ]);
        } else {
            $insert = array_merge($clause, [
                $monthCol       => $basicSalary,
                'total_accrued' => round($basicSalary / 12, 2),
                'status'        => 'accruing',
                'created_at'    => now(),
                'updated_at'    => now(),
            ]);
            DB::table('thirteenth_month_accruals')->insert($insert);
        }
    }

    /**
     * Compute payroll for every active staff employee over a period.
     * Attendance is fetched once and grouped to avoid N+1 queries.
     *
     * @return array<int, array>
     */
    public function computeForAllStaff(string $startDate, string $endDate): array
    {
        $employees = $this->staffEmployees();

        $attendanceByUser = Attendance::whereBetween('date', [$startDate, $endDate])
            ->whereNotNull('user_id')
            ->get()
            ->groupBy('user_id');

        return $employees
            ->map(fn (User $emp) => $this->computeFromAttendance(
                $emp,
                $attendanceByUser->get($emp->id, collect()),
                $startDate,
                $endDate
            ))
            ->values()
            ->all();
    }

    /**
     * Compute payroll for every active non-account employee over a period.
     *
     * @return array<int, array>
     */
    public function computeForAllEmployees(string $startDate, string $endDate): array
    {
        $attendanceByEmployee = Attendance::whereBetween('date', [$startDate, $endDate])
            ->whereNotNull('employee_id')
            ->get()
            ->groupBy('employee_id');

        return Employee::where('is_active', true)
            ->get()
            ->map(fn (Employee $emp) => $this->computeFromAttendance(
                $emp,
                $attendanceByEmployee->get($emp->id, collect()),
                $startDate,
                $endDate
            ))
            ->values()
            ->all();
    }

    /**
     * Both account staff and non-account employees in one list.
     *
     * @return array<int, array>
     */
    public function computeForAllPeople(string $startDate, string $endDate): array
    {
        return array_merge(
            $this->computeForAllStaff($startDate, $endDate),
            $this->computeForAllEmployees($startDate, $endDate)
        );
    }

    /** All active staff account users. */
    public function staffEmployees()
    {
        return User::whereIn('role', [
            'manager', 'cashier', 'receptionist', 'veterinary',
            'inventory', 'payroll', 'staff', 'groomer',
            'super_receptionist', 'super_admin', 'admin',
        ])->where('is_active', true)->get();
    }

    /** All active non-account employees. */
    public function activeEmployees()
    {
        return Employee::where('is_active', true)->get();
    }

    // -------------------------------------------------------------------------
    // Philippine statutory contribution calculators
    // -------------------------------------------------------------------------

    /** SSS 2025: employee share 5.0% of Monthly Salary Credit (5,000–35,000). */
    public function calculateSss(float $baseSalary): float
    {
        if ($baseSalary <= 0) {
            return 0.0;
        }
        if ($baseSalary <= 5250) {
            return 250.0;
        }
        if ($baseSalary >= 34750) {
            return 1750.0;
        }

        return round(((int) ceil($baseSalary / 500) * 500) * 0.05, 2);
    }

    /** PhilHealth 2025: 5% premium (₱500–₱5,000), employee share 50%. */
    public function calculatePhilHealth(float $baseSalary): float
    {
        return max(500, min($baseSalary * 0.05, 5000)) / 2;
    }

    /**
     * Pag-IBIG employee share: 2% of compensation, maximum ₱100.
     * (HDMF Circular 274)
     */
    public function calculatePagibig(float $baseSalary): float
    {
        return min($baseSalary * 0.02, 100.0);
    }

    /** BIR monthly withholding tax (2023 onwards, RR 11-2018 Annex E). */
    public function calculateWithholdingTax(
        float $grossPay,
        float $sss,
        float $philhealth,
        float $pagibig
    ): float {
        // Taxable income = gross − pre-tax statutory deductions
        $taxableIncome = $grossPay - $sss - $philhealth - $pagibig;

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
}
