<?php

namespace App\Services\Payroll;

use App\Models\Payroll;
use App\Services\ServiceDurationService;
use App\Support\CompanySchedule;
use Carbon\Carbon;

class PayrollPayslipDataService
{
    public function forPayroll(Payroll $payroll): array
    {
        $periodFactor = app(PayrollComputationService::class)
            ->periodFactor($payroll->pay_period_start?->toDateString(), $payroll->pay_period_end?->toDateString());

        $periodBase = (float) $payroll->base_salary * $periodFactor;
        $person = $payroll->user ?? $payroll->employee;
        $hireDateRaw = $person?->employment_date ?? $person?->hire_date;

        if ($hireDateRaw && $payroll->pay_period_start && $payroll->pay_period_end) {
            $hire = Carbon::parse($hireDateRaw);
            $start = Carbon::parse($payroll->pay_period_start);
            $end = Carbon::parse($payroll->pay_period_end);

            if ($hire->gt($start) && $hire->lte($end)) {
                $payable = 0;
                for ($date = $start->copy(); $date->lte($end); $date->addDay()) {
                    if (! $date->lt($hire) && CompanySchedule::isWorkday($date, $person)) {
                        $payable++;
                    }
                }
                $periodBase = ((float) $payroll->base_salary / CompanySchedule::dailyRateDivisor()) * $payable;
            }
        }

        return [
            'company_name' => 'Pawesome Retreat Inc.',
            'payslip_date' => ServiceDurationService::storeToday(),
            'payroll_id' => $payroll->payroll_id,
            'pay_period' => $payroll->pay_period_label,
            'period_factor' => $periodFactor,
            'employee' => [
                'name' => $payroll->user?->name ?? $payroll->employee?->name ?? $payroll->employee_name,
                'id' => $payroll->user_id ?? $payroll->employee_id,
                'department' => $payroll->department,
                'position' => $payroll->position,
                'employment_type' => $payroll->employment_type,
                'rate_type' => $payroll->rate_type,
            ],
            'earnings' => [
                'base_salary' => round($periodBase, 2),
                'monthly_base_salary' => $payroll->base_salary,
                'overtime_pay' => $payroll->overtime_pay,
                'rest_day_pay' => $payroll->rest_day_pay ?? 0,
                'rest_day_ot_pay' => $payroll->rest_day_ot_pay ?? 0,
                'regular_holiday_pay' => $payroll->regular_holiday_pay ?? 0,
                'special_holiday_pay' => $payroll->special_holiday_pay ?? 0,
                'regular_holiday_ot_pay' => $payroll->regular_holiday_ot_pay ?? 0,
                'special_holiday_ot_pay' => $payroll->special_holiday_ot_pay ?? 0,
                'night_differential' => $payroll->night_differential ?? 0,
                'bonus' => $payroll->bonus,
                'allowances' => $payroll->allowances,
                'non_taxable_allowances' => $payroll->non_taxable_allowances ?? 0,
                'commission' => $payroll->commission ?? 0,
                'other_earnings' => $payroll->other_earnings ?? 0,
                'gross_pay' => $payroll->gross_pay,
            ],
            'deductions' => [
                'sss' => $payroll->sss_contribution,
                'philhealth' => $payroll->philhealth_contribution,
                'pagibig' => $payroll->pagibig_contribution,
                'tax' => $payroll->tax_deduction,
                'late_deductions' => $payroll->late_deductions,
                'absent_deductions' => $payroll->absent_deductions,
                'undertime_deductions' => $payroll->undertime_deductions ?? 0,
                'salary_loan' => $payroll->salary_loan ?? 0,
                'cash_advance' => $payroll->cash_advance ?? 0,
                'other_deductions' => $payroll->deductions,
                // Attendance adjustments are already removed inside gross_pay.
                'total_deductions' => $payroll->total_deductions,
            ],
            'employer_shares' => [
                'sss_er' => $payroll->sss_er_share ?? 0,
                'philhealth_er' => $payroll->philhealth_er_share ?? 0,
                'pagibig_er' => $payroll->pagibig_er_share ?? 0,
            ],
            'attendance' => [
                'working_days' => $payroll->working_days,
                'present_days' => $payroll->present_days,
                'absent_days' => $payroll->absent_days,
                'paid_leave_days' => $payroll->paid_leave_days ?? 0,
                'vacation_leave_days' => $payroll->vacation_leave_days ?? 0,
                'sick_leave_days' => $payroll->sick_leave_days ?? 0,
                'regular_hours' => $payroll->regular_hours,
                'overtime_hours' => $payroll->overtime_hours,
                'undertime_minutes' => $payroll->undertime_minutes ?? 0,
                'incomplete_punch_days' => $payroll->incomplete_punch_days ?? 0,
            ],
            'net_pay' => $payroll->net_pay,
            'payment_date' => $payroll->payment_date,
            'payment_method' => $payroll->payment_method,
            'payment_reference' => $payroll->payment_reference,
            'status' => $payroll->status,
        ];
    }
}
