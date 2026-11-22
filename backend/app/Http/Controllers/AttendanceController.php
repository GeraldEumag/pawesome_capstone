<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use App\Services\ServiceDurationService;
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

        // Filter by non-account employee
        if ($request->has('employee_id')) {
            $query->forEmployee($request->employee_id);
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
            'date' => 'required|date_format:Y-m-d|before_or_equal:today',
            'check_in' => 'nullable|date_format:H:i',
            'check_out' => 'nullable|date_format:H:i',
            'break_time' => 'nullable|date_format:H:i',
            'status' => 'nullable|in:present,absent,late,early_leave,on_leave',
            'location' => 'nullable|string|max:255',
            'notes' => 'nullable|string|max:1000',
            'salary_rate' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $data = $validator->validated();
        $attendance = DB::transaction(function () use ($data) {
            $user = User::lockForUpdate()->findOrFail($data['user_id']);
            if (!$user->is_active || in_array($user->employment_status, ['resigned', 'terminated'], true)) {
                return null;
            }

            if (Attendance::where('user_id', $user->id)->whereDate('date', $data['date'])->exists()) {
                return null;
            }

            // Payroll-period lock: manual entries cannot be created inside a
            // period that is already pending/approved/paid (same rule as
            // attendance corrections).
            $date   = \Carbon\Carbon::parse($data['date']);
            $period = $date->day <= 15
                ? [$date->format('Y-m') . '-01', $date->format('Y-m') . '-15']
                : [$date->format('Y-m') . '-16', $date->endOfMonth()->toDateString()];
            $locked = DB::table('payrolls')
                ->where('user_id', $user->id)
                ->whereDate('pay_period_start', $period[0])
                ->whereDate('pay_period_end', $period[1])
                ->whereIn('status', ['pending', 'approved', 'paid'])
                ->exists();
            if ($locked) {
                return 'period_locked';
            }

            return Attendance::create([
                'user_id' => $user->id,
                'date' => $data['date'],
                'check_in' => $data['check_in'] ?? null,
                'check_out' => $data['check_out'] ?? null,
                'break_time' => $data['break_time'] ?? null,
                'status' => $data['status'] ?? 'present',
                'location' => $data['location'] ?? null,
                'notes' => $data['notes'] ?? null,
                'salary_rate' => $data['salary_rate'] ?? $user->hourly_rate,
                'source' => 'manual',
                'approved_by' => auth()->id(),
                'review_status' => 'reviewed',
            ]);
        });

        if ($attendance === 'period_locked') {
            return response()->json([
                'success' => false,
                'message' => 'This payroll period is approved or released. Manual attendance changes are locked.',
            ], 422);
        }

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance already exists for this date, or the employee is not active.',
            ], 422);
        }

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

        $validator = Validator::make($request->all(), [
            'remarks' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        // Direct edits to punches/status bypass the correction/leave workflows
        // and their review history. This endpoint is intentionally remarks-only.
        $data = $validator->validated();
        if ($request->except(['remarks']) !== []) {
            return response()->json([
                'success' => false,
                'message' => 'Punch and status changes must use the attendance correction or leave workflow.',
            ], 422);
        }
        $attendance->update($data);

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

        return response()->json([
            'success' => false,
            'message' => 'Attendance history cannot be deleted. Submit a correction request to amend a record.',
        ], 422);
    }

    public function today(Request $request): JsonResponse
    {
        $today = ServiceDurationService::storeToday();
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
        $startDate = $request->get('start_date', Carbon::now(ServiceDurationService::STORE_TIMEZONE)->startOfMonth()->toDateString());
        $endDate = $request->get('end_date', Carbon::now(ServiceDurationService::STORE_TIMEZONE)->endOfMonth()->toDateString());

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
        $request->validate(['location' => 'nullable|string|max:255']);
        $userId = auth()->id();
        $today = ServiceDurationService::storeToday();
        $now = Carbon::now(ServiceDurationService::STORE_TIMEZONE)->format('H:i');

        $result = DB::transaction(function () use ($userId, $today, $now, $request) {
            $user = User::lockForUpdate()->findOrFail($userId);
            if (!$user->is_active || in_array($user->employment_status, ['resigned', 'terminated'], true)) {
                return ['error' => 'Inactive employees cannot record attendance.', 'status' => 403];
            }

            $existing = Attendance::where('user_id', $userId)
                ->where('date', $today)
                ->lockForUpdate()
                ->first();

            if ($existing && $existing->check_in) {
                return ['error' => 'Already checked in today.', 'status' => 422];
            }

            $isLate = CompanySchedule::lateMinutes($now) > 0;
            if ($existing) {
                $existing->update([
                    'check_in' => $now,
                    'location' => $request->location,
                    'is_late' => $isLate,
                    'status' => $existing->status === 'on_leave'
                        ? 'on_leave'
                        : ($isLate ? 'late' : 'present'),
                    'source' => 'web',
                ]);
                return ['attendance' => $existing->fresh()];
            }

            return ['attendance' => Attendance::create([
                'user_id' => $userId,
                'date' => $today,
                'check_in' => $now,
                'location' => $request->location,
                'salary_rate' => $user->hourly_rate,
                'status' => $isLate ? 'late' : 'present',
                'is_late' => $isLate,
                'source' => 'web',
                'review_status' => 'pending',
            ])];
        });

        if (isset($result['error'])) {
            return response()->json([
                'success' => false,
                'message' => $result['error'],
            ], $result['status']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Check-in successful.',
            'data' => $result['attendance'],
        ]);
    }

    public function checkOut(Request $request): JsonResponse
    {
        $userId = auth()->id();
        $today = ServiceDurationService::storeToday();
        $now = Carbon::now(ServiceDurationService::STORE_TIMEZONE)->format('H:i');

        $result = DB::transaction(function () use ($userId, $today, $now) {
            $user = User::lockForUpdate()->findOrFail($userId);
            if (!$user->is_active || in_array($user->employment_status, ['resigned', 'terminated'], true)) {
                return ['error' => 'Inactive employees cannot record attendance.', 'status' => 403];
            }

            $attendance = Attendance::where('user_id', $userId)
                ->whereDate('date', $today)
                ->lockForUpdate()
                ->first();

            if ($attendance && $attendance->check_out) {
                return ['error' => 'Already checked out today.', 'status' => 422];
            }

            // A previous-date punch is treated as overnight only when its
            // check-in is later than the configured daytime shift end.
            if (!$attendance || !$attendance->check_in) {
                $yesterday = Carbon::yesterday(ServiceDurationService::STORE_TIMEZONE)->toDateString();
                $overnight = Attendance::where('user_id', $userId)
                    ->whereDate('date', $yesterday)
                    ->whereNull('check_out')
                    ->whereNotNull('check_in')
                    ->lockForUpdate()
                    ->first();
                $checkIn = $overnight?->check_in instanceof Carbon
                    ? $overnight->check_in->format('H:i')
                    : substr((string) ($overnight?->check_in ?? ''), 0, 5);
                if ($overnight && $checkIn >= CompanySchedule::shiftEnd()) {
                    $attendance = $overnight;
                }
            }

            if (!$attendance) {
                return ['error' => 'No check-in record found for today.', 'status' => 404];
            }
            if (!$attendance->check_in) {
                return ['error' => 'Please check in first.', 'status' => 422];
            }

            $attendance->check_out = $now;
            if ($attendance->status !== 'on_leave') {
                // Date-aware undertime: resolves next-day scheduled end for
                // overnight shifts and next-day checkout datetimes, so an
                // overnight punch is not flagged as a full-shift early leave.
                $checkInHhmm = $attendance->check_in instanceof Carbon
                    ? $attendance->check_in->format('H:i')
                    : substr((string) $attendance->check_in, 0, 5);
                $early = CompanySchedule::undertimeMinutesForDate(
                    $attendance->date->toDateString(), $checkInHhmm, $now
                ) > 0;
                $attendance->is_early_leave = $early;
                if ($early) {
                    $attendance->status = 'early_leave';
                } elseif ($attendance->status !== 'late') {
                    $attendance->status = 'present';
                }
            }
            $attendance->save();

            return ['attendance' => $attendance->fresh()];
        });

        if (isset($result['error'])) {
            return response()->json([
                'success' => false,
                'message' => $result['error'],
            ], $result['status']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Check-out successful.',
            'data' => $result['attendance'],
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
        $today = ServiceDurationService::storeToday();

        // Load today's attendance keyed by user_id and employee_id
        $byUser = Attendance::where('date', $today)
            ->whereNotNull('user_id')
            ->get()
            ->keyBy('user_id');

        $byEmployee = Attendance::where('date', $today)
            ->whereNotNull('employee_id')
            ->get()
            ->keyBy('employee_id');

        // Approved leaves covering today (user_id => half_day flag)
        $leaveUsers = DB::table('leave_requests')
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $today)
            ->whereDate('end_date', '>=', $today)
            ->whereNotNull('user_id')
            ->pluck('half_day', 'user_id');

        $staff = User::whereIn('role', [
            'manager', 'cashier', 'receptionist', 'veterinary', 'vet_tech',
            'inventory', 'payroll', 'staff', 'groomer',
            'super_receptionist', 'admin',
        ])->where('is_active', true)->get();

        $result = $staff->map(function (User $user) use ($byUser, $leaveUsers, $today) {
            $rec = $byUser->get($user->id);
            $onLeaveToday = $leaveUsers->has($user->id);
            $halfDayLeave = $onLeaveToday && (int) $leaveUsers->get($user->id) > 0;
            if ($onLeaveToday && !$rec) {
                $status = $halfDayLeave ? 'half_day_leave' : 'on_leave';
            } elseif (!$rec) {
                // If past shift end, mark absent; otherwise not yet
                $shiftEnd = CompanySchedule::shiftEnd();
                $status   = Carbon::now(ServiceDurationService::STORE_TIMEZONE)->format('H:i') > $shiftEnd ? 'absent' : 'not_yet';
            } elseif ($rec->status === 'on_leave') {
                $status = $halfDayLeave ? 'half_day_leave' : 'on_leave';
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
                'half_day_leave' => $result->where('status', 'half_day_leave')->count(),
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

            // check_in / check_out are cast as datetime:H:i — use ->format() not (string) cast
            // to avoid getting the full Carbon datetime string (e.g. "2026-09-29 08:30:00").
            $checkIn  = $a->check_in  ? $a->check_in->format('H:i')  : null;
            $checkOut = $a->check_out ? $a->check_out->format('H:i') : null;

            return [
                'date'           => $a->date instanceof \Carbon\Carbon ? $a->date->toDateString() : $a->date,
                'day_of_week'    => Carbon::parse($a->date)->format('D'),
                'name'           => $person?->name ?? ($a->employee ? $a->employee->first_name . ' ' . $a->employee->last_name : 'Unknown'),
                'employee_no'    => $person?->employee_no,
                'department'     => $person?->department,
                'position'       => $person?->position,
                'check_in'       => $checkIn,
                'check_out'      => $checkOut,
                'total_hours'    => $a->total_hours,
                'overtime_hours' => $a->overtime_hours,
                'status'         => $a->status,
                'is_late'        => (bool) $a->is_late,
                'late_minutes'   => $checkIn ? CompanySchedule::lateMinutesForDate(
                    $a->date instanceof \Carbon\Carbon ? $a->date->toDateString() : (string) $a->date,
                    $checkIn
                ) : 0,
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
