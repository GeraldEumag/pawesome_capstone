<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\ThirteenthMonthAccrual;
use App\Models\User;
use App\Services\Payroll\PayrollComputationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ThirteenthMonthController extends Controller
{
    /** GET /manager/payroll/thirteenth-month?year=2026 */
    public function index(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);

        $accruals = ThirteenthMonthAccrual::where('year', $year)
            ->with(['user:id,name,employee_no', 'employee:id,first_name,last_name,employee_no'])
            ->get()
            ->map(fn ($a) => $this->format($a));

        $totals = [
            'total_accrued' => $accruals->sum('total_accrued'),
            'total_paid'    => $accruals->sum('paid_amount'),
        ];

        return response()->json(['success' => true, 'data' => $accruals, 'totals' => $totals]);
    }

    /**
     * POST /manager/payroll/thirteenth-month/accrue
     * Manually trigger accrual for the current (or specified) month.
     * month is optional — defaults to the current calendar month.
     */
    public function accrue(Request $request): JsonResponse
    {
        $data = $request->validate([
            'year'  => 'required|integer|min:2020',
            'month' => 'nullable|integer|min:1|max:12',
        ]);

        $year  = $data['year'];
        $month = $data['month'] ?? now()->month;

        $service = app(PayrollComputationService::class);
        $count   = 0;

        User::whereIn('role', ['manager', 'cashier', 'receptionist', 'veterinary', 'inventory', 'admin'])
            ->where('is_active', true)
            ->whereNotNull('base_salary')
            ->each(function (User $user) use ($service, $year, $month, &$count) {
                $service->accrue13thMonth($user, $year, $month, (float) $user->base_salary);
                $count++;
            });

        Employee::where('is_active', true)->whereNotNull('base_salary')->each(
            function (Employee $emp) use ($service, $year, $month, &$count) {
                $service->accrue13thMonth($emp, $year, $month, (float) $emp->base_salary);
                $count++;
            }
        );

        return response()->json([
            'success' => true,
            'message' => "13th month accrued for {$count} employees for {$year}-" . str_pad($month, 2, '0', STR_PAD_LEFT) . ".",
        ]);
    }

    /**
     * POST /manager/payroll/thirteenth-month/{id}/pay
     * Marks the full remaining balance as paid today.
     * paid_amount and paid_date are optional — defaults to remaining balance and today.
     */
    public function pay(Request $request, ThirteenthMonthAccrual $accrual): JsonResponse
    {
        if ($accrual->status === 'paid') {
            return response()->json(['message' => 'Already marked as paid.'], 422);
        }

        $remaining = max(0, (float) $accrual->total_accrued - (float) $accrual->paid_amount);

        $paidAmount = $request->input('paid_amount', $remaining);
        $paidDate   = $request->input('paid_date', now()->toDateString());

        $newPaid = (float) $accrual->paid_amount + (float) $paidAmount;

        $accrual->update([
            'paid_amount' => $newPaid,
            'paid_date'   => $paidDate,
            'status'      => $newPaid >= (float) $accrual->total_accrued ? 'paid' : 'partial',
        ]);

        return response()->json(['success' => true, 'data' => $this->format($accrual->fresh())]);
    }

    private function format(ThirteenthMonthAccrual $a): array
    {
        $person = $a->user ?? $a->employee;
        return [
            'id'            => $a->id,
            'year'          => $a->year,
            'person_type'   => $a->user_id ? 'user' : 'employee',
            'person_id'     => $a->user_id ?? $a->employee_id,
            'person_name'   => $person?->name ?? ($a->employee ? $a->employee->first_name . ' ' . $a->employee->last_name : null),
            'employee_no'   => $person?->employee_no ?? null,
            'months'        => [
                'jan' => (float) $a->jan_basic, 'feb' => (float) $a->feb_basic,
                'mar' => (float) $a->mar_basic, 'apr' => (float) $a->apr_basic,
                'may' => (float) $a->may_basic, 'jun' => (float) $a->jun_basic,
                'jul' => (float) $a->jul_basic, 'aug' => (float) $a->aug_basic,
                'sep' => (float) $a->sep_basic, 'oct' => (float) $a->oct_basic,
                'nov' => (float) $a->nov_basic, 'dec' => (float) $a->dec_basic,
            ],
            'total_accrued' => (float) $a->total_accrued,
            'paid_amount'   => (float) $a->paid_amount,
            'remaining'     => max(0, (float) $a->total_accrued - (float) $a->paid_amount),
            'paid_date'     => $a->paid_date?->toDateString(),
            'status'        => $a->status,
        ];
    }
}
