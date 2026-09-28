<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use App\Support\CompanySchedule;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class AttendanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Attendance::with(['user', 'employee', 'approver']);

        // Filter by date
        if ($request->has('date')) {
            $query->forDate($request->date);
        }

        // Filter by user
        if ($request->has('user_id')) {
            $query->forUser($request->user_id);
        }

        // Filter by date range
        if ($request->has('start_date') && $request->has('end_date')) {
            $query->forPeriod($request->start_date, $request->end_date);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by department (user or employee relationship)
        if ($request->has('department')) {
            $query->where(function ($outer) use ($request) {
                $outer->whereHas('user', function ($q) use ($request) {
                    $q->where('department', $request->department);
                })->orWhereHas('employee', function ($q) use ($request) {
                    $q->where('department', $request->department);
                });
            });
        }

        // Search by name or email
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($outer) use ($search) {
                $outer->whereHas('user', function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('email', 'like', "%{$search}%");
                })->orWhereHas('employee', function ($q) use ($search) {
                    $q->where('first_name', 'like', "%{$search}%")
                      ->orWhere('last_name', 'like', "%{$search}%")
                      ->orWhere('employee_no', 'like', "%{$search}%");
                });
            });
        }

        $attendance = $query->orderBy('date', 'desc')->orderBy('check_in', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $attendance,
            'count' => $attendance->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'date' => 'required|date',
            'check_in' => 'nullable|date_format:H:i',
            'check_out' => 'nullable|date_format:H:i',
            'break_time' => 'nullable|date_format:H:i',
            'status' => 'nullable|in:present,absent,late,early_leave,on_leave',
            'location' => 'nullable|string',
            'notes' => 'nullable|string',
            'salary_rate' => 'nullable|numeric',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        // Check for duplicate attendance record
        $existing = Attendance::where('user_id', $request->user_id)
            ->where('date', $request->date)
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record already exists for this user on this date.',
            ], 422);
        }

        $user = User::find($request->user_id);

        $attendanceData = $request->all();
        $attendanceData['salary_rate'] = $request->salary_rate ?? $user->hourly_rate ?? ($user->base_salary / 160);
        $attendanceData['approved_by'] = auth()->id();

        $attendance = Attendance::create($attendanceData);

        return response()->json([
            'success' => true,
            'message' => 'Attendance record created successfully.',
            'data' => $attendance->load(['user', 'approver']),
        ], 201);
    }

    public function show($id): JsonResponse
    {
        $attendance = Attendance::with(['user', 'approver'])->find($id);

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $attendance,
        ]);
    }

    public function update(Request $request, $id): JsonResponse
    {
        $attendance = Attendance::find($id);

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record not found.',
            ], 404);
        }

        // Payroll period lock: block edits when payroll is approved/paid for this period
        if ($attendance->date && $attendance->user_id) {
            $date   = Carbon::parse($attendance->date);
            $start  = $date->day <= 15
                ? $date->format('Y-m') . '-01'
                : $date->format('Y-m') . '-16';
            $end    = $date->day <= 15
                ? $date->format('Y-m') . '-15'
                : $date->copy()->endOfMonth()->toDateString();

            $locked = DB::table('payrolls')
                ->where('user_id', $attendance->user_id)
                ->whereDate('pay_period_start', $start)
                ->whereDate('pay_period_end', $end)
                ->whereIn('status', ['approved', 'paid'])
                ->exists();

            if ($locked) {
                return response()->json([
                    'success' => false,
                    'message' => 'This payroll period is locked. The employee must file an attendance correction request instead.',
                    'error'   => 'period_locked',
                ], 403);
            }
        }

        $validator = Validator::make($request->all(), [
            'check_in'     => 'nullable|date_format:H:i',
            'check_out'    => 'nullable|date_format:H:i',
            'break_time'   => 'nullable|date_format:H:i',
            'status'       => 'nullable|in:present,absent,late,early_leave,on_leave',
            'location'     => 'nullable|string',
            'notes'        => 'nullable|string',
            'remarks'      => 'nullable|string',
            'review_status' => 'nullable|in:pending,reviewed,rejected',
            'salary_rate'  => 'nullable|numeric',
            'source'       => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        $attendance->update($request->all());

        return response()->json([
            'success' => true,
            'message' => 'Attendance record updated successfully.',
            'data'    => $attendance->fresh()->load(['user', 'approver']),
        ]);
    }

    public function destroy($id): JsonResponse
    {
        $attendance = Attendance::find($id);

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record not found.',
            ], 404);
        }

        $attendance->delete();

        return response()->json([
            'success' => true,
            'message' => 'Attendance record deleted successfully.',
        ]);
    }

    public function today(Request $request): JsonResponse
    {
        $today = Carbon::today()->toDateString();
        $query = Attendance::with('user')->forDate($today);

        if ($request->has('department')) {
            $query->whereHas('user', function ($q) use ($request) {
                $q->where('department', $request->department);
            });
        }

        $attendance = $query->get();

        // Calculate statistics
        $stats = [
            'total' => $attendance->count(),
            'present' => $attendance->whereIn('status', ['present', 'late', 'early_leave'])->count(),
            'absent' => $attendance->where('status', 'absent')->count(),
            'late' => $attendance->where('is_late', true)->count(),
            'early_leave' => $attendance->where('is_early_leave', true)->count(),
            'on_leave' => $attendance->where('status', 'on_leave')->count(),
        ];

        return response()->json([
            'success' => true,
            'date' => $today,
            'statistics' => $stats,
            'data' => $attendance,
        ]);
    }

    public function statistics(Request $request): JsonResponse
    {
        $startDate = $request->get('start_date', Carbon::now()->startOfMonth()->toDateString());
        $endDate = $request->get('end_date', Carbon::now()->endOfMonth()->toDateString());

        $query = Attendance::forPeriod($startDate, $endDate);

        if ($request->has('user_id')) {
            $query->forUser($request->user_id);
        }

        if ($request->has('department')) {
            $query->whereHas('user', function ($q) use ($request) {
                $q->where('department', $request->department);
            });
        }

        $attendance = $query->get();

        $stats = [
            'period_start' => $startDate,
            'period_end' => $endDate,
            'total_records' => $attendance->count(),
            'present_days' => $attendance->whereIn('status', ['present', 'late', 'early_leave'])->count(),
            'absent_days' => $attendance->where('status', 'absent')->count(),
            'late_count' => $attendance->where('is_late', true)->count(),
            'early_leave_count' => $attendance->where('is_early_leave', true)->count(),
            'total_hours' => $attendance->sum('total_hours'),
            'overtime_hours' => $attendance->sum('overtime_hours'),
            'total_earnings' => $attendance->sum('daily_earnings'),
        ];

        return response()->json([
            'success' => true,
            'statistics' => $stats,
        ]);
    }

    public function checkIn(Request $request): JsonResponse
    {
        $userId = auth()->id();
        $today = Carbon::today()->toDateString();
        $now = Carbon::now()->format('H:i');

        // Lock the user row inside the same transaction so the check-then-create
        // cannot race a concurrent check-in for the same user into a duplicate.
        $user = null;
        $attendance = DB::transaction(function () use ($userId, $today, $now, $request, &$user) {
            $user = User::lockForUpdate()->find($userId);

            $existing = Attendance::where('user_id', $userId)
                ->where('date', $today)
                ->lockForUpdate()
                ->first();

            if ($existing && $existing->check_in) {
                return null;
            }

            if ($existing) {
                $existing->update([
                    'check_in' => $now,
                    'location' => $request->location,
                ]);
                return $existing;
            }

            return Attendance::create([
                'user_id' => $userId,
                'date' => $today,
                'check_in' => $now,
                'location' => $request->location,
                'salary_rate' => $user->hourly_rate ?? ($user->base_salary / 160),
                'approved_by' => $userId,
            ]);
        });

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Already checked in today.',
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Check-in successful.',
            'data' => $attendance,
        ]);
    }

    public function checkOut(Request $request): JsonResponse
    {
        $userId = auth()->id();
        $today = Carbon::today()->toDateString();
        $now = Carbon::now()->format('H:i');

        $attendance = Attendance::where('user_id', $userId)
            ->where('date', $today)
            ->first();

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'No check-in record found for today.',
            ], 404);
        }

        if (!$attendance->check_in) {
            return response()->json([
                'success' => false,
                'message' => 'Please check in first.',
            ], 422);
        }

        if ($attendance->check_out) {
            return response()->json([
                'success' => false,
                'message' => 'Already checked out today.',
            ], 422);
        }

        $attendance->update([
            'check_out' => $now,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Check-out successful.',
            'data' => $attendance->fresh(),
        ]);
    }

    public function export(Request $request): JsonResponse
    {
        $format = $request->get('format', 'json');
        
        $query = Attendance::with('user');

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->forPeriod($request->start_date, $request->end_date);
        }

        if ($request->has('user_id')) {
            $query->forUser($request->user_id);
        }

        $data = $query->get();

        if ($format === 'excel' || $format === 'csv') {
            // For now, return JSON - in production, use a package like maatwebsite/excel
            return response()->json([
                'success' => true,
                'message' => 'Export data prepared.',
                'format' => $format,
                'data' => $data,
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    /**
     * GET /manager/attendance/today-status
     *
     * Real-time "who's in today" board for all active staff.
     * Status values: checked_in | late | checked_out | on_leave | absent | not_yet
     */
    public function todayStatus(): JsonResponse
    {
        $today = Carbon::today()->toDateString();

        // Load today's attendance keyed by user_id and employee_id
        $byUser = Attendance::where('date', $today)
            ->whereNotNull('user_id')
            ->get()
            ->keyBy('user_id');

        $byEmployee = Attendance::where('date', $today)
            ->whereNotNull('employee_id')
            ->get()
            ->keyBy('employee_id');

        // Approved leaves covering today
        $leaveUsers = DB::table('leave_requests')
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $today)
            ->whereDate('end_date', '>=', $today)
            ->whereNotNull('user_id')
            ->pluck('user_id')
            ->flip();

        $staff = User::whereIn('role', [
            'manager', 'cashier', 'receptionist', 'veterinary',
            'inventory', 'payroll', 'staff', 'groomer',
            'super_receptionist', 'super_admin', 'admin',
        ])->where('is_active', true)->get();

        $result = $staff->map(function (User $user) use ($byUser, $leaveUsers, $today) {
            $rec = $byUser->get($user->id);
            if ($leaveUsers->has($user->id) && !$rec) {
                $status = 'on_leave';
            } elseif (!$rec) {
                // If past shift end, mark absent; otherwise not yet
                $shiftEnd = CompanySchedule::shiftEnd();
                $status   = Carbon::now()->format('H:i') > $shiftEnd ? 'absent' : 'not_yet';
            } elseif ($rec->status === 'on_leave') {
                $status = 'on_leave';
            } elseif ($rec->check_out) {
                $status = 'checked_out';
            } elseif ($rec->is_late || $rec->status === 'late') {
                $status = 'late';
            } else {
                $status = 'checked_in';
            }

            return [
                'id'           => $user->id,
                'name'         => $user->name,
                'employee_no'  => $user->employee_no,
                'role'         => $user->role,
                'department'   => $user->department,
                'status'       => $status,
                'check_in'     => $rec?->check_in ? substr((string) $rec->check_in, 0, 5) : null,
                'check_out'    => $rec?->check_out ? substr((string) $rec->check_out, 0, 5) : null,
                'total_hours'  => $rec?->total_hours,
                'is_late'      => (bool) ($rec?->is_late ?? false),
            ];
        });

        return response()->json([
            'success'    => true,
            'date'       => $today,
            'shift_start' => CompanySchedule::shiftStart(),
            'shift_end'  => CompanySchedule::shiftEnd(),
            'data'       => $result->values(),
            'summary'    => [
                'checked_in'  => $result->where('status', 'checked_in')->count(),
                'late'        => $result->where('status', 'late')->count(),
                'checked_out' => $result->where('status', 'checked_out')->count(),
                'on_leave'    => $result->where('status', 'on_leave')->count(),
                'absent'      => $result->where('status', 'absent')->count(),
                'not_yet'     => $result->where('status', 'not_yet')->count(),
                'total'       => $result->count(),
            ],
        ]);
    }

    /**
     * GET /manager/reports/dtr?user_id=5&start_date=2026-09-01&end_date=2026-09-30
     *
     * Per-employee Daily Time Record (DOLE requirement).
     */
    public function dtrReport(Request $request): JsonResponse
    {
        $request->validate([
            'user_id'     => 'nullable|exists:users,id',
            'employee_id' => 'nullable|exists:employees,id',
            'start_date'  => 'required|date',
            'end_date'    => 'required|date|after_or_equal:start_date',
        ]);

        $query = Attendance::with(['user:id,name,employee_no,department,position', 'employee:id,first_name,last_name,employee_no,department,position'])
            ->whereBetween('date', [$request->start_date, $request->end_date])
            ->orderBy('date');

        if ($request->user_id) {
            $query->where('user_id', $request->user_id);
        } elseif ($request->employee_id) {
            $query->where('employee_id', $request->employee_id);
        }

        $records = $query->get()->map(function ($a) {
            $person = $a->user ?? $a->employee;
            return [
                'date'         => $a->date instanceof \Carbon\Carbon ? $a->date->toDateString() : $a->date,
                'day_of_week'  => Carbon::parse($a->date)->format('D'),
                'name'         => $person?->name ?? ($a->employee ? $a->employee->first_name . ' ' . $a->employee->last_name : 'Unknown'),
                'employee_no'  => $person?->employee_no,
                'department'   => $person?->department,
                'position'     => $person?->position,
                'check_in'     => $a->check_in ? substr((string) $a->check_in, 0, 5) : null,
                'check_out'    => $a->check_out ? substr((string) $a->check_out, 0, 5) : null,
                'total_hours'  => $a->total_hours,
                'overtime_hours' => $a->overtime_hours,
                'status'       => $a->status,
                'is_late'      => (bool) $a->is_late,
                'late_minutes' => $a->check_in ? CompanySchedule::lateMinutes(substr((string) $a->check_in, 0, 5)) : 0,
            ];
        });

        return response()->json([
            'success'    => true,
            'start_date' => $request->start_date,
            'end_date'   => $request->end_date,
            'data'       => $records,
        ]);
    }
}
