<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EmployeeController extends Controller
{
    /**
     * GET /manager/employees — list non-account staff records.
     * Filters: search, department, status (active|inactive|all), page/per_page.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Employee::query()->with('user:id,name,email,role');

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('employee_no', 'like', "%{$search}%")
                    ->orWhere('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('position', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if (($dept = $request->query('department')) && $dept !== 'all') {
            $query->where('department', $dept);
        }

        $status = $request->query('status', 'all');
        if ($status === 'active') {
            $query->where('is_active', true);
        } elseif ($status === 'inactive') {
            $query->where('is_active', false);
        }

        $perPage = min((int) $request->query('per_page', 50), 200);
        $paginated = $query->orderBy('last_name')->orderBy('first_name')->paginate($perPage);

        $rows = collect($paginated->items())->map(fn ($e) => $this->row($e));

        return response()->json([
            'success' => true,
            'data' => $rows,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
            'summary' => [
                'total' => Employee::count(),
                'active' => Employee::where('is_active', true)->count(),
                'departments' => Employee::whereNotNull('department')->distinct()->orderBy('department')->pluck('department'),
            ],
        ]);
    }

    public function show(Employee $employee): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->row($employee->load('user:id,name,email,role')),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateData($request);
        $validated['employee_no'] = Employee::nextEmployeeNo();
        $validated['is_active'] = $validated['is_active'] ?? true;

        $employee = Employee::create($validated);

        return response()->json([
            'success' => true,
            'message' => "Employee {$employee->name} ({$employee->employee_no}) created.",
            'data' => $this->row($employee),
        ], 201);
    }

    public function update(Request $request, Employee $employee): JsonResponse
    {
        $validated = $this->validateData($request, $employee->id);
        $employee->update($validated);

        return response()->json([
            'success' => true,
            'message' => "Employee {$employee->name} updated.",
            'data' => $this->row($employee->fresh()),
        ]);
    }

    /** Soft-disable — preserves attendance/payroll history. */
    public function destroy(Employee $employee): JsonResponse
    {
        $employee->update(['is_active' => false]);

        return response()->json([
            'success' => true,
            'message' => "Employee {$employee->name} deactivated.",
        ]);
    }

    private function validateData(Request $request, ?int $ignoreId = null): array
    {
        return $request->validate([
            'first_name' => 'required|string|max:100',
            'middle_name' => 'nullable|string|max:100',
            'last_name' => 'required|string|max:100',
            'suffix' => 'nullable|string|max:20',
            'birthdate' => 'nullable|date',
            'gender' => 'nullable|string|max:20',
            'civil_status' => 'nullable|string|max:30',
            'phone' => 'nullable|string|max:30',
            'email' => [
                'nullable', 'email', 'max:255',
                Rule::unique('employees', 'email')->ignore($ignoreId),
            ],
            'address' => 'nullable|string|max:255',
            'emergency_contact_name' => 'nullable|string|max:150',
            'emergency_contact_phone' => 'nullable|string|max:30',
            'position' => 'nullable|string|max:100',
            'department' => 'nullable|string|max:100',
            'hire_date' => 'nullable|date',
            'employment_status' => 'nullable|string|max:30',
            'employment_type' => 'nullable|string|max:30',
            'is_active' => 'nullable|boolean',
            'base_salary' => 'nullable|numeric|min:0',
            'hourly_rate' => 'nullable|numeric|min:0',
            'sss_no' => 'nullable|string|max:20',
            'philhealth_no' => 'nullable|string|max:20',
            'pagibig_no' => 'nullable|string|max:20',
            'tin_no' => 'nullable|string|max:20',
            'user_id' => 'nullable|exists:users,id',
        ]);
    }

    private function row(Employee $e): array
    {
        return [
            'id' => $e->id,
            'employee_no' => $e->employee_no,
            'person_type' => 'employee',
            'name' => $e->name,
            'first_name' => $e->first_name,
            'middle_name' => $e->middle_name,
            'last_name' => $e->last_name,
            'suffix' => $e->suffix,
            'birthdate' => $e->birthdate?->toDateString(),
            'gender' => $e->gender,
            'civil_status' => $e->civil_status,
            'phone' => $e->phone,
            'email' => $e->email,
            'address' => $e->address,
            'emergency_contact_name' => $e->emergency_contact_name,
            'emergency_contact_phone' => $e->emergency_contact_phone,
            'position' => $e->position,
            'department' => $e->department,
            'hire_date' => $e->hire_date?->toDateString(),
            'employment_status' => $e->employment_status,
            'employment_type' => $e->employment_type,
            'is_active' => (bool) $e->is_active,
            'base_salary' => (float) $e->base_salary,
            'hourly_rate' => $e->hourly_rate !== null ? (float) $e->hourly_rate : null,
            'sss_no' => $e->sss_no,
            'philhealth_no' => $e->philhealth_no,
            'pagibig_no' => $e->pagibig_no,
            'tin_no' => $e->tin_no,
            'user_id' => $e->user_id,
            'linked_account' => $e->user ? [
                'id' => $e->user->id,
                'name' => $e->user->name,
                'email' => $e->user->email,
                'role' => $e->user->role,
            ] : null,
            'created_at' => $e->created_at?->toDateString(),
        ];
    }
}
