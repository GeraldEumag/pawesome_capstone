<?php

namespace App\Http\Controllers;

use App\Models\Payroll;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class PayrollController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Payroll::with(['user', 'processor']);

        // Filter by pay period
        if ($request->has('pay_period')) {
            $query->where('pay_period_label', $request->pay_period);
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

        // Calculate summary
        $summary = [
            'total_employees' => $payrolls->count(),
            'total_gross' => $payrolls->sum('gross_pay'),
            'total_net' => $payrolls->sum('net_pay'),
            'total_deductions' => $payrolls->sum(function ($p) {
                return $p->sss_contribution + $p->philhealth_contribution + $p->pagibig_contribution + 
                       $p->tax_deduction + $p->deductions;
            }),
            'paid_count' => $payrolls->where('status', 'paid')->count(),
            'pending_count' => $payrolls->where('status', 'pending')->count(),
            'processing_count' => $payrolls->where('status', 'processing')->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => $payrolls,
            'summary' => $summary,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'pay_period_start' => 'required|date',
            'pay_period_end' => 'required|date|after_or_equal:pay_period_start',
            'pay_period_label' => 'required|string',
            'base_salary' => 'required|numeric',
            'bonus' => 'nullable|numeric',
            'allowances' => 'nullable|numeric',
            'deductions' => 'nullable|numeric',
            'tax_deduction' => 'nullable|numeric',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        // Check for duplicate payroll record
        $existing = Payroll::where('user_id', $request->user_id)
            ->forPeriod($request->pay_period_start, $request->pay_period_end)
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'Payroll record already exists for this user for this pay period.',
            ], 422);
        }

        $user = User::find($request->user_id);

        $payrollData = array_merge($request->all(), [
            'bonus' => $request->bonus ?? 0,
            'allowances' => $request->allowances ?? 0,
            'deductions' => $request->deductions ?? 0,
            'tax_deduction' => $request->tax_deduction ?? 0,
            'processed_by' => auth()->id(),
        ]);

        $payroll = Payroll::create($payrollData);
        $payroll->calculatePayroll();
        $payroll->save();

        return response()->json([
            'success' => true,
            'message' => 'Payroll record created successfully.',
            'data' => $payroll->load(['user', 'processor']),
        ], 201);
    }

    public function show($id): JsonResponse
    {
        $payroll = Payroll::with(['user', 'processor'])->find($id);

        if (!$payroll) {
            return response()->json([
                'success' => false,
                'message' => 'Payroll record not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $payroll,
        ]);
    }

    public function update(Request $request, $id): JsonResponse
    {
        $payroll = Payroll::find($id);

        if (!$payroll) {
            return response()->json([
                'success' => false,
                'message' => 'Payroll record not found.',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'base_salary' => 'nullable|numeric',
            'bonus' => 'nullable|numeric',
            'allowances' => 'nullable|numeric',
            'deductions' => 'nullable|numeric',
            'tax_deduction' => 'nullable|numeric',
            'status' => 'nullable|in:draft,processing,pending,paid,cancelled',
            'payment_date' => 'nullable|date',
            'payment_method' => 'nullable|string',
            'remarks' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $payroll->update($request->all());

        // Recalculate if any financial fields changed
        if ($request->hasAny(['base_salary', 'bonus', 'allowances', 'deductions', 'overtime_hours', 'overtime_pay'])) {
            $payroll->calculatePayroll();
            $payroll->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Payroll record updated successfully.',
            'data' => $payroll->fresh()->load(['user', 'processor']),
        ]);
    }

    public function destroy($id): JsonResponse
    {
        $payroll = Payroll::find($id);

        if (!$payroll) {
            return response()->json([
                'success' => false,
                'message' => 'Payroll record not found.',
            ], 404);
        }

        $payroll->delete();

        return response()->json([
            'success' => true,
            'message' => 'Payroll record deleted successfully.',
        ]);
    }

    public function generateForPeriod(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'pay_period_start' => 'required|date',
            'pay_period_end' => 'required|date|after_or_equal:pay_period_start',
            'pay_period_label' => 'required|string',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'exists:users,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $userIds = $request->user_ids ?? User::where('employment_status', 'active')
            ->orWhereNull('employment_status')
            ->pluck('id')->toArray();

        $generated = [];
        $skipped = [];

        foreach ($userIds as $userId) {
            // Check if already exists
            $existing = Payroll::where('user_id', $userId)
                ->forPeriod($request->pay_period_start, $request->pay_period_end)
                ->first();

            if ($existing) {
                $skipped[] = $userId;
                continue;
            }

            $user = User::find($userId);
            
            if (!$user->base_salary && !$user->hourly_rate) {
                $skipped[] = $userId;
                continue;
            }

            $payroll = Payroll::create([
                'user_id' => $userId,
                'pay_period_start' => $request->pay_period_start,
                'pay_period_end' => $request->pay_period_end,
                'pay_period_label' => $request->pay_period_label,
                'base_salary' => $user->base_salary ?? ($user->hourly_rate * 160),
                'bonus' => 0,
                'allowances' => 0,
                'deductions' => 0,
                'tax_deduction' => 0,
                'processed_by' => auth()->id(),
                'processed_at' => now(),
            ]);

            $payroll->calculatePayroll();
            $payroll->save();

            $generated[] = $payroll->load('user');
        }

        return response()->json([
            'success' => true,
            'message' => 'Payroll generation completed.',
            'generated_count' => count($generated),
            'skipped_count' => count($skipped),
            'data' => $generated,
        ]);
    }

    public function processPayment(Request $request, $id): JsonResponse
    {
        $payroll = Payroll::find($id);

        if (!$payroll) {
            return response()->json([
                'success' => false,
                'message' => 'Payroll record not found.',
            ], 404);
        }

        if ($payroll->status === 'paid') {
            return response()->json([
                'success' => false,
                'message' => 'This payroll has already been paid.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'payment_date' => 'required|date',
            'payment_method' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $payroll->update([
            'status' => 'paid',
            'payment_date' => $request->payment_date,
            'payment_method' => $request->payment_method,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payment processed successfully.',
            'data' => $payroll->fresh()->load(['user', 'processor']),
        ]);
    }

    public function myPayroll(Request $request): JsonResponse
    {
        $userId = auth()->id();
        
        $query = Payroll::with('processor')
            ->forUser($userId)
            ->orderBy('pay_period_start', 'desc');

        if ($request->has('status')) {
            $query->byStatus($request->status);
        }

        $payrolls = $query->get();

        return response()->json([
            'success' => true,
            'data' => $payrolls,
        ]);
    }

    public function payslip($id): JsonResponse
    {
        $payroll = Payroll::with(['user', 'processor'])->find($id);

        if (!$payroll) {
            return response()->json([
                'success' => false,
                'message' => 'Payroll record not found.',
            ], 404);
        }

        // Check authorization: own payslip, or manager/admin role
        if (auth()->id() !== $payroll->user_id && !in_array(auth()->user()?->role, ['admin', 'manager', 'payroll'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access.',
            ], 403);
        }

        $payslipData = [
            'company_name' => 'Pawesome Retreat Inc.',
            'payslip_date' => now()->toDateString(),
            'payroll_id' => $payroll->payroll_id,
            'pay_period' => $payroll->pay_period_label,
            'employee' => [
                'name' => $payroll->user->name,
                'id' => $payroll->user->id,
                'department' => $payroll->department,
                'position' => $payroll->position,
            ],
            'earnings' => [
                'base_salary' => $payroll->base_salary,
                'overtime_pay' => $payroll->overtime_pay,
                'bonus' => $payroll->bonus,
                'allowances' => $payroll->allowances,
                'gross_pay' => $payroll->gross_pay,
            ],
            'deductions' => [
                'sss' => $payroll->sss_contribution,
                'philhealth' => $payroll->philhealth_contribution,
                'pagibig' => $payroll->pagibig_contribution,
                'tax' => $payroll->tax_deduction,
                'late_deductions' => $payroll->late_deductions,
                'absent_deductions' => $payroll->absent_deductions,
                'other_deductions' => $payroll->deductions,
                'total_deductions' => $payroll->sss_contribution + $payroll->philhealth_contribution + 
                                     $payroll->pagibig_contribution + $payroll->tax_deduction + 
                                     $payroll->late_deductions + $payroll->absent_deductions + 
                                     $payroll->deductions,
            ],
            'attendance' => [
                'working_days' => $payroll->working_days,
                'present_days' => $payroll->present_days,
                'absent_days' => $payroll->absent_days,
                'regular_hours' => $payroll->regular_hours,
                'overtime_hours' => $payroll->overtime_hours,
            ],
            'net_pay' => $payroll->net_pay,
            'payment_date' => $payroll->payment_date,
            'payment_method' => $payroll->payment_method,
            'status' => $payroll->status,
        ];

        return response()->json([
            'success' => true,
            'data' => $payslipData,
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        $payPeriod = $request->get('pay_period', Carbon::now()->format('F Y'));
        
        $payrolls = Payroll::where('pay_period_label', $payPeriod)->get();

        $summary = [
            'pay_period' => $payPeriod,
            'total_employees' => $payrolls->count(),
            'total_base_salary' => $payrolls->sum('base_salary'),
            'total_overtime_pay' => $payrolls->sum('overtime_pay'),
            'total_bonus' => $payrolls->sum('bonus'),
            'total_allowances' => $payrolls->sum('allowances'),
            'total_gross_pay' => $payrolls->sum('gross_pay'),
            'total_sss' => $payrolls->sum('sss_contribution'),
            'total_philhealth' => $payrolls->sum('philhealth_contribution'),
            'total_pagibig' => $payrolls->sum('pagibig_contribution'),
            'total_tax' => $payrolls->sum('tax_deduction'),
            'total_deductions' => $payrolls->sum(function ($p) {
                return $p->sss_contribution + $p->philhealth_contribution + $p->pagibig_contribution + 
                       $p->tax_deduction + $p->deductions + $p->late_deductions + $p->absent_deductions;
            }),
            'total_net_pay' => $payrolls->sum('net_pay'),
            'by_department' => $payrolls->groupBy('department')->map(function ($group) {
                return [
                    'count' => $group->count(),
                    'total_net' => $group->sum('net_pay'),
                ];
            }),
            'by_status' => [
                'draft' => $payrolls->where('status', 'draft')->count(),
                'processing' => $payrolls->where('status', 'processing')->count(),
                'pending' => $payrolls->where('status', 'pending')->count(),
                'paid' => $payrolls->where('status', 'paid')->count(),
                'cancelled' => $payrolls->where('status', 'cancelled')->count(),
            ],
        ];

        return response()->json([
            'success' => true,
            'data' => $summary,
        ]);
    }
}
