<?php

namespace App\Services\Payroll;

use App\Models\Attendance;
use App\Models\User;

/**
 * Attendance-driven payroll computation shared by preview (compute),
 * generation (generate), and report views.
 */
class PayrollComputationService
{
    /**
     * Compute a payroll row for one employee from their attendance in a period.
     */
    public function computeForUser(User $employee, string $startDate, string $endDate): array
    {
        $attendanceRecords = Attendance::where('user_id', $employee->id)
            ->whereBetween('date', [$startDate, $endDate])
            ->get();

        return $this->computeFromAttendance($employee, $attendanceRecords);
    }

    /**
     * Same math against a pre-fetched attendance collection (avoids N+1).
     *
     * @param  \Illuminate\Support\Collection<int, Attendance>  $attendanceRecords
     */
    public function computeFromAttendance(User $employee, $attendanceRecords): array
    {
        $presentDays = $attendanceRecords->where('status', 'present')->count();
        $lateDays = $attendanceRecords->where('status', 'late')->count();
        $earlyLeaveDays = $attendanceRecords->where('status', 'early_leave')->count();
        $absentDays = $attendanceRecords->where('status', 'absent')->count();
        $regularHours = (float) $attendanceRecords->sum('total_hours');
        $overtimeHours = (float) $attendanceRecords->sum('overtime_hours');

        $baseSalary = (float) ($employee->base_salary ?? 15000);
        $hourlyRate = (float) ($employee->hourly_rate ?? ($baseSalary / 160));
        $dailyRate = $baseSalary / 22;
        $lateDeductions = $lateDays * ($dailyRate * 0.1);
        $absentDeductions = $absentDays * $dailyRate;
        $overtimePay = $overtimeHours * ($hourlyRate * 1.5);

        $sss = $this->calculateSss($baseSalary);
        $philhealth = $this->calculatePhilHealth($baseSalary);
        $pagibig = 100.0;

        $grossPay = $baseSalary + $overtimePay;
        $tax = $this->calculateWithholdingTax($grossPay, $sss, $philhealth, $pagibig);

        $totalDeductions = $sss + $philhealth + $pagibig + $tax + $lateDeductions + $absentDeductions;
        $netPay = max(0, $grossPay - $totalDeductions);

        return [
            'user_id' => $employee->id,
            'employee_name' => $employee->name,
            'role' => $employee->role,
            'department' => $employee->department ?? 'Unassigned',
            'position' => $employee->position ?? $employee->role ?? 'Staff',
            'base_salary' => round($baseSalary, 2),
            'hourly_rate' => round($hourlyRate, 2),
            'present_days' => $presentDays,
            'late_days' => $lateDays,
            'early_leave_days' => $earlyLeaveDays,
            'absent_days' => $absentDays,
            'regular_hours' => round($regularHours, 2),
            'overtime_hours' => round($overtimeHours, 2),
            'overtime_pay' => round($overtimePay, 2),
            'late_deductions' => round($lateDeductions, 2),
            'absent_deductions' => round($absentDeductions, 2),
            'sss_contribution' => round($sss, 2),
            'philhealth_contribution' => round($philhealth, 2),
            'pagibig_contribution' => $pagibig,
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
            ->get()
            ->groupBy('user_id');

        return $employees
            ->map(fn (User $employee) => $this->computeFromAttendance(
                $employee,
                $attendanceByUser->get($employee->id, collect())
            ))
            ->values()
            ->all();
    }

    public function staffEmployees()
    {
        return User::whereIn('role', [
            'manager', 'cashier', 'receptionist', 'veterinary',
            'inventory', 'payroll', 'staff', 'groomer',
            'super_receptionist', 'super_admin', 'admin',
        ])->where('is_active', true)->get();
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
