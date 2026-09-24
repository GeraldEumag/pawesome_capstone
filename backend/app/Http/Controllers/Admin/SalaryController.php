<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class SalaryController extends Controller
{
    public function index()
    {
        $latestPayrolls = Payroll::latest('pay_period_start')
            ->get()
            ->unique('user_id')
            ->keyBy('user_id');

        return response()->json([
            'success' => true,
            'data' => User::where('role', '!=', 'customer')
                ->orderBy('name')
                ->get()
                ->map(fn (User $user) => $this->formatEmployee($user, $latestPayrolls->get($user->id)))
                ->values(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'employeeId' => 'nullable|string|max:50',
            'name' => 'required|string|max:255',
            'department' => 'nullable|string|max:100',
            'position' => 'nullable|string|max:100',
            'baseSalary' => 'nullable|numeric|min:0',
            'status' => 'nullable|string|max:50',
        ]);

        $email = Str::slug($data['name']) . '-' . Str::lower(Str::random(6)) . '@pawesome.local';

        $user = User::create([
            'name' => $data['name'],
            'email' => $email,
            'password' => Hash::make(Str::random(16)),
            'role' => 'staff',
            'is_active' => ($data['status'] ?? 'active') === 'active',
            'department' => $data['department'] ?? null,
            'position' => $data['position'] ?? null,
            'base_salary' => $data['baseSalary'] ?? 0,
            'employment_status' => $data['status'] ?? 'active',
        ]);

        return response()->json([
            'success' => true,
            'data' => $this->formatEmployee($user),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'department' => 'nullable|string|max:100',
            'position' => 'nullable|string|max:100',
            'baseSalary' => 'nullable|numeric|min:0',
            'status' => 'nullable|string|max:50',
        ]);

        $user->update([
            'name' => $data['name'] ?? $user->name,
            'department' => $data['department'] ?? $user->department,
            'position' => $data['position'] ?? $user->position,
            'base_salary' => $data['baseSalary'] ?? $user->base_salary,
            'employment_status' => $data['status'] ?? $user->employment_status,
            'is_active' => isset($data['status']) ? $data['status'] === 'active' : $user->is_active,
        ]);

        return response()->json([
            'success' => true,
            'data' => $this->formatEmployee($user->fresh()),
        ]);
    }

    public function destroy($id)
    {
        $user = User::findOrFail($id);

        if ($user->id === auth()->id()) {
            return response()->json(['message' => 'You cannot delete your own account'], 403);
        }

        $customerId = $user->customer?->id;
        $hasPets = $customerId && \App\Models\Pet::where('customer_id', $customerId)->exists();
        $hasAppointments = $customerId && \App\Models\Appointment::where('customer_id', $customerId)->exists();
        $hasBoardings = $customerId && \App\Models\Boarding::where('customer_id', $customerId)->exists();

        if ($hasPets || $hasAppointments || $hasBoardings) {
            return response()->json([
                'message' => 'Cannot delete user with active pets, appointments, or boardings'
            ], 422);
        }

        $user->delete();

        return response()->json([
            'success' => true,
            'message' => 'Salary record deleted',
        ]);
    }

    private function formatEmployee(User $user, ?Payroll $payroll = null): array
    {
        $baseSalary = (float) ($payroll?->base_salary ?? $user->base_salary ?? 0);

        return [
            'id' => $user->id,
            'employeeId' => 'EMP-' . str_pad((string) $user->id, 3, '0', STR_PAD_LEFT),
            'name' => $user->name,
            'department' => $payroll?->department ?? $user->department ?? ucfirst($user->role),
            'position' => $payroll?->position ?? $user->position ?? 'Staff',
            'baseSalary' => $baseSalary,
            'housingAllowance' => 0.0,
            'transportAllowance' => 0.0,
            'medicalAllowance' => (float) ($payroll?->allowances ?? 0),
            'performanceBonus' => (float) ($payroll?->bonus ?? 0),
            'grossPay' => (float) ($payroll?->gross_pay ?? $baseSalary),
            'netPay' => (float) ($payroll?->net_pay ?? $baseSalary),
            'latestPayrollId' => $payroll?->id,
            'latestPayPeriod' => $payroll?->pay_period_label,
            'status' => $user->employment_status ?? ($user->is_active ? 'active' : 'inactive'),
        ];
    }
}
