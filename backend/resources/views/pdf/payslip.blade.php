<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Payslip {{ $payslip['payroll_id'] ?? '' }}</title>
    <style>
        @page { margin: 34px 38px; }
        body { color: #1f2937; font-family: "DejaVu Sans", sans-serif; font-size: 10px; }
        h1 { color: #b02a67; font-size: 20px; margin: 0; }
        h2 { color: #b02a67; font-size: 13px; margin: 20px 0 8px; }
        p { margin: 4px 0; }
        .muted { color: #64748b; }
        .heading { border-bottom: 2px solid #f5c6da; padding-bottom: 12px; }
        .meta, .summary, .lines { border-collapse: collapse; width: 100%; }
        .meta { margin-top: 14px; }
        .meta td { padding: 4px 8px 4px 0; width: 50%; }
        .summary { background: #fdf2f7; border: 1px solid #f5c6da; margin-top: 14px; }
        .summary td { padding: 10px; text-align: center; }
        .summary strong { color: #b02a67; font-size: 17px; }
        .lines th { background: #b02a67; color: #fff; text-align: left; }
        .lines th, .lines td { border: 1px solid #e2e8f0; padding: 6px 8px; }
        .lines .amount { text-align: right; white-space: nowrap; }
        .lines .total { background: #fdf2f7; font-weight: bold; }
        .attendance td { padding: 3px 10px 3px 0; }
        .confidential { border-top: 1px solid #e2e8f0; color: #64748b; font-size: 8px; margin-top: 22px; padding-top: 8px; }
    </style>
</head>
<body>
    @php
        $employee = $payslip['employee'] ?? [];
        $earnings = $payslip['earnings'] ?? [];
        $deductions = $payslip['deductions'] ?? [];
        $attendance = $payslip['attendance'] ?? [];
        $money = fn ($amount) => '₱' . number_format((float) ($amount ?? 0), 2);
        $earningRows = [
            ['Base salary', $earnings['base_salary'] ?? 0],
            ['Overtime pay', $earnings['overtime_pay'] ?? 0],
            ['Rest day pay', $earnings['rest_day_pay'] ?? 0],
            ['Rest day overtime', $earnings['rest_day_ot_pay'] ?? 0],
            ['Regular holiday pay', $earnings['regular_holiday_pay'] ?? 0],
            ['Special holiday pay', $earnings['special_holiday_pay'] ?? 0],
            ['Regular holiday overtime', $earnings['regular_holiday_ot_pay'] ?? 0],
            ['Special holiday overtime', $earnings['special_holiday_ot_pay'] ?? 0],
            ['Night differential', $earnings['night_differential'] ?? 0],
            ['Allowances', $earnings['allowances'] ?? 0],
            ['Non-taxable allowances', $earnings['non_taxable_allowances'] ?? 0],
            ['Commission', $earnings['commission'] ?? 0],
            ['Other earnings', $earnings['other_earnings'] ?? 0],
        ];
        $deductionRows = [
            ['SSS contribution', $deductions['sss'] ?? 0],
            ['PhilHealth contribution', $deductions['philhealth'] ?? 0],
            ['Pag-IBIG contribution', $deductions['pagibig'] ?? 0],
            ['Withholding tax', $deductions['tax'] ?? 0],
            ['Salary loan', $deductions['salary_loan'] ?? 0],
            ['Cash advance', $deductions['cash_advance'] ?? 0],
            ['Other deductions', $deductions['other_deductions'] ?? 0],
        ];
        $attendanceAdjustments = [
            ['Late deductions (reflected in gross pay)', $deductions['late_deductions'] ?? 0],
            ['Absence deductions (reflected in gross pay)', $deductions['absent_deductions'] ?? 0],
            ['Undertime deductions (reflected in gross pay)', $deductions['undertime_deductions'] ?? 0],
        ];
        $employerShares = [
            ['Employer SSS share', $payslip['employer_shares']['sss_er'] ?? 0],
            ['Employer PhilHealth share', $payslip['employer_shares']['philhealth_er'] ?? 0],
            ['Employer Pag-IBIG share', $payslip['employer_shares']['pagibig_er'] ?? 0],
        ];
    @endphp

    <div class="heading">
        <h1>{{ $payslip['company_name'] ?? 'Pawesome Retreat Inc.' }}</h1>
        <p class="muted">Confidential employee payroll statement</p>
        <h2>PAYSLIP</h2>
        <p><strong>Pay period:</strong> {{ $payslip['pay_period'] ?? 'Not specified' }}</p>
        <p><strong>Payroll reference:</strong> {{ $payslip['payroll_id'] ?? 'N/A' }}</p>
    </div>

    <table class="meta">
        <tr>
            <td><strong>Employee:</strong> {{ $employee['name'] ?? 'N/A' }}</td>
            <td><strong>Employee ID:</strong> {{ $employee['id'] ?? 'N/A' }}</td>
        </tr>
        <tr>
            <td><strong>Department:</strong> {{ $employee['department'] ?? 'N/A' }}</td>
            <td><strong>Position:</strong> {{ $employee['position'] ?? 'N/A' }}</td>
        </tr>
        <tr>
            <td><strong>Employment type:</strong> {{ $employee['employment_type'] ?? 'N/A' }}</td>
            <td><strong>Rate type:</strong> {{ $employee['rate_type'] ?? 'N/A' }}</td>
        </tr>
        <tr>
            <td><strong>Payment date:</strong> {{ $payslip['payment_date'] ?? 'N/A' }}</td>
            <td><strong>Payment method:</strong> {{ $payslip['payment_method'] ?? 'N/A' }}</td>
        </tr>
        <tr>
            <td><strong>Payment reference:</strong> {{ $payslip['payment_reference'] ?? 'N/A' }}</td>
            <td><strong>Status:</strong> {{ ucfirst($payslip['status'] ?? 'paid') }}</td>
        </tr>
        <tr>
            <td><strong>Monthly base salary:</strong> {{ $money($earnings['monthly_base_salary'] ?? 0) }}</td>
            <td><strong>Period factor:</strong> {{ $payslip['period_factor'] ?? 'N/A' }}</td>
        </tr>
        <tr>
            <td><strong>Generated:</strong> {{ $payslip['payslip_date'] ?? now()->toDateString() }}</td>
            <td></td>
        </tr>
    </table>

    <table class="summary">
        <tr>
            <td>Gross pay<br><strong>{{ $money($earnings['gross_pay'] ?? 0) }}</strong></td>
            <td>Total deductions<br><strong>{{ $money($deductions['total_deductions'] ?? 0) }}</strong></td>
            <td>Net pay<br><strong>{{ $money($payslip['net_pay'] ?? 0) }}</strong></td>
        </tr>
    </table>

    <h2>Earnings</h2>
    <table class="lines">
        <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
        <tbody>
            @foreach ($earningRows as [$label, $amount])
                <tr><td>{{ $label }}</td><td class="amount">{{ $money($amount) }}</td></tr>
            @endforeach
            <tr class="total"><td>Gross pay</td><td class="amount">{{ $money($earnings['gross_pay'] ?? 0) }}</td></tr>
        </tbody>
    </table>

    <h2>Deductions</h2>
    <table class="lines">
        <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
        <tbody>
            @foreach ($deductionRows as [$label, $amount])
                <tr><td>{{ $label }}</td><td class="amount">{{ $money($amount) }}</td></tr>
            @endforeach
            <tr class="total"><td>Total deductions</td><td class="amount">{{ $money($deductions['total_deductions'] ?? 0) }}</td></tr>
        </tbody>
    </table>

    <h2>Attendance adjustments (already reflected in gross pay)</h2>
    <table class="lines">
        <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
        <tbody>
            @foreach ($attendanceAdjustments as [$label, $amount])
                <tr><td>{{ $label }}</td><td class="amount">{{ $money($amount) }}</td></tr>
            @endforeach
        </tbody>
    </table>

    <h2>Employer contributions (not deducted from employee pay)</h2>
    <table class="lines">
        <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
        <tbody>
            @foreach ($employerShares as [$label, $amount])
                <tr><td>{{ $label }}</td><td class="amount">{{ $money($amount) }}</td></tr>
            @endforeach
        </tbody>
    </table>

    <h2>Attendance</h2>
    <table class="attendance">
        <tr>
            <td><strong>Working days:</strong> {{ $attendance['working_days'] ?? 'N/A' }}</td>
            <td><strong>Present:</strong> {{ $attendance['present_days'] ?? 'N/A' }}</td>
            <td><strong>Absent:</strong> {{ $attendance['absent_days'] ?? 'N/A' }}</td>
        </tr>
        <tr>
            <td><strong>Paid leave total:</strong> {{ $attendance['paid_leave_days'] ?? 0 }} days</td>
            <td><strong>Regular hours:</strong> {{ $attendance['regular_hours'] ?? 'N/A' }}</td>
            <td><strong>Overtime hours:</strong> {{ $attendance['overtime_hours'] ?? 'N/A' }}</td>
        </tr>
        <tr>
            <td><strong>Vacation leave:</strong> {{ $attendance['vacation_leave_days'] ?? 0 }} days</td>
            <td><strong>Sick leave:</strong> {{ $attendance['sick_leave_days'] ?? 0 }} days</td>
            <td><strong>Incomplete punch days:</strong> {{ $attendance['incomplete_punch_days'] ?? 0 }}</td>
        </tr>
        <tr>
            <td><strong>Undertime minutes:</strong> {{ $attendance['undertime_minutes'] ?? 0 }}</td>
            <td colspan="2"></td>
        </tr>
    </table>

    <p class="confidential">
        This document contains confidential payroll information intended only for the named employee.
        Keep it secure and contact the Payroll Department if you believe any details are incorrect.
    </p>
</body>
</html>
