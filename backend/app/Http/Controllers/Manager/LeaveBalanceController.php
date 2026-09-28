<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeaveBalanceController extends Controller
{
    /** GET /manager/leave-balances?year=2026 */
    public function index(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);

        $balances = LeaveBalance::where('year', $year)
            ->with(['user:id,name,employee_no', 'employee:id,first_name,last_name,employee_no'])
            ->get()
            ->map(fn ($b) => $this->format($b));

        return response()->json(['success' => true, 'data' => $balances]);
    }

    /** GET /manager/leave-balances/{userId}/user?year=2026 */
    public function forUser(int $userId, Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);
        $balances = LeaveBalance::where('user_id', $userId)->where('year', $year)->get();

        return response()->json(['success' => true, 'data' => $balances]);
    }

    /** GET /manager/leave-balances/{employeeId}/employee?year=2026 */
    public function forEmployee(int $employeeId, Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);
        $balances = LeaveBalance::where('employee_id', $employeeId)->where('year', $year)->get();

        return response()->json(['success' => true, 'data' => $balances]);
    }

    /** PUT /manager/leave-balances/{id} — admin manual adjustment */
    public function update(Request $request, LeaveBalance $leaveBalance): JsonResponse
    {
        $data = $request->validate([
            'total_days'     => 'sometimes|numeric|min:0',
            'used_days'      => 'sometimes|numeric|min:0',
            'remaining_days' => 'sometimes|numeric|min:0',
        ]);

        $leaveBalance->update($data);

        return response()->json(['success' => true, 'data' => $leaveBalance->fresh()]);
    }

    /** POST /manager/leave-balances/seed — seed balances for all current employees for a year. */
    public function seed(Request $request): JsonResponse
    {
        $year = (int) $request->input('year', now()->year);
        $count = 0;

        User::whereIn('role', [
            'manager', 'cashier', 'receptionist', 'veterinary',
            'inventory', 'payroll', 'staff', 'groomer',
            'super_receptionist', 'super_admin', 'admin',
        ])->where('is_active', true)->each(function (User $user) use ($year, &$count) {
            LeaveBalance::seedForPerson($user->id, null, $year);
            $count++;
        });

        Employee::where('is_active', true)->each(function (Employee $emp) use ($year, &$count) {
            LeaveBalance::seedForPerson(null, $emp->id, $year);
            $count++;
        });

        return response()->json([
            'success' => true,
            'message' => "Leave balances seeded for {$count} people for {$year}.",
        ]);
    }

    private function format(LeaveBalance $b): array
    {
        $person = $b->user ?? $b->employee;
        return [
            'id'            => $b->id,
            'leave_type'    => $b->leave_type,
            'year'          => $b->year,
            'total_days'    => (float) $b->total_days,
            'used_days'     => (float) $b->used_days,
            'remaining_days' => (float) $b->remaining_days,
            'person_type'   => $b->user_id ? 'user' : 'employee',
            'person_id'     => $b->user_id ?? $b->employee_id,
            'person_name'   => $person?->name ?? ($b->employee ? $b->employee->first_name . ' ' . $b->employee->last_name : null),
            'employee_no'   => $person?->employee_no ?? null,
        ];
    }
}
