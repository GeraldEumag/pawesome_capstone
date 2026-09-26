<?php

namespace App\Services\Payroll;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Attendance-driven payroll computation shared by preview (compute),
 * generation (generate), and report views. Works for both account
 * users and non-account employee records.
 */
class PayrollComputationService
{
    private const DEFAULT_SHIFT_START = '08:00';

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
        $end = Carbon::parse($endDate);

        if ($start->format('Y-m') !== $end->format('Y-m')) {
            return false;
        }

        return ($start->day === 1 && $end->day === 15)
            || ($start->day === 16 && $end->isLastOfMonth());
    }

    /**
     * Payroll periods are semi-monthly: 1st–15th or 16th–end of month.
     * Returns 0.5 for a same-month partial period and 1.0 otherwise so base
     * salary and statutory contributions reconcile to the monthly amount
     * across both cutoffs.
     */
    public function periodFactor(?string $startDate, ?string $endDate): float
    {
        if (!$startDate || !$endDate) {
            return 1.0;
        }

        $start = Carbon::parse($startDate);
        $end = Carbon::parse($endDate);

        if (
            $start->format('Y-m') === $end->format('Y-m')
            && $start->diffInDays($end) < 20
        ) {
            return 0.5;
        }

        return 1.0;
    }

    /**
     * Attendance + leave + schedule rollup for one person over a period.
     *
     * Rules:
     *  - Approved leave days inside the period are "paid leave": they are
     *    never counted as absent and never deducted (absent→leave conversion).
     *  - Scheduled workdays (work_schedules, non-off-day) with no punch and
     *    no approved leave are counted as absent automatically — past dates
     *    only, so future days are never pre-penalised.
     *  - People without schedule rows keep the safe fallback: only recorded
     *    absences deduct.
     *  - Late is evaluated against the day's scheduled shift_start (default
     *    08:00); early leave against shift_end when one is set.
     *
     * @param  \Illuminate\Support\Collection<int, Attendance>  $attendanceRecords
     * @return array<string, mixed>
     */
    public function attendanceStats(
        User|Employee $employee,
        $attendanceRecords,
        ?string $startDate = null,
        ?string $endDate = null
    ): array {
        $isEmployee = $employee instanceof Employee;

        $byDate = $attendanceRecords->keyBy(
            fn ($a) => Carbon::parse($a->date)->toDateString()
        );

        $presentDays = 0;
        $lateDays = 0;
        $earlyLeaveDays = 0;
        $absentDays = 0;
        $paidLeaveDays = 0;

        $regularHours = (float) $attendanceRecords->sum('total_hours');
        $overtimeHours = (float) $attendanceRecords->sum('overtime_hours');

        // Per-record counts. An on_leave record counts as paid leave.
        $leaveDates = [];

        foreach ($attendanceRecords as $record) {
            $status = $record->status;
            $dateKey = Carbon::parse($record->date)->toDateString();

            if (in_array($status, ['present', 'late', 'early_leave'], true)) {
                $presentDays++;
            }

            if ($status === 'absent') {
                $absentDays++;
            }

            if ($status === 'on_leave') {
                $paidLeaveDays++;
                $leaveDates[$dateKey] = true;
            }
        }

        $workingDays = null;

        if ($startDate && $endDate) {
            $start = Carbon::parse($startDate);
            $end = Carbon::parse($endDate);
            $today = Carbon::today();

            $schedules = $employee instanceof User
                ? DB::table('work_schedules')
                    ->where('user_id', $employee->id)
                    ->get()
                    ->keyBy('day_of_week')
                : collect();
            $hasSchedules = $schedules->isNotEmpty();

            // Approved leave dates overlapping the period.
            $approvedLeaveDates = [];
            if ($employee instanceof User) {
                DB::table('leave_requests')
                    ->where('user_id', $employee->id)
                    ->where('status', 'approved')
                    ->whereDate('start_date', '<=', $endDate)
                    ->whereDate('end_date', '>=', $startDate)
                    ->get(['start_date', 'end_date'])
                    ->each(function ($leave) use (&$approvedLeaveDates, $start, $end) {
                        $from = Carbon::parse($leave->start_date)->max($start);
                        $to = Carbon::parse($leave->end_date)->min($end);
                        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
                            $approvedLeaveDates[$d->toDateString()] = true;
                        }
                    });
            }

            // Count workdays + punch-level late/early-leave + auto-absence.
            $workingDays = 0;
            for ($day = $start->copy(); $day->lte($end); $day->addDay()) {
                $dateKey = $day->toDateString();
                $schedule = $hasSchedules ? $schedules->get($day->dayOfWeek) : null;
                $isWorkday = $hasSchedules
                    ? ($schedule && !$schedule->is_off_day)
                    : !$day->isWeekend();

                if (!$isWorkday) {
                    continue;
                }

                $workingDays++;
                $record = $byDate->get($dateKey);

                if ($record) {
                    $shiftStart = $schedule && $schedule->shift_start
                        ? substr((string) $schedule->shift_start, 0, 5)
                        : self::DEFAULT_SHIFT_START;
                    $shiftEnd = $schedule && $schedule->shift_end
                        ? substr((string) $schedule->shift_end, 0, 5)
                        : null;

                    $checkIn = $record->check_in
                        ? substr((string) $record->check_in, 0, 5)
                        : null;
                    $checkOut = $record->check_out
                        ? substr((string) $record->check_out, 0, 5)
                        : null;

                    if ($checkIn && $checkIn > $shiftStart) {
                        $lateDays++;
                    }
                    if ($checkOut && $shiftEnd && $checkOut < $shiftEnd) {
                        $earlyLeaveDays++;
                    }

                    continue;
                }

                if (isset($approvedLeaveDates[$dateKey]) && !isset($leaveDates[$dateKey])) {
                    $paidLeaveDays++;
                    $leaveDates[$dateKey] = true;
                    continue;
                }

                // Auto-absence: scheduled workday already past with no punch.
                if ($hasSchedules && $day->lt($today)) {
                    $absentDays++;
                }
            }
        } else {
            // No period context: fall back to stored flags.
            foreach ($attendanceRecords as $record) {
                if ($record->is_late || $record->status === 'late') {
                    $lateDays++;
                }
                if ($record->is_early_leave || $record->status === 'early_leave') {
                    $earlyLeaveDays++;
                }
            }
        }

        return [
            'is_employee' => $isEmployee,
            'working_days' => $workingDays,
            'present_days' => $presentDays,
            'late_days' => $lateDays,
            'early_leave_days' => $earlyLeaveDays,
            'absent_days' => $absentDays,
            'paid_leave_days' => $paidLeaveDays,
            'regular_hours' => $regularHours,
            'overtime_hours' => $overtimeHours,
        ];
    }

    /**
     * Same math against a pre-fetched attendance collection (avoids N+1).
     *
     * @param  \Illuminate\Support\Collection<int, Attendance>  $attendanceRecords
     */
    public function computeFromAttendance(
        User|Employee $employee,
        $attendanceRecords,
        ?string $startDate = null,
        ?string $endDate = null
    ): array {
        $stats = $this->attendanceStats($employee, $attendanceRecords, $startDate, $endDate);
        $factor = $this->periodFactor($startDate, $endDate);

        $baseSalary = (float) ($employee->base_salary ?? 15000);
        $hourlyRate = (float) ($employee->hourly_rate ?? ($baseSalary / 160));
        $dailyRate = $baseSalary / 22;

        $lateDeductions = $stats['late_days'] * ($dailyRate * 0.1);
        $absentDeductions = $stats['absent_days'] * $dailyRate;
        $overtimePay = $stats['overtime_hours'] * ($hourlyRate * 1.5);

        // Semi-monthly periods pay half the monthly base and deduct half the
        // monthly statutory contributions so both cutoffs reconcile.
        $periodBase = $baseSalary * $factor;
        $sss = $this->calculateSss($baseSalary) * $factor;
        $philhealth = $this->calculatePhilHealth($baseSalary) * $factor;
        $pagibig = 100.0 * $factor;

        $grossPay = $periodBase + $overtimePay;

        // Withholding tax uses monthly brackets; for a half-month period we
        // evaluate the monthly-equivalent taxable income and halve the tax.
        if ($factor >= 1.0) {
            $tax = $this->calculateWithholdingTax($grossPay, $sss, $philhealth, $pagibig);
        } else {
            $tax = $factor * $this->calculateWithholdingTax(
                $grossPay / $factor,
                $sss / $factor,
                $philhealth / $factor,
                $pagibig / $factor
            );
        }

        $totalDeductions = $sss + $philhealth + $pagibig + $tax + $lateDeductions + $absentDeductions;
        $netPay = max(0, $grossPay - $totalDeductions);

        return [
            'user_id' => $stats['is_employee'] ? null : $employee->id,
            'employee_id' => $stats['is_employee'] ? $employee->id : null,
            'person_type' => $stats['is_employee'] ? 'employee' : 'account',
            'employee_no' => $employee->employee_no,
            'employee_name' => $employee->name,
            'role' => $stats['is_employee'] ? ($employee->position ?? 'employee') : $employee->role,
            'department' => $employee->department ?? 'Unassigned',
            'position' => $employee->position ?? ($stats['is_employee'] ? 'Staff' : ($employee->role ?? 'Staff')),
            'base_salary' => round($baseSalary, 2),
            'period_base_salary' => round($periodBase, 2),
            'period_factor' => $factor,
            'hourly_rate' => round($hourlyRate, 2),
            'working_days' => $stats['working_days'],
            'present_days' => $stats['present_days'],
            'late_days' => $stats['late_days'],
            'early_leave_days' => $stats['early_leave_days'],
            'absent_days' => $stats['absent_days'],
            'paid_leave_days' => $stats['paid_leave_days'],
            'regular_hours' => round($stats['regular_hours'], 2),
            'overtime_hours' => round($stats['overtime_hours'], 2),
            'overtime_pay' => round($overtimePay, 2),
            'late_deductions' => round($lateDeductions, 2),
            'absent_deductions' => round($absentDeductions, 2),
            'sss_contribution' => round($sss, 2),
            'philhealth_contribution' => round($philhealth, 2),
            'pagibig_contribution' => round($pagibig, 2),
            'tax_deduction' => round($tax, 2),
            'gross_pay' => round($grossPay, 2),
            'total_deductions' => round($totalDeductions, 2),
            'net_pay' => round($netPay, 2),
        ];
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
            ->map(fn (User $employee) => $this->computeFromAttendance(
                $employee,
                $attendanceByUser->get($employee->id, collect()),
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
            ->map(fn (Employee $employee) => $this->computeFromAttendance(
                $employee,
                $attendanceByEmployee->get($employee->id, collect()),
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

    public function staffEmployees()
    {
        return User::whereIn('role', [
            'manager', 'cashier', 'receptionist', 'veterinary',
            'inventory', 'payroll', 'staff', 'groomer',
            'super_receptionist', 'super_admin', 'admin',
        ])->where('is_active', true)->get();
    }

    /** @return \Illuminate\Support\Collection<int, Employee> */
    public function activeEmployees()
    {
        return Employee::where('is_active', true)->get();
    }

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

    /** PhilHealth 2025: 5% premium (P500–P5,000), employee share 50%. */
    public function calculatePhilHealth(float $baseSalary): float
    {
        return max(500, min($baseSalary * 0.05, 5000)) / 2;
    }

    /** BIR monthly withholding tax (2023 onwards, RR 11-2018 Annex E). */
    public function calculateWithholdingTax(float $grossPay, float $sss, float $philhealth, float $pagibig): float
    {
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
