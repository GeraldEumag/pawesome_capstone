<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SalaryLoan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MyLoanController extends Controller
{
    /** GET /api/my-loans */
    public function index(): JsonResponse
    {
        $user  = auth()->user();
        $loans = SalaryLoan::where('user_id', $user->id)
            ->orderByRaw("FIELD(status,'active','paid','cancelled')")
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $loans]);
    }

    /** POST /api/my-loans — request a loan (pending manager approval) */
    public function store(Request $request): JsonResponse
    {
        $user = auth()->user();

        $data = $request->validate([
            'loan_type'          => 'required|in:salary_loan,cash_advance',
            'principal'          => 'required|numeric|min:100',
            'installment_amount' => 'required|numeric|min:1',
            'start_period'       => 'required|date',
            'notes'              => 'nullable|string|max:500',
        ]);

        $loan = SalaryLoan::create([
            'user_id'            => $user->id,
            'loan_type'          => $data['loan_type'],
            'principal'          => $data['principal'],
            'balance'            => $data['principal'],
            'installment_amount' => $data['installment_amount'],
            'start_period'       => $data['start_period'],
            'status'             => 'active', // auto-approved; manager can cancel
            'notes'              => $data['notes'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Loan request submitted.',
            'data'    => $loan,
        ], 201);
    }
}
