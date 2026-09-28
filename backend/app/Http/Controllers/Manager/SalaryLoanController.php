<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\SalaryLoan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalaryLoanController extends Controller
{
    /** GET /manager/salary-loans */
    public function index(Request $request): JsonResponse
    {
        $query = SalaryLoan::with([
            'user:id,name,employee_no',
            'employee:id,first_name,last_name,employee_no',
            'approver:id,name',
        ])->orderByRaw("FIELD(status,'active','paid','cancelled')")
          ->orderBy('created_at', 'desc');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        return response()->json(['success' => true, 'data' => $query->paginate(50)]);
    }

    /** POST /manager/salary-loans */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id'            => 'nullable|exists:users,id',
            'employee_id'        => 'nullable|exists:employees,id',
            'loan_type'          => 'required|in:salary_loan,cash_advance',
            'principal'          => 'required|numeric|min:1',
            'installment_amount' => 'required|numeric|min:1',
            'start_period'       => 'required|date',
            'end_period'         => 'nullable|date|after:start_period',
            'notes'              => 'nullable|string|max:500',
        ]);

        if (empty($data['user_id']) && empty($data['employee_id'])) {
            return response()->json(['message' => 'Either user_id or employee_id is required.'], 422);
        }

        $data['balance']     = $data['principal'];
        $data['approved_by'] = auth()->id();
        $data['approved_at'] = now();
        $data['status']      = 'active';

        $loan = SalaryLoan::create($data);

        return response()->json(['success' => true, 'data' => $loan->load('approver:id,name')], 201);
    }

    /** GET /manager/salary-loans/{loan} */
    public function show(SalaryLoan $salaryLoan): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $salaryLoan->load(['user:id,name,employee_no', 'employee:id,first_name,last_name,employee_no', 'approver:id,name']),
        ]);
    }

    /** PUT /manager/salary-loans/{loan} */
    public function update(Request $request, SalaryLoan $salaryLoan): JsonResponse
    {
        $data = $request->validate([
            'installment_amount' => 'sometimes|numeric|min:1',
            'end_period'         => 'sometimes|nullable|date',
            'notes'              => 'sometimes|nullable|string|max:500',
        ]);

        $salaryLoan->update($data);

        return response()->json(['success' => true, 'data' => $salaryLoan->fresh()]);
    }

    /** DELETE /manager/salary-loans/{loan} */
    public function cancel(SalaryLoan $salaryLoan): JsonResponse
    {
        if ($salaryLoan->status !== 'active') {
            return response()->json(['message' => 'Loan is not active.'], 422);
        }

        $salaryLoan->update(['status' => 'cancelled']);

        return response()->json(['success' => true, 'message' => 'Loan cancelled.']);
    }
}
