<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\LeaveBalance;
use App\Support\CompanySchedule;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class LeaveController extends Controller
{
    private const LEAVE_TYPES = [
        'sick_leave', 'vacation_leave', 'emergency_leave',
        'maternity_leave', 'paternity_leave', 'bereavement_leave',
        'service_incentive_leave', 'solo_parent_leave',
        'magna_carta_leave', 'special_leave_benefit', 'unpaid_leave',
    ];

    public function index(Request $request): JsonResponse
    {
        $query = DB::table('leave_requests')
            ->join('users', 'users.id', '=', 'leave_requests.user_id')
            ->select([
                'leave_requests.id',
                'leave_requests.user_id',
                'users.name as employee_name',
                'users.role as employee_role',
                'leave_requests.type',
                'leave_requests.start_date',
                'leave_requests.end_date',
                'leave_requests.reason',
                'leave_requests.half_day',
                'leave_requests.days_counted',
                'leave_requests.status',
                'leave_requests.manager_remarks',
                'leave_requests.reviewed_by',
                'leave_requests.reviewed_at',
                'leave_requests.created_at',
                'leave_requests.updated_at',
            ]);

        if ($request->has('status') && $request->status !== 'all') {
            $query->where('leave_requests.status', $request->status);
        }

        if ($request->has('type') && $request->type !== 'all') {
            $query->where('leave_requests.type', $request->type);
        }

        if ($request->has('month')) {
            $query->whereMonth('leave_requests.start_date', $request->month);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('users.name', 'like', "%{$search}%")
                  ->orWhere('leave_requests.reason', 'like', "%{$search}%");
            });
        }

        $records = $query->orderByDesc('leave_requests.created_at')->get();

        // Attach leave balance remaining for each pending record
        $records = $records->map(function ($r) {
            $r->balance_remaining = null;
            if ($r->status === 'pending' && $r->type !== 'unpaid_leave') {
                $start = Carbon::parse($r->start_date);
                $b = LeaveBalance::where('user_id', $r->user_id)
                    ->where('leave_type', $r->type)
                    ->where('year', $start->year)
                    ->first();
                $r->balance_remaining = $b ? (float) $b->remaining_days : null;
            }
            return $r;
        });

        $stats = [
            'pending'          => $records->where('status', 'pending')->count(),
            'approved'         => $records->where('status', 'approved')->count(),
            'rejected'         => $records->where('status', 'rejected')->count(),
            'on_leave_today'   => $records->where('status', 'approved')
                ->filter(fn ($r) => $r->start_date <= Carbon::today()->toDateString() && $r->end_date >= Carbon::today()->toDateString())
                ->count(),
        ];

        return response()->json([
            'success' => true,
            'data'    => $records,
            'stats'   => $stats,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'user_id'    => 'required|exists:users,id',
            'type'       => 'required|in:' . implode(',', self::LEAVE_TYPES),
            'start_date' => 'required|date',
            'end_date'   => 'required|date|after_or_equal:start_date',
            'reason'     => 'nullable|string|max:500',
            'half_day'   => 'nullable|integer|in:0,1,2',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        // Count working days
        $daysCounted = $this->countWorkingDays(
            $request->start_date,
            $request->end_date,
            (int) ($request->half_day ?? 0)
        );

        $id = DB::table('leave_requests')->insertGetId([
            'user_id'      => $request->user_id,
            'type'         => $request->type,
            'start_date'   => $request->start_date,
            'end_date'     => $request->end_date,
            'reason'       => $request->reason,
            'half_day'     => $request->half_day ?? 0,
            'days_counted' => $daysCounted,
            'status'       => 'pending',
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Leave request created.',
            'data'    => ['id' => $id, 'days_counted' => $daysCounted],
        ]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $record = DB::table('leave_requests')->where('id', $id)->first();

        if (!$record) {
            return response()->json(['success' => false, 'message' => 'Leave request not found.'], 404);
        }

        if ($record->status !== 'pending') {
            return response()->json(['success' => false, 'message' => 'Leave is not pending.'], 422);
        }

        $daysCounted = (float) ($record->days_counted ?? $this->countWorkingDays($record->start_date, $record->end_date));
        $start = Carbon::parse($record->start_date);

        // Deduct from leave balance (skip for unpaid_leave)
        if ($record->type !== 'unpaid_leave' && $record->user_id) {
            $balance = LeaveBalance::where('user_id', $record->user_id)
                ->where('leave_type', $record->type)
                ->where('year', $start->year)
                ->first();

            if ($balance) {
                $balance->used_days      = min($balance->total_days, (float) $balance->used_days + $daysCounted);
                $balance->remaining_days = max(0, (float) $balance->remaining_days - $daysCounted);
                $balance->save();
            }
        }

        // Auto-mark attendance rows as on_leave for each working day in the range
        if ($record->user_id) {
            $this->markAttendanceOnLeave($record->user_id, $record->start_date, $record->end_date);
        }

        DB::table('leave_requests')->where('id', $id)->update([
            'status'          => 'approved',
            'manager_remarks' => $request->input('remarks', ''),
            'reviewed_by'     => Auth::id(),
            'reviewed_at'     => now(),
            'updated_at'      => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Leave request approved.',
            'days_counted' => $daysCounted,
        ]);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'remarks' => 'required|string|max:500',
        ]);

        $record = DB::table('leave_requests')->where('id', $id)->first();

        if (!$record) {
            return response()->json(['success' => false, 'message' => 'Leave request not found.'], 404);
        }

        if ($record->status !== 'pending') {
            return response()->json(['success' => false, 'message' => 'Leave is not pending.'], 422);
        }

        DB::table('leave_requests')->where('id', $id)->update([
            'status'          => 'rejected',
            'manager_remarks' => $validated['remarks'],
            'reviewed_by'     => Auth::id(),
            'reviewed_at'     => now(),
            'updated_at'      => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Leave request rejected.',
        ]);
    }

    /** Restore leave balance and revert on_leave attendance rows. */
    public function cancel(int $id): JsonResponse
    {
        $record = DB::table('leave_requests')->where('id', $id)->first();

        if (!$record) {
            return response()->json(['success' => false, 'message' => 'Leave request not found.'], 404);
        }

        if ($record->status === 'approved' && $record->type !== 'unpaid_leave' && $record->user_id) {
            $daysCounted = (float) ($record->days_counted ?? 0);
            $start = Carbon::parse($record->start_date);

            $balance = LeaveBalance::where('user_id', $record->user_id)
                ->where('leave_type', $record->type)
                ->where('year', $start->year)
                ->first();

            if ($balance) {
                $balance->used_days      = max(0, (float) $balance->used_days - $daysCounted);
                $balance->remaining_days = min($balance->total_days, (float) $balance->remaining_days + $daysCounted);
                $balance->save();
            }

            // Revert on_leave attendance rows to absent
            if ($record->user_id) {
                $this->revertAttendanceOnLeave($record->user_id, $record->start_date, $record->end_date);
            }
        }

        DB::table('leave_requests')->where('id', $id)->update([
            'status'     => 'cancelled',
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Leave cancelled and balance restored.']);
    }

    public function calendar(Request $request): JsonResponse
    {
        $year  = (int) $request->get('year', Carbon::now()->year);
        $month = (int) $request->get('month', Carbon::now()->month);

        $records = DB::table('leave_requests')
            ->join('users', 'users.id', '=', 'leave_requests.user_id')
            ->where('leave_requests.status', 'approved')
            ->whereYear('leave_requests.start_date', $year)
            ->whereMonth('leave_requests.start_date', $month)
            ->select([
                'leave_requests.id',
                'leave_requests.user_id',
                'users.name as employee_name',
                'leave_requests.type',
                'leave_requests.start_date',
                'leave_requests.end_date',
                'leave_requests.days_counted',
            ])
            ->get();

        return response()->json(['success' => true, 'data' => $records]);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function countWorkingDays(string $startDate, string $endDate, int $halfDay = 0): float
    {
        $start = Carbon::parse($startDate);
        $end   = Carbon::parse($endDate);
        $days  = 0.0;
        for ($d = $start->copy(); $d->lte($end); $d->addDay()) {
            if (CompanySchedule::isWorkday($d)) {
                $days += 1.0;
            }
        }
        if ($halfDay > 0 && $days > 0) {
            $days = max($days - 0.5, 0.5);
        }
        return $days;
    }

    /** Create or update attendance rows as on_leave for each workday in range. */
    private function markAttendanceOnLeave(int $userId, string $startDate, string $endDate): void
    {
        $start = Carbon::parse($startDate);
        $end   = Carbon::parse($endDate);
        for ($d = $start->copy(); $d->lte($end); $d->addDay()) {
            if (!CompanySchedule::isWorkday($d)) {
                continue;
            }
            $dateStr = $d->toDateString();
            $existing = Attendance::where('user_id', $userId)->whereDate('date', $dateStr)->first();
            if ($existing) {
                if (!in_array($existing->status, ['present', 'late', 'early_leave'], true)) {
                    $existing->update(['status' => 'on_leave']);
                }
            } else {
                Attendance::create([
                    'user_id' => $userId,
                    'date'    => $dateStr,
                    'status'  => 'on_leave',
                ]);
            }
        }
    }

    /** Revert on_leave attendance rows back to absent in a leave date range. */
    private function revertAttendanceOnLeave(int $userId, string $startDate, string $endDate): void
    {
        Attendance::where('user_id', $userId)
            ->whereBetween('date', [$startDate, $endDate])
            ->where('status', 'on_leave')
            ->whereNull('check_in') // only records with no actual punch
            ->update(['status' => 'absent']);
    }
}
