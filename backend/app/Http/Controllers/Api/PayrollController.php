<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Notification;
use App\Models\Payroll;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class PayrollController extends Controller
{
    /**
     * List all payroll records with optional filters
     */
    public function index(Request $request): JsonResponse
    {
        $query = Payroll::with(['user', 'processor']);

        // Filter by pay period label
        if ($request->has('pay_period')) {
            $query->where('pay_period_label', $request->pay_period);
        }

        // Filter by date range
        if ($request->has('period_start') && $request->has('period_end')) {
            $query->where('pay_period_start', $request->period_start)
                  ->where('pay_period_end', $request->period_end);
        }

        // Filter by user
        if ($request->has('user_id')) {
            $query->forUser($request->user_id);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->byStatus($request->status);
        }

        // Filter by department
        if ($request->has('department')) {
            $query->where('department', $request->department);
        }

        // Search by name or payroll_id
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('payroll_id', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('name', 'like', "%{$search}%");
                  });
            });
        }

        $payrolls = $query->orderBy('pay_period_start', 'desc')->get();

        // Calculate summary statistics
        $summary = [
            'total_employees' => $payrolls->count(),
            'total_gross' => round($payrolls->sum('gross_pay'), 2),
            'total_net' => round($payrolls->sum('net_pay'), 2),
            'total_deductions' => round($payrolls->sum(function ($p) {
                return $p->sss_contribution + $p->philhealth_contribution + 
                       $p->pagibig_contribution + $p->tax_deduction + 
                       $p->deductions + $p->late_deductions + $p->absent_deductions;
            }), 2),
            'total_contributions' => round($payrolls->sum(function ($p) {
                return $p->sss_contribution + $p->philhealth_contribution + $p->pagibig_contribution;
            }), 2),
            'paid_count' => $payrolls->where('status', 'paid')->count(),
            'pending_count' => $payrolls->where('status', 'pending')->count(),
            'draft_count' => $payrolls->where('status', 'draft')->count(),
            'processing_count' => $payrolls->where('status', 'processing')->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => $payrolls,
            'summary' => $summary,
        ]);
    }

    /**
     * Preview payroll computation without saving
     */
    public function compute(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
        ]);

        $startDate = $validated['period_start'];
        $endDate = $validated['period_end'];

        $employees = User::whereIn('role', [
            'manager', 'cashier', 'receptionist', 'veterinary',
            'inventory', 'payroll', 'staff', 'groomer',
        ])->where('is_active', true)->get();

        $results = [];

        foreach ($employees as $employee) {
            $attendanceRecords = Attendance::where('user_id', $employee->id)
                ->whereBetween('date', [$startDate, $endDate])
                ->get();

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

            // PhilHealth
            $philhealth = min($baseSalary * 0.03, 1800) / 2;
            // SSS (simplified table)
            $sss = 1125;
            foreach ([
                [3250, 135], [3750, 157.50], [4250, 180], [4750, 202.50], [5250, 225],
                [5750, 247.50], [6250, 270], [6750, 292.50], [7250, 315], [7750, 337.50],
                [8250, 360], [8750, 382.50], [9250, 405], [9750, 427.50], [10250, 450],
                [10750, 472.50], [11250, 495], [11750, 517.50], [12250, 540], [12750, 562.50],
                [13250, 585], [13750, 607.50], [14250, 630], [14750, 652.50], [15250, 675],
                [15750, 697.50], [16250, 720], [16750, 742.50], [17250, 765], [17750, 787.50],
                [18250, 810], [18750, 832.50], [19250, 855], [19750, 877.50], [20250, 900],
                [20750, 922.50], [21250, 945], [21750, 967.50], [22250, 990], [22750, 1012.50],
                [23250, 1035], [23750, 1057.50], [24250, 1080], [24750, 1102.50],
            ] as [$cap, $val]) {
                if ($baseSalary <= $cap) { $sss = $val; break; }
            }

            $grossPay = $baseSalary + $overtimePay;
            $totalDeductions = $sss + $philhealth + 100 + $lateDeductions + $absentDeductions;
            $netPay = max(0, $grossPay - $totalDeductions);

            $results[] = [
                'user_id' => $employee->id,
                'employee_name' => $employee->name,
                'role' => $employee->role,
                'department' => $employee->department ?? 'Unassigned',
                'base_salary' => round($baseSalary, 2),
                'hourly_rate' => round($hourlyRate, 2),
                'present_days' => $presentDays,
                'late_days' => $lateDays,
                'absent_days' => $absentDays,
                'regular_hours' => round($regularHours, 2),
                'overtime_hours' => round($overtimeHours, 2),
                'overtime_pay' => round($overtimePay, 2),
                'late_deductions' => round($lateDeductions, 2),
                'absent_deductions' => round($absentDeductions, 2),
                'sss_contribution' => round($sss, 2),
                'philhealth_contribution' => round($philhealth, 2),
                'pagibig_contribution' => 100,
                'gross_pay' => round($grossPay, 2),
                'total_deductions' => round($totalDeductions, 2),
                'net_pay' => round($netPay, 2),
            ];
        }

        return response()->json([
            'success' => true,
            'data' => $results,
            'period_start' => $startDate,
            'period_end' => $endDate,
        ]);
    }

    public function generate(Request $request): JsonResponse
    {
        if ($request->has('start_date') && !$request->has('period_start')) {
            $request->merge(['period_start' => $request->input('start_date')]);
        }

        if ($request->has('end_date') && !$request->has('period_end')) {
            $request->merge(['period_end' => $request->input('end_date')]);
        }

        $validated = $request->validate([
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
        ]);

        $startDate = $validated['period_start'];
        $endDate = $validated['period_end'];
        $periodLabel = Carbon::parse($startDate)->format('M d') . ' - ' . Carbon::parse($endDate)->format('M d, Y');

        // Get all employees (staff roles)
        $employees = User::whereIn('role', [
            'manager',
            'cashier',
            'receptionist',
            'veterinary',
            'inventory',
            'payroll',
            'staff',
            'groomer',
        ])->where('is_active', true)->get();

        $generated = [];
        $errors = [];

        foreach ($employees as $employee) {
            try {
                // Get attendance records for the period
                $attendanceRecords = Attendance::where('user_id', $employee->id)
                    ->whereBetween('date', [$startDate, $endDate])
                    ->get();

                // Calculate attendance metrics
                $presentDays = $attendanceRecords->whereIn('status', ['present'])->count();
                $lateDays = $attendanceRecords->where('status', 'late')->count();
                $earlyLeaveDays = $attendanceRecords->where('status', 'early_leave')->count();
                $absentDays = $attendanceRecords->where('status', 'absent')->count();

                $regularHours = $attendanceRecords->sum('total_hours');
                $overtimeHours = $attendanceRecords->sum('overtime_hours');

                // Get employee salary info
                $baseSalary = $employee->base_salary ?? 15000; // Default minimum
                $hourlyRate = $employee->hourly_rate ?? ($baseSalary / 160); // 160 hours per month

                // Calculate deductions
                $dailyRate = $baseSalary / 22; // 22 working days per month
                $lateDeductions = $lateDays * ($dailyRate * 0.1); // 10% per late
                $absentDeductions = $absentDays * $dailyRate;

                // Calculate earnings
                $overtimePay = $overtimeHours * ($hourlyRate * 1.5); // 1.5x for OT

                // Create or update payroll record
                $payroll = Payroll::updateOrCreate(
                    [
                        'user_id' => $employee->id,
                        'pay_period_start' => $startDate,
                        'pay_period_end' => $endDate,
                    ],
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
                        'processed_by' => Auth::id(),
                        'processed_at' => now(),
                    ]
                );

                // Auto-calculate the payroll
                $payroll->calculatePayroll();
                $payroll->save();

                $generated[] = $payroll->load('user');
            } catch (\Exception $e) {
                $errors[] = [
                    'user_id' => $employee->id,
                    'name' => $employee->name,
                    'error' => $e->getMessage(),
                ];
            }
        }

        // Send notifications after generation
        if (count($generated) > 0) {
            Notification::create([
                'role' => 'manager',
                'title' => 'Payroll Generated',
                'message' => 'Payroll has been generated for ' . $periodLabel . ' (' . count($generated) . ' employees).',
                'type' => 'info',
                'related_type' => 'payroll',
            ]);

            Notification::create([
                'role' => 'manager',
                'title' => 'Payroll Ready for Review',
                'message' => 'New payroll records are ready for review and approval.',
                'type' => 'success',
                'related_type' => 'payroll',
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Payroll generated from attendance records.',
            'data' => $generated,
            'errors' => $errors,
            'summary' => [
                'generated_count' => count($generated),
                'error_count' => count($errors),
                'period_start' => $startDate,
                'period_end' => $endDate,
            ],
        ]);
    }

    /**
     * Approve payroll (change status from draft/processing to pending)
     */
    public function approve(Payroll $payroll): JsonResponse
    {
        if ($payroll->status === 'paid') {
            return response()->json([
                'success' => false,
                'message' => 'Cannot approve already paid payroll.',
            ], 422);
        }

        $payroll->update([
            'status' => 'pending',
            'processed_by' => Auth::id(),
            'processed_at' => now(),
        ]);

        $payroll->load('user');

        // Send notifications
        Notification::create([
            'role' => 'manager',
            'title' => 'Payroll Approved',
            'message' => 'Payroll for ' . ($payroll->user->name ?? 'employee') . ' has been approved.',
            'type' => 'success',
            'related_type' => 'payroll',
            'related_id' => $payroll->id,
        ]);

        Notification::create([
            'role' => 'cashier',
            'title' => 'Payroll Payment Required',
            'message' => 'Approved payroll for ' . ($payroll->user->name ?? 'employee') . ' is ready for payment.',
            'type' => 'warning',
            'related_type' => 'payroll',
            'related_id' => $payroll->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payroll approved successfully.',
            'data' => $payroll->load(['user', 'processor']),
        ]);
    }

    /**
     * Mark payroll as paid
     */
    public function markAsPaid(Payroll $payroll): JsonResponse
    {
        if ($payroll->status === 'paid') {
            return response()->json([
                'success' => false,
                'message' => 'Payroll is already marked as paid.',
            ], 422);
        }

        $payroll->update([
            'status' => 'paid',
            'payment_date' => now(),
            'payment_method' => 'Bank Transfer', // Default, can be customized
            'processed_by' => Auth::id(),
            'processed_at' => now(),
        ]);

        $payroll->load('user');

        // Send notifications
        Notification::create([
            'role' => 'manager',
            'title' => 'Payroll Paid',
            'message' => 'Payroll for ' . ($payroll->user->name ?? 'employee') . ' has been marked as paid.',
            'type' => 'success',
            'related_type' => 'payroll',
            'related_id' => $payroll->id,
        ]);

        Notification::create([
            'user_id' => $payroll->user_id,
            'title' => 'Payslip Available',
            'message' => 'Your payroll has been marked as paid. You may now download your payslip.',
            'type' => 'info',
            'related_type' => 'payroll',
            'related_id' => $payroll->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payroll marked as paid.',
            'data' => $payroll->load(['user', 'processor']),
        ]);
    }

    /**
     * Get single payroll details
     */
    public function show(Payroll $payroll): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $payroll->load(['user', 'processor']),
        ]);
    }

    /**
     * Delete payroll record
     */
    public function destroy(Payroll $payroll): JsonResponse
    {
        if ($payroll->status === 'paid') {
            return response()->json([
                'success' => false,
                'message' => 'Cannot delete paid payroll records.',
            ], 422);
        }

        $payroll->delete();

        return response()->json([
            'success' => true,
            'message' => 'Payroll deleted successfully.',
        ]);
    }

    /**
     * Create payroll record manually
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'pay_period_start' => 'required|date',
            'pay_period_end' => 'required|date|after_or_equal:pay_period_start',
            'base_salary' => 'required|numeric|min:0',
            'hourly_rate' => 'nullable|numeric|min:0',
            'working_days' => 'nullable|integer|min:0',
            'present_days' => 'nullable|integer|min:0',
            'absent_days' => 'nullable|integer|min:0',
            'regular_hours' => 'nullable|numeric|min:0',
            'overtime_hours' => 'nullable|numeric|min:0',
            'overtime_pay' => 'nullable|numeric|min:0',
            'regular_holiday_pay' => 'nullable|numeric|min:0',
            'special_holiday_pay' => 'nullable|numeric|min:0',
            'night_differential' => 'nullable|numeric|min:0',
            'regular_holiday_ot_pay' => 'nullable|numeric|min:0',
            'special_holiday_ot_pay' => 'nullable|numeric|min:0',
            'bonus' => 'nullable|numeric|min:0',
            'allowances' => 'nullable|numeric|min:0',
            'deductions' => 'nullable|numeric|min:0',
            'tax_deduction' => 'nullable|numeric|min:0',
            'sss_contribution' => 'nullable|numeric|min:0',
            'philhealth_contribution' => 'nullable|numeric|min:0',
            'pagibig_contribution' => 'nullable|numeric|min:0',
            'late_deductions' => 'nullable|numeric|min:0',
            'absent_deductions' => 'nullable|numeric|min:0',
            'gross_pay' => 'required|numeric|min:0',
            'net_pay' => 'required|numeric|min:0',
            'remarks' => 'nullable|string',
        ]);

        $user = User::findOrFail($validated['user_id']);
        $periodLabel = Carbon::parse($validated['pay_period_start'])->format('M d') . ' - ' . Carbon::parse($validated['pay_period_end'])->format('M d, Y');

        $payroll = Payroll::create(array_merge($validated, [
            'pay_period_label' => $periodLabel,
            'department' => $user->department ?? 'Unassigned',
            'position' => $user->position ?? $user->role,
            'status' => 'draft',
            'processed_by' => Auth::id(),
            'processed_at' => now(),
        ]));

        $payroll->load('user');

        Notification::create([
            'role' => 'manager',
            'title' => 'Payroll Created',
            'message' => 'Manual payroll created for ' . ($payroll->user->name ?? 'employee') . ' for ' . $periodLabel . '.',
            'type' => 'success',
            'related_type' => 'payroll',
            'related_id' => $payroll->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payroll record created successfully.',
            'data' => $payroll->load(['user', 'processor']),
        ]);
    }
}
