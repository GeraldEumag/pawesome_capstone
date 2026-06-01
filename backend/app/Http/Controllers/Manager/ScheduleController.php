<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class ScheduleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = DB::table('work_schedules')
            ->join('users', 'users.id', '=', 'work_schedules.user_id')
            ->select([
                'work_schedules.id',
                'work_schedules.user_id',
                'users.name as employee_name',
                'users.role as employee_role',
                'users.department as employee_department',
                'work_schedules.day_of_week',
                'work_schedules.shift_start',
                'work_schedules.shift_end',
                'work_schedules.is_off_day',
                'work_schedules.created_at',
                'work_schedules.updated_at',
            ]);

        if ($request->has('department') && $request->department !== 'all') {
            $query->where('users.department', $request->department);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('users.name', 'like', "%{$search}%")
                  ->orWhere('users.role', 'like', "%{$search}%");
            });
        }

        $records = $query->orderBy('users.name')->orderBy('work_schedules.day_of_week')->get();

        $employees = DB::table('users')
            ->where('is_active', true)
            ->select(['id', 'name', 'role', 'department'])
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $records,
            'employees' => $employees,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
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

        DB::table('work_schedules')
            ->updateOrInsert(
                ['user_id' => $request->user_id, 'day_of_week' => $request->day_of_week],
                [
                    'shift_start' => $request->shift_start,
                    'shift_end' => $request->shift_end,
                    'is_off_day' => $request->boolean('is_off_day', false),
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );

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
