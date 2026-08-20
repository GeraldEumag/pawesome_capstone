<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Payroll;
use App\Models\User;
use App\Models\Attendance;
use App\Models\Notification;
use Carbon\Carbon;

$startDate = '2025-06-01';
$endDate = '2025-06-15';
$periodLabel = Carbon::parse($startDate)->format('M d') . ' - ' . Carbon::parse($endDate)->format('M d, Y');

$employees = User::whereIn('role', ['manager', 'cashier', 'receptionist', 'veterinary', 'inventory', 'payroll', 'staff', 'groomer'])
    ->where('is_active', true)->get();

echo "Generating payroll for {$periodLabel}..." . PHP_EOL;
echo "Active employees: " . $employees->count() . PHP_EOL;

$generated = [];
foreach ($employees as $employee) {
    $attendanceRecords = Attendance::where('user_id', $employee->id)
        ->whereBetween('date', [$startDate, $endDate])->get();

    $presentDays = $attendanceRecords->whereIn('status', ['present'])->count();
    $lateDays = $attendanceRecords->where('status', 'late')->count();
    $absentDays = $attendanceRecords->where('status', 'absent')->count();
    $regularHours = $attendanceRecords->sum('total_hours');
    $overtimeHours = $attendanceRecords->sum('overtime_hours');

    $baseSalary = $employee->base_salary ?? 15000;
    $hourlyRate = $employee->hourly_rate ?? ($baseSalary / 160);
    $dailyRate = $baseSalary / 22;
    $lateDeductions = $lateDays * ($dailyRate * 0.1);
    $absentDeductions = $absentDays * $dailyRate;
    $overtimePay = $overtimeHours * ($hourlyRate * 1.5);

    $payroll = Payroll::updateOrCreate(
        ['user_id' => $employee->id, 'pay_period_start' => $startDate, 'pay_period_end' => $endDate],
        [
            'pay_period_label' => $periodLabel,
            'department' => $employee->department ?? 'Unassigned',
            'position' => $employee->position ?? $employee->role,
            'base_salary' => $baseSalary,
            'hourly_rate' => round($hourlyRate, 2),
            'working_days' => 22,
            'present_days' => $presentDays,
            'absent_days' => $absentDays,
            'regular_hours' => round($regularHours, 2),
            'overtime_hours' => round($overtimeHours, 2),
            'overtime_pay' => round($overtimePay, 2),
            'bonus' => 0,
            'allowances' => 0,
            'deductions' => 0,
            'late_deductions' => round($lateDeductions, 2),
            'absent_deductions' => round($absentDeductions, 2),
            'status' => 'draft',
            'processed_by' => 2, // Manager
            'processed_at' => now(),
        ]
    );

    $payroll->calculatePayroll();
    $payroll->save();
    $generated[] = $payroll;

    echo "  - {$employee->name} ({$employee->role}): gross={$payroll->gross_pay}, sss={$payroll->sss_contribution}, philhealth={$payroll->philhealth_contribution}, pagibig={$payroll->pagibig_contribution}, tax={$payroll->tax_deduction}, net={$payroll->net_pay}" . PHP_EOL;
}

echo PHP_EOL . "Generated " . count($generated) . " payroll records." . PHP_EOL;

// Now approve the cashier's payroll (user 4)
$cashierPayroll = Payroll::where('user_id', 4)->where('pay_period_start', $startDate)->first();
if ($cashierPayroll) {
    $cashierPayroll->update(['status' => 'pending', 'processed_by' => 2, 'processed_at' => now()]);
    echo PHP_EOL . "Approved cashier payroll ID={$cashierPayroll->id}, status=pending" . PHP_EOL;

    // Release payment
    $cashierPayroll->update([
        'status' => 'paid',
        'payment_date' => '2025-06-20',
        'payment_method' => 'GCash',
        'processed_by' => 2,
        'processed_at' => now(),
    ]);
    echo "Released cashier payroll: status=paid, method=GCash, date=2025-06-20" . PHP_EOL;

    echo PHP_EOL . "=== FINAL CASHIER PAYSLIP ===" . PHP_EOL;
    echo "Payroll ID: {$cashierPayroll->payroll_id}" . PHP_EOL;
    echo "Period: {$cashierPayroll->pay_period_label}" . PHP_EOL;
    echo "Base Salary: {$cashierPayroll->base_salary}" . PHP_EOL;
    echo "Gross Pay: {$cashierPayroll->gross_pay}" . PHP_EOL;
    echo "SSS: {$cashierPayroll->sss_contribution}" . PHP_EOL;
    echo "PhilHealth: {$cashierPayroll->philhealth_contribution}" . PHP_EOL;
    echo "Pag-IBIG: {$cashierPayroll->pagibig_contribution}" . PHP_EOL;
    echo "Tax: {$cashierPayroll->tax_deduction}" . PHP_EOL;
    echo "Late Deductions: {$cashierPayroll->late_deductions}" . PHP_EOL;
    echo "Absent Deductions: {$cashierPayroll->absent_deductions}" . PHP_EOL;
    $totalDed = $cashierPayroll->sss_contribution + $cashierPayroll->philhealth_contribution + $cashierPayroll->pagibig_contribution + $cashierPayroll->tax_deduction + $cashierPayroll->late_deductions + $cashierPayroll->absent_deductions + $cashierPayroll->deductions;
    echo "Total Deductions: {$totalDed}" . PHP_EOL;
    echo "Net Pay: {$cashierPayroll->net_pay}" . PHP_EOL;
    echo "Status: {$cashierPayroll->status}" . PHP_EOL;
    echo "Payment Method: {$cashierPayroll->payment_method}" . PHP_EOL;
}

// Generate employee token for browser test
$cashier = User::find(4);
$empToken = $cashier->createToken('e2e-browser');
echo PHP_EOL . "=== EMPLOYEE TOKEN FOR BROWSER ===" . PHP_EOL;
echo "Cashier token: " . $empToken->plainTextToken . PHP_EOL;
