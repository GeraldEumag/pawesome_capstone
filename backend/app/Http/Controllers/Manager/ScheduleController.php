<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class ScheduleController extends Controller
{
    /**
     * Roles that may appear on the work schedule. Mirrors the staff list in
     * PayrollComputationService::staffEmployees() — customers are never staff.
     */
    private const STAFF_ROLES = [
        'manager', 'cashier', 'receptionist', 'veterinary',
        'inventory', 'payroll', 'staff', 'groomer',
        'super_receptionist', 'super_admin', 'admin',
    ];

    public function index(Request $request): JsonResponse
    {
        $query = DB::table('work_schedules')
            ->leftJoin('users', 'users.id', '=', 'work_schedules.user_id')
            ->leftJoin('employees', 'employees.id', '=', 'work_schedules.employee_id')
            ->select([
                'work_schedules.id',
                'work_schedules.user_id',
                'work_schedules.employee_id',
                DB::raw("CASE WHEN work_schedules.user_id IS NOT NULL THEN 'user' ELSE 'employee' END as person_type"),
                DB::raw("COALESCE(users.name, TRIM(CONCAT_WS(' ', employees.first_name, employees.middle_name, employees.last_name, employees.suffix))) as employee_name"),
                DB::raw("COALESCE(users.role, COALESCE(employees.position, 'employee')) as employee_role"),
                DB::raw("COALESCE(users.department, employees.department) as employee_department"),
                'work_schedules.day_of_week',
                'work_schedules.shift_start',
                'work_schedules.shift_end',
                'work_schedules.is_off_day',
                'work_schedules.created_at',
                'work_schedules.updated_at',
            ]);

        if ($request->has('department') && $request->department !== 'all') {
            $department = $request->department;
            $query->where(function ($q) use ($department) {
                $q->where('users.department', $department)
                    ->orWhere('employees.department', $department);
            });
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('users.name', 'like', "%{$search}%")
                    ->orWhere('users.role', 'like', "%{$search}%")
                    ->orWhereRaw("TRIM(CONCAT_WS(' ', employees.first_name, employees.middle_name, employees.last_name)) LIKE ?", ["%{$search}%"])
                    ->orWhere('employees.position', 'like', "%{$search}%");
            });
        }

        $records = $query->orderBy('employee_name')->orderBy('work_schedules.day_of_week')->get();

        $employees = $this->schedulableStaff();

        return response()->json([
            'success' => true,
            'data' => $records,
            'employees' => $employees,
        ]);
    }

    /**
     * Staff that may be scheduled: account-holding users with staff roles plus
     * active Employee records that have no user account.
     */
    private function schedulableStaff()
    {
        $users = DB::table('users')
            ->where('is_active', true)
            ->whereIn('role', self::STAFF_ROLES)
            ->select([
                'id',
                'name',
                'role',
                'department',
                DB::raw("'user' as person_type"),
            ])
            ->get();

        $employees = DB::table('employees')
            ->where('is_active', true)
            ->select([
                'id',
                DB::raw("TRIM(CONCAT_WS(' ', first_name, middle_name, last_name, suffix)) as name"),
                DB::raw("COALESCE(position, 'employee') as role"),
                'department',
                DB::raw("'employee' as person_type"),
            ])
            ->get();

        return $users->concat($employees)
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'nullable|exists:users,id|required_without:employee_id',
            'employee_id' => 'nullable|exists:employees,id|required_without:user_id',
            'day_of_week' => 'required|integer|min:0|max:6',
            'shift_start' => 'nullable|date_format:H:i',
            'shift_end' => 'nullable|date_format:H:i',
            'is_off_day' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        if ($request->filled('user_id') && $request->filled('employee_id')) {
            return response()->json([
                'success' => false,
                'message' => 'Specify either user_id or employee_id, not both.',
            ], 422);
        }

        if ($request->filled('user_id')) {
            $isStaff = DB::table('users')
                ->where('id', $request->user_id)
                ->where('is_active', true)
                ->whereIn('role', self::STAFF_ROLES)
                ->exists();

            if (!$isStaff) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only staff members can be scheduled.',
                ], 422);
            }
        }

        if ($request->filled('employee_id')) {
            $isActiveEmployee = DB::table('employees')
                ->where('id', $request->employee_id)
                ->where('is_active', true)
                ->exists();

            if (!$isActiveEmployee) {
                return response()->json([
                    'success' => false,
                    'message' => 'Employee not found or inactive.',
                ], 422);
            }
        }

        $match = ['day_of_week' => $request->day_of_week];
        $values = [
            'shift_start' => $request->shift_start,
            'shift_end' => $request->shift_end,
            'is_off_day' => $request->boolean('is_off_day', false),
            'updated_at' => now(),
            'created_at' => now(),
        ];

        if ($request->filled('employee_id')) {
            $match['employee_id'] = $request->employee_id;
            $values['user_id'] = null;
        } else {
            $match['user_id'] = $request->user_id;
            $values['employee_id'] = null;
        }

        DB::table('work_schedules')->updateOrInsert($match, $values);

        return response()->json([
            'success' => true,
            'message' => 'Schedule saved.',
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        DB::table('work_schedules')->where('id', $id)->delete();
        return response()->json([
            'success' => true,
            'message' => 'Schedule deleted.',
        ]);
    }
}
