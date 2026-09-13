<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Notification;
use App\Models\Payroll;
use App\Models\Employee;
use App\Models\User;
use App\Services\Payroll\PayrollComputationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class PayrollController extends Controller
{
    public function __construct(
        private readonly PayrollComputationService $payrollComputation,
    ) {
    }

    /**
     * List all payroll records with optional filters
     */
    public function index(Request $request): JsonResponse
    {
        $query = Payroll::with(['user', 'employee', 'processor']);

        // Filter by person type: account users vs non-account employees
        $personType = $request->query('person_type', 'all');
        if ($personType === 'account') {
            $query->whereNotNull('user_id')->whereNull('employee_id');
        } elseif ($personType === 'employee') {
            $query->whereNotNull('employee_id');
        }

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
                  ->orWhere('employee_name', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('name', 'like', "%{$search}%");
                  })
                  ->orWhereHas('employee', function ($eq) use ($search) {
                      $eq->where('first_name', 'like', "%{$search}%")
                         ->orWhere('last_name', 'like', "%{$search}%")
                         ->orWhere('employee_no', 'like', "%{$search}%");
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

        $results = $this->payrollComputation->computeForAllPeople($startDate, $endDate);

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

        // Get all payable people: staff users + non-account employee records
        $people = $this->payrollComputation->staffEmployees()
            ->map(fn ($user) => ['person' => $user, 'isEmployee' => false])
            ->concat(
                $this->payrollComputation->activeEmployees()
                    ->map(fn ($employee) => ['person' => $employee, 'isEmployee' => true])
            );

        $attendanceRows = Attendance::whereBetween('date', [$startDate, $endDate])->get();
        $attendanceByUser = $attendanceRows->whereNotNull('user_id')->groupBy('user_id');
        $attendanceByEmployee = $attendanceRows->whereNotNull('employee_id')->groupBy('employee_id');

        $generated = [];
        $errors = [];

        foreach ($people as $entry) {
            $employee = $entry['person'];
            $isEmployee = $entry['isEmployee'];

            try {
                $computed = $this->payrollComputation->computeFromAttendance(
                    $employee,
                    $isEmployee
                        ? $attendanceByEmployee->get($employee->id, collect())
                        : $attendanceByUser->get($employee->id, collect())
                );

                // Create or update payroll record — keyed on whichever person
                // type this row belongs to.
                $payroll = Payroll::updateOrCreate(
                    array_merge(
                        $isEmployee
                            ? ['employee_id' => $employee->id]
                            : ['user_id' => $employee->id],
                        [
                            'pay_period_start' => $startDate,
                            'pay_period_end' => $endDate,
                        ]
                    ),
                    [
                        'employee_name' => $computed['employee_name'],
                        'pay_period_label' => $periodLabel,
                        'department' => $computed['department'],
                        'position' => $computed['position'],
                        'base_salary' => $computed['base_salary'],
                        'hourly_rate' => $computed['hourly_rate'],
                        'working_days' => 22,
                        'present_days' => $computed['present_days'],
                        'absent_days' => $computed['absent_days'],
                        'regular_hours' => $computed['regular_hours'],
                        'overtime_hours' => $computed['overtime_hours'],
                        'overtime_pay' => $computed['overtime_pay'],
                        'bonus' => 0,
                        'allowances' => 0,
                        'deductions' => 0,
                        'late_deductions' => $computed['late_deductions'],
                        'absent_deductions' => $computed['absent_deductions'],
                        'status' => 'draft',
                        'processed_by' => Auth::id(),
                        'processed_at' => now(),
                    ]
                );

                // Auto-calculate the payroll
                $payroll->calculatePayroll();
                $payroll->save();

                $generated[] = $payroll->load(['user', 'employee']);
            } catch (\Exception $e) {
                $errors[] = [
                    'user_id' => $isEmployee ? null : $employee->id,
                    'employee_id' => $isEmployee ? $employee->id : null,
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

        $payroll->load(['user', 'employee']);
        $payeeName = $payroll->user?->name ?? $payroll->employee?->name ?? $payroll->employee_name ?? 'employee';

        // Send notifications
        Notification::create([
            'role' => 'manager',
            'title' => 'Payroll Approved',
            'message' => "Payroll for {$payeeName} has been approved.",
            'type' => 'success',
            'related_type' => 'payroll',
            'related_id' => $payroll->id,
        ]);

        Notification::create([
            'role' => 'manager',
            'title' => 'Payroll Payment Required',
            'message' => "Approved payroll for {$payeeName} is ready for payment release.",
            'type' => 'warning',
            'related_type' => 'payroll',
            'related_id' => $payroll->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payroll approved successfully.',
            'data' => $payroll->load(['user', 'employee', 'processor']),
        ]);
    }

    /**
     * Mark payroll as paid
     */
    public function markAsPaid(Request $request, Payroll $payroll): JsonResponse
    {
        if ($payroll->status === 'paid') {
            return response()->json([
                'success' => false,
                'message' => 'Payroll is already marked as paid.',
            ], 422);
        }

        $paymentMethod = $request->input('payment_method', 'Bank Transfer');

        $payroll->update([
            'status' => 'paid',
            'payment_date' => $request->input('payment_date', now()),
            'payment_method' => $paymentMethod,
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
            'user_id' => 'nullable|exists:users,id',
            'employee_id' => 'nullable|exists:employees,id',
            'employee_name' => 'nullable|string|max:255',
            'pay_period_start' => 'required|date',
            'pay_period_end' => 'required|date|after_or_equal:pay_period_start',
            'employment_type' => 'nullable|in:regular,part_time,contractual',
            'rate_type' => 'nullable|in:daily,hourly,monthly',
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
            'commission' => 'nullable|numeric|min:0',
            'other_earnings' => 'nullable|numeric|min:0',
            'deductions' => 'nullable|numeric|min:0',
            'tax_deduction' => 'nullable|numeric|min:0',
            'sss_contribution' => 'nullable|numeric|min:0',
            'philhealth_contribution' => 'nullable|numeric|min:0',
            'pagibig_contribution' => 'nullable|numeric|min:0',
            'late_deductions' => 'nullable|numeric|min:0',
            'absent_deductions' => 'nullable|numeric|min:0',
            'salary_loan' => 'nullable|numeric|min:0',
            'cash_advance' => 'nullable|numeric|min:0',
            'gross_pay' => 'required|numeric|min:0',
            'net_pay' => 'required|numeric|min:0',
            'payment_date' => 'nullable|date',
            'payment_method' => 'nullable|string|max:50',
            'payment_reference' => 'nullable|string|max:100',
            'remarks' => 'nullable|string',
            'manual_attendance' => 'nullable|array',
        ]);

        $user = !empty($validated['user_id']) ? User::find($validated['user_id']) : null;
        $employee = !empty($validated['employee_id']) ? Employee::find($validated['employee_id']) : null;
        $periodLabel = Carbon::parse($validated['pay_period_start'])->format('M d') . ' - ' . Carbon::parse($validated['pay_period_end'])->format('M d, Y');

        // Require a person reference: user account, employee record, or free-text name
        if (!$user && !$employee && empty($validated['employee_name'])) {
            return response()->json([
                'success' => false,
                'message' => 'Please select an employee or enter an employee name.',
            ], 422);
        }

        if ($employee) {
            $validated['employee_name'] = $employee->name;
        }

        $payroll = Payroll::create(array_merge($validated, [
            'pay_period_label' => $periodLabel,
            'department' => $user?->department ?? $employee?->department ?? ($validated['department'] ?? 'Unassigned'),
            'position' => $user ? ($user->position ?? $user->role) : ($employee?->position ?? 'Staff'),
            'status' => 'draft',
            'processed_by' => Auth::id(),
            'processed_at' => now(),
        ]));

        $payroll->load('user');

        Notification::create([
            'role' => 'manager',
            'title' => 'Payroll Created',
            'message' => 'Manual payroll created for ' . ($payroll->employee_name ?? $payroll->user->name ?? 'employee') . ' for ' . $periodLabel . '.',
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

    /**
     * Update an existing manual payroll record (draft or pending only)
     */
    public function update(Request $request, $id): JsonResponse
    {
        $payroll = Payroll::findOrFail($id);

        if (in_array($payroll->status, ['paid', 'cancelled'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot edit a paid or cancelled payroll record.',
            ], 422);
        }

        $validated = $request->validate([
            'user_id' => 'nullable|exists:users,id',
            'employee_name' => 'nullable|string|max:255',
            'pay_period_start' => 'sometimes|required|date',
            'pay_period_end' => 'sometimes|required|date|after_or_equal:pay_period_start',
            'employment_type' => 'nullable|in:regular,part_time,contractual',
            'rate_type' => 'nullable|in:daily,hourly,monthly',
            'base_salary' => 'nullable|numeric|min:0',
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
            'commission' => 'nullable|numeric|min:0',
            'other_earnings' => 'nullable|numeric|min:0',
            'deductions' => 'nullable|numeric|min:0',
            'tax_deduction' => 'nullable|numeric|min:0',
            'sss_contribution' => 'nullable|numeric|min:0',
            'philhealth_contribution' => 'nullable|numeric|min:0',
            'pagibig_contribution' => 'nullable|numeric|min:0',
            'late_deductions' => 'nullable|numeric|min:0',
            'absent_deductions' => 'nullable|numeric|min:0',
            'salary_loan' => 'nullable|numeric|min:0',
            'cash_advance' => 'nullable|numeric|min:0',
            'gross_pay' => 'nullable|numeric|min:0',
            'net_pay' => 'nullable|numeric|min:0',
            'status' => 'nullable|in:draft,processing,pending,approved,paid,cancelled',
            'payment_date' => 'nullable|date',
            'payment_method' => 'nullable|string|max:50',
            'payment_reference' => 'nullable|string|max:100',
            'remarks' => 'nullable|string',
            'manual_attendance' => 'nullable|array',
        ]);

        // Recompute period label if dates changed
        if (isset($validated['pay_period_start']) || isset($validated['pay_period_end'])) {
            $start = $validated['pay_period_start'] ?? $payroll->pay_period_start;
            $end = $validated['pay_period_end'] ?? $payroll->pay_period_end;
            $validated['pay_period_label'] = Carbon::parse($start)->format('M d') . ' - ' . Carbon::parse($end)->format('M d, Y');
        }

        // Track approval transition
        if (isset($validated['status']) && $validated['status'] === 'approved' && $payroll->status !== 'approved') {
            $validated['approved_by'] = Auth::id();
            $validated['approved_at'] = now();
        }

        $payroll->update($validated);
        $payroll->load(['user', 'processor', 'approver']);

        return response()->json([
            'success' => true,
            'message' => 'Payroll record updated successfully.',
            'data' => $payroll,
        ]);
    }
}
