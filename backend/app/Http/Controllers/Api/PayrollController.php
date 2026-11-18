<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\PayslipReleasedMail;
use App\Models\Attendance;
use App\Models\Notification;
use App\Models\Payroll;
use App\Models\Employee;
use App\Models\User;
use App\Services\EmailDeliveryService;
use App\Services\Payroll\PayrollPayslipDataService;
use App\Services\Payroll\PayrollComputationService;
use App\Services\WorkflowNotifier;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\UniqueConstraintViolationException;

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

        // Filter by non-account employee
        if ($request->has('employee_id')) {
            $query->forEmployee($request->employee_id);
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
                       $p->deductions + $p->salary_loan + $p->cash_advance;
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

        if (!PayrollComputationService::isSemiMonthlyPeriod($validated['period_start'], $validated['period_end'])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid pay period. Payroll must run for the 1st–15th or the 16th–end of a month.',
            ], 422);
        }

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

        if (!PayrollComputationService::isSemiMonthlyPeriod($validated['period_start'], $validated['period_end'])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid pay period. Payroll must run for the 1st–15th or the 16th–end of a month.',
            ], 422);
        }

        $startDate = Carbon::parse($validated['period_start'])->toDateString();
        $endDate = Carbon::parse($validated['period_end'])->toDateString();
        $periodLabel = Carbon::parse($startDate)->format('M d') . ' - ' . Carbon::parse($endDate)->format('M d, Y');

        // Get all payable people: staff users + non-account employee records
        $people = $this->payrollComputation->staffEmployees()
            ->map(fn ($user) => ['person' => $user, 'isEmployee' => false])
            ->concat(
                $this->payrollComputation->activeEmployees()
                    ->map(fn ($employee) => ['person' => $employee, 'isEmployee' => true])
            );
        $this->payrollComputation->assertPayrollEligible($people->pluck('person'));

        $attendanceRows = Attendance::whereBetween('date', [$startDate, $endDate])->get();
        $attendanceByUser = $attendanceRows->whereNotNull('user_id')->groupBy('user_id');
        $attendanceByEmployee = $attendanceRows->whereNotNull('employee_id')->groupBy('employee_id');

        $generated = [];
        $errors = [];
        $skipped = [];

        foreach ($people as $entry) {
            $employee = $entry['person'];
            $isEmployee = $entry['isEmployee'];

            try {
                $existingPayroll = Payroll::query()
                    ->where($isEmployee ? 'employee_id' : 'user_id', $employee->id)
                    ->whereDate('pay_period_start', $startDate)
                    ->whereDate('pay_period_end', $endDate)
                    ->exists();

                if ($existingPayroll) {
                    $skipped[] = [
                        'user_id' => $isEmployee ? null : $employee->id,
                        'employee_id' => $isEmployee ? $employee->id : null,
                    ];
                    continue;
                }

                $computed = $this->payrollComputation->computeFromAttendance(
                    $employee,
                    $isEmployee
                        ? $attendanceByEmployee->get($employee->id, collect())
                        : $attendanceByUser->get($employee->id, collect()),
                    $startDate,
                    $endDate
                );

                // Create or update payroll record — keyed on whichever person
                // type this row belongs to. Only identity + NOT NULL columns
                // are written here; every computed field is filled by the
                // service below so generated payrolls match the preview.
                // Retry the whole updateOrCreate on a payroll_id unique
                // collision — each attempt re-runs the creating hook and
                // recomputes MAX(seq)+1, so a concurrent insert that stole
                // the suffix is recovered instead of dropping the row.
                $payroll = retry(3, function () use ($isEmployee, $employee, $startDate, $endDate, $computed, $periodLabel) {
                    return Payroll::updateOrCreate(
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
                            'status' => 'draft',
                            'processed_by' => Auth::id(),
                            'processed_at' => now(),
                        ]
                    );
                }, 100, fn ($e) => $e instanceof UniqueConstraintViolationException);

                // Single source of truth: full attendance-driven recomputation
                // (premiums, statutory, loans, undertime, auto-absences).
                $payroll->calculatePayroll(true);
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
            WorkflowNotifier::notifyRole(
                'manager',
                'Payroll Generated',
                'Payroll has been generated for ' . $periodLabel . ' (' . count($generated) . ' employees).',
                'info',
                'payroll'
            );

            WorkflowNotifier::notifyRole(
                'manager',
                'Payroll Ready for Review',
                'New payroll records are ready for review and approval.',
                'success',
                'payroll'
            );
        }

        return response()->json([
            'success' => true,
            'message' => 'Payroll generated from attendance records.',
            'data' => $generated,
            'errors' => $errors,
            'skipped' => $skipped,
            'summary' => [
                'generated_count' => count($generated),
                'error_count' => count($errors),
                'skipped_count' => count($skipped),
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
        $result = DB::transaction(function () use ($payroll) {
            $locked = Payroll::lockForUpdate()->findOrFail($payroll->id);
            if (!in_array($locked->status, ['draft', 'processing'], true)) {
                return ['error' => 'Only draft or processing payroll can be approved.'];
            }

            // Free-text payroll has no authoritative person record, so keep
            // the existing maker-checker control for those rows.
            if ($locked->is_unlinked && $locked->processed_by !== null
                && (int) $locked->processed_by === (int) Auth::id()) {
                return ['error' => 'Manual/unlinked payroll requires approval by a different authorized manager than the creator.'];
            }

            $locked->update([
                'status' => 'pending',
                'approved_by' => Auth::id(),
                'approved_at' => now(),
            ]);

            return ['payroll' => $locked->fresh(['user', 'employee', 'processor'])];
        });

        if (isset($result['error'])) {
            return response()->json([
                'success' => false,
                'message' => $result['error'],
            ], 422);
        }
        $payroll = $result['payroll'];

        $payroll->load(['user', 'employee']);
        $payeeName = $payroll->user?->name ?? $payroll->employee?->name ?? $payroll->employee_name ?? 'employee';

        // Send notifications
        WorkflowNotifier::notifyRole(
            'manager',
            'Payroll Approved',
            "Payroll for {$payeeName} has been approved.",
            'success',
            'payroll',
            $payroll->id
        );

        WorkflowNotifier::notifyRole(
            'manager',
            'Payroll Payment Required',
            "Approved payroll for {$payeeName} is ready for payment release.",
            'warning',
            'payroll',
            $payroll->id
        );

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

        // Payment must follow approval — releasing a draft/processing row
        // would skip the approve() transition and its audit stamping, and a
        // cancelled row must never become payable.
        if ($payroll->status !== 'pending') {
            return response()->json([
                'success' => false,
                'message' => 'Payroll must be approved before payment can be released.',
            ], 422);
        }

        if ($payroll->approved_by === null || $payroll->approved_at === null) {
            return response()->json([
                'success' => false,
                'message' => 'Payroll requires recorded approval before payment can be released.',
            ], 422);
        }

        $paymentMethod = $request->input('payment_method', 'Bank Transfer');

        // Status change, loan settlement, and notifications must commit
        // atomically — a mid-settlement failure would otherwise leave a
        // 'paid' row with partially-settled loans and no retry path (the
        // already-paid guard would 422 every subsequent attempt).
        return DB::transaction(function () use ($request, $payroll, $paymentMethod) {
            // Re-read under a row lock: the route-model-bound instance is
            // stale by now, and a concurrent release could otherwise pass
            // the outer guards on the same 'pending' snapshot and settle
            // loans twice. The loser waits on the lock then sees 'paid'.
            $payroll = Payroll::lockForUpdate()->findOrFail($payroll->id);
            if ($payroll->status !== 'pending') {
                return response()->json([
                    'success' => false,
                    'message' => $payroll->status === 'paid'
                        ? 'Payroll is already marked as paid.'
                        : 'Payroll must be approved before payment can be released.',
                ], 422);
            }
            if ($payroll->approved_by === null || $payroll->approved_at === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Payroll requires recorded approval before payment can be released.',
                ], 422);
            }

            $payroll->update([
                'status' => 'paid',
                'payment_date' => $request->input('payment_date', now()),
                'payment_method' => $paymentMethod,
                'processed_by' => Auth::id(),
                'processed_at' => now(),
            ]);

            // Settle loan/cash-advance installments exactly once — the
            // loans_settled guard prevents balances being reduced twice.
            if (!$payroll->loans_settled) {
                $person = $payroll->user ?? $payroll->employee;
                if ($person && ((float) $payroll->salary_loan > 0 || (float) $payroll->cash_advance > 0)) {
                    $this->payrollComputation->settleLoanDeductions(
                        $person,
                        $payroll->pay_period_start?->toDateString()
                    );
                }
                $payroll->loans_settled = true;
                $payroll->save();
            }

            $payroll->load(['user', 'employee']);
            $payeeName = $payroll->user?->name ?? $payroll->employee?->name ?? $payroll->employee_name ?? 'employee';

            // Send notifications
            WorkflowNotifier::notifyRole(
                'manager',
                'Payroll Paid',
                "Payroll for {$payeeName} has been marked as paid.",
                'success',
                'payroll',
                $payroll->id
            );

            // Payslip notification only exists for account users — non-account
            // employee records have no inbox.
            if ($payroll->user_id) {
                Notification::create([
                    'user_id' => $payroll->user_id,
                    'title' => 'Payslip Available',
                    'message' => 'Your payroll has been marked as paid. You may now download your payslip.',
                    'type' => 'info',
                    'related_type' => 'payroll',
                    'related_id' => $payroll->id,
                ]);

                // Payslip release email via the durable outbox. Created inside
                // this transaction so 'paid' + the email intent commit
                // atomically; occurrence_key dedupes any retry/replay — one
                // payslip email per payroll row, ever.
                $employeeEmail = $payroll->user?->email;
                if ($employeeEmail) {
                    app(EmailDeliveryService::class)->intent(
                        new PayslipReleasedMail(
                            $payeeName,
                            $payroll->pay_period_label
                                ?? trim(($payroll->pay_period_start?->toDateString() ?? '') . ' – ' . ($payroll->pay_period_end?->toDateString() ?? ''), ' –'),
                            (float) $payroll->net_pay,
                            $employeeEmail,
                            $payroll->payroll_id,
                            $payroll->payment_date?->toDateString() ?? $payroll->processed_at?->toDateString(),
                            $payroll->payment_method,
                            (float) $payroll->gross_pay,
                            app(PayrollPayslipDataService::class)->forPayroll($payroll)
                        ),
                        [
                            'event_key'      => 'payroll.payslip_released',
                            'occurrence_key' => 'payroll.payslip:' . $payroll->id,
                            'recipient'      => $employeeEmail,
                            'source_type'    => 'payroll',
                            'source_id'      => $payroll->id,
                            'user_id'        => $payroll->user_id,
                        ]
                    );
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Payroll marked as paid.',
                'data' => $payroll->load(['user', 'processor']),
            ]);
        });
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
        return DB::transaction(function () use ($payroll): JsonResponse {
            $locked = Payroll::lockForUpdate()->findOrFail($payroll->id);
            if (!in_array($locked->status, ['draft', 'cancelled'], true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only draft or cancelled payroll records can be deleted.',
                ], 422);
            }

            $locked->delete();

            return response()->json([
                'success' => true,
                'message' => 'Payroll deleted successfully.',
            ]);
        });
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
            'working_days' => 'nullable|numeric|min:0',
            'present_days' => 'nullable|numeric|min:0',
            'absent_days' => 'nullable|numeric|min:0',
            'paid_leave_days' => 'nullable|numeric|min:0',
            'regular_hours' => 'nullable|numeric|min:0',
            'overtime_hours' => 'nullable|numeric|min:0',
            'overtime_pay' => 'nullable|numeric|min:0',
            'regular_holiday_pay' => 'nullable|numeric|min:0',
            'special_holiday_pay' => 'nullable|numeric|min:0',
            'night_differential' => 'nullable|numeric|min:0',
            'regular_holiday_ot_pay' => 'nullable|numeric|min:0',
            'special_holiday_ot_pay' => 'nullable|numeric|min:0',
            'rest_day_pay' => 'nullable|numeric|min:0',
            'rest_day_ot_pay' => 'nullable|numeric|min:0',
            'bonus' => 'nullable|numeric|min:0',
            'allowances' => 'nullable|numeric|min:0',
            'non_taxable_allowances' => 'nullable|numeric|min:0',
            'commission' => 'nullable|numeric|min:0',
            'other_earnings' => 'nullable|numeric|min:0',
            'deductions' => 'nullable|numeric|min:0',
            'tax_deduction' => 'nullable|numeric|min:0',
            'sss_contribution' => 'nullable|numeric|min:0',
            'philhealth_contribution' => 'nullable|numeric|min:0',
            'pagibig_contribution' => 'nullable|numeric|min:0',
            'late_deductions' => 'nullable|numeric|min:0',
            'absent_deductions' => 'nullable|numeric|min:0',
            'undertime_deductions' => 'nullable|numeric|min:0',
            'salary_loan' => 'nullable|numeric|min:0',
            'cash_advance' => 'nullable|numeric|min:0',
            // Totals are mandatory only for free-text rows with no linked
            // person — linked rows are always recomputed server-side below,
            // so submitted totals can never override the authoritative math.
            'gross_pay' => 'required_without_all:user_id,employee_id|numeric|min:0',
            'net_pay' => 'required_without_all:user_id,employee_id|numeric|min:0',
            'payment_date' => 'nullable|date',
            'payment_method' => 'nullable|string|max:50',
            'payment_reference' => 'nullable|string|max:100',
            'remarks' => 'nullable|string',
            'manual_attendance' => 'nullable|array',
        ]);

        if (!PayrollComputationService::isSemiMonthlyPeriod($validated['pay_period_start'], $validated['pay_period_end'])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid pay period. Payroll must run for the 1st–15th or the 16th–end of a month.',
            ], 422);
        }

        $user = !empty($validated['user_id']) ? User::find($validated['user_id']) : null;
        $employee = !empty($validated['employee_id']) ? Employee::find($validated['employee_id']) : null;
        $periodLabel = Carbon::parse($validated['pay_period_start'])->format('M d') . ' - ' . Carbon::parse($validated['pay_period_end'])->format('M d, Y');

        if ($user && $employee) {
            return response()->json([
                'success' => false,
                'message' => 'Select either a user account or an employee record, not both.',
            ], 422);
        }
        if ($employee?->user_id) {
            return response()->json([
                'success' => false,
                'message' => 'This employee is linked to a user account; create payroll using the account record only.',
            ], 422);
        }

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

        if (($user || $employee) && ($validated['rate_type'] ?? 'monthly') !== 'monthly') {
            return response()->json([
                'success' => false,
                'message' => 'Daily and hourly payroll require an approved rate calculation policy and are not supported by this payroll run.',
            ], 422);
        }

        // Retry the whole create on a payroll_id unique collision — each
        // attempt regenerates the ID via the creating hook, so a concurrent
        // insert stealing the suffix no longer surfaces as a 500.
        $payroll = retry(3, fn () => Payroll::create(array_merge($validated, [
            'pay_period_label' => $periodLabel,
            'department' => $user?->department ?? $employee?->department ?? ($validated['department'] ?? 'Unassigned'),
            'position' => $user ? ($user->position ?? $user->role) : ($employee?->position ?? 'Staff'),
            'status' => 'draft',
            'processed_by' => Auth::id(),
            'processed_at' => now(),
        ])), 100, fn ($e) => $e instanceof UniqueConstraintViolationException);

        // Person-linked rows are recomputed through the authoritative
        // service — the same path update() takes — so client-submitted
        // gross_pay/net_pay can never persist for a real employee.
        if ($user || $employee) {
            $payroll->calculatePayroll(true);
            $payroll->save();
        }

        $payroll->load('user');

        WorkflowNotifier::notifyRole(
            'manager',
            'Payroll Created',
            'Manual payroll created for ' . ($payroll->employee_name ?? $payroll->user->name ?? 'employee') . ' for ' . $periodLabel . '.',
            'success',
            'payroll',
            $payroll->id
        );

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
        return DB::transaction(function () use ($request, $id): JsonResponse {
        $payroll = Payroll::lockForUpdate()->findOrFail($id);

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
            'working_days' => 'nullable|numeric|min:0',
            'present_days' => 'nullable|numeric|min:0',
            'absent_days' => 'nullable|numeric|min:0',
            'paid_leave_days' => 'nullable|numeric|min:0',
            'regular_hours' => 'nullable|numeric|min:0',
            'overtime_hours' => 'nullable|numeric|min:0',
            'overtime_pay' => 'nullable|numeric|min:0',
            'regular_holiday_pay' => 'nullable|numeric|min:0',
            'special_holiday_pay' => 'nullable|numeric|min:0',
            'night_differential' => 'nullable|numeric|min:0',
            'regular_holiday_ot_pay' => 'nullable|numeric|min:0',
            'special_holiday_ot_pay' => 'nullable|numeric|min:0',
            'rest_day_pay' => 'nullable|numeric|min:0',
            'rest_day_ot_pay' => 'nullable|numeric|min:0',
            'bonus' => 'nullable|numeric|min:0',
            'allowances' => 'nullable|numeric|min:0',
            'non_taxable_allowances' => 'nullable|numeric|min:0',
            'commission' => 'nullable|numeric|min:0',
            'other_earnings' => 'nullable|numeric|min:0',
            'deductions' => 'nullable|numeric|min:0',
            'tax_deduction' => 'nullable|numeric|min:0',
            'sss_contribution' => 'nullable|numeric|min:0',
            'philhealth_contribution' => 'nullable|numeric|min:0',
            'pagibig_contribution' => 'nullable|numeric|min:0',
            'late_deductions' => 'nullable|numeric|min:0',
            'absent_deductions' => 'nullable|numeric|min:0',
            'undertime_deductions' => 'nullable|numeric|min:0',
            'salary_loan' => 'nullable|numeric|min:0',
            'cash_advance' => 'nullable|numeric|min:0',
            'gross_pay' => 'nullable|numeric|min:0',
            'net_pay' => 'nullable|numeric|min:0',
            // Terminal/effective statuses are intentionally excluded: approve
            // and payment have dedicated endpoints that perform side-effects
            // (processed_by stamping, loan settlement, notifications). Letting
            // update() set them would bypass all of that.
            'status' => 'nullable|in:draft,processing,cancelled',
            'payment_date' => 'nullable|date',
            'payment_method' => 'nullable|string|max:50',
            'payment_reference' => 'nullable|string|max:100',
            'remarks' => 'nullable|string',
            'manual_attendance' => 'nullable|array',
        ]);

        if ($payroll->status === 'pending') {
            $changedFields = array_diff(array_keys($validated), ['status', 'remarks']);
            if (($validated['status'] ?? null) !== 'cancelled' || $changedFields !== []) {
                return response()->json([
                    'success' => false,
                    'message' => 'Approved payroll cannot be edited. Cancel it and create a corrected draft for a new approval.',
                ], 422);
            }
        }

        if ($payroll->user_id && ($validated['rate_type'] ?? $payroll->rate_type) !== 'monthly') {
            return response()->json([
                'success' => false,
                'message' => 'Daily and hourly payroll require an approved rate calculation policy and are not supported by this payroll run.',
            ], 422);
        }

        // Recompute period label if dates changed
        if (isset($validated['pay_period_start']) || isset($validated['pay_period_end'])) {
            $start = Carbon::parse($validated['pay_period_start'] ?? $payroll->pay_period_start)->toDateString();
            $end = Carbon::parse($validated['pay_period_end'] ?? $payroll->pay_period_end)->toDateString();

            if (!PayrollComputationService::isSemiMonthlyPeriod($start, $end)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid pay period. Payroll must run for the 1st–15th or the 16th–end of a month.',
                ], 422);
            }

            $validated['pay_period_label'] = Carbon::parse($start)->format('M d') . ' - ' . Carbon::parse($end)->format('M d, Y');
        }

        $payroll->update($validated);

        // Any money/attendance input change triggers a full service recompute
        // so the row stays consistent with attendance + statutory rules.
        if ($request->hasAny([
            'base_salary', 'hourly_rate', 'bonus', 'allowances', 'non_taxable_allowances',
            'commission', 'other_earnings', 'deductions', 'salary_loan', 'cash_advance',
            'overtime_hours', 'overtime_pay', 'manual_attendance',
        ])) {
            $payroll->calculatePayroll(true);
            $payroll->save();
        }

        $payroll->load(['user', 'processor', 'approver']);

        return response()->json([
            'success' => true,
            'message' => 'Payroll record updated successfully.',
            'data' => $payroll,
        ]);
        });
    }
}
