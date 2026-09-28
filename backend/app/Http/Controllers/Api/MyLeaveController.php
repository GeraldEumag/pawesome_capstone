<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\LeaveBalance;
use App\Support\CompanySchedule;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MyLeaveController extends Controller
{
    private const LEAVE_TYPES = [
        'sick_leave', 'vacation_leave', 'emergency_leave',
        'maternity_leave', 'paternity_leave', 'bereavement_leave',
        'service_incentive_leave', 'solo_parent_leave',
        'magna_carta_leave', 'special_leave_benefit', 'unpaid_leave',
    ];

    /** GET /api/my-leaves */
    public function index(Request $request): JsonResponse
    {
        $user = auth()->user();
        $leaves = DB::table('leave_requests')
            ->where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->paginate(30);

        return response()->json(['success' => true, 'data' => $leaves]);
    }

    /** GET /api/my-leaves/balance */
    public function balance(Request $request): JsonResponse
    {
        $user = auth()->user();
        $year = (int) $request->query('year', now()->year);

        $balances = LeaveBalance::where('user_id', $user->id)
            ->where('year', $year)
            ->get()
            ->keyBy('leave_type');

        // Ensure all types are present (show 0 for unseeded ones)
        $result = [];
        foreach (LeaveBalance::defaults() as $type => $days) {
            $b = $balances->get($type);
            $result[] = [
                'leave_type'    => $type,
                'total_days'    => $b ? (float) $b->total_days : $days,
                'used_days'     => $b ? (float) $b->used_days : 0.0,
                'remaining_days' => $b ? (float) $b->remaining_days : $days,
            ];
        }

        return response()->json(['success' => true, 'data' => $result]);
    }

    /** POST /api/my-leaves */
    public function store(Request $request): JsonResponse
    {
        $user = auth()->user();

        $data = $request->validate([
            'type'       => 'required|in:' . implode(',', self::LEAVE_TYPES),
            'start_date' => 'required|date|after_or_equal:today',
            'end_date'   => 'required|date|after_or_equal:start_date',
            'reason'     => 'required|string|max:500',
            'half_day'   => 'nullable|integer|in:0,1,2',
        ]);

        // Count working days in the leave range
        $start     = Carbon::parse($data['start_date']);
        $end       = Carbon::parse($data['end_date']);
        $daysCounted = 0.0;
        for ($d = $start->copy(); $d->lte($end); $d->addDay()) {
            if (CompanySchedule::isWorkday($d)) {
                $daysCounted += 1.0;
            }
        }
        if (($data['half_day'] ?? 0) > 0 && $daysCounted > 0) {
            $daysCounted = max($daysCounted - 0.5, 0.5);
        }

        // Balance check (skip for unpaid_leave)
        if ($data['type'] !== 'unpaid_leave') {
            $balance = LeaveBalance::where('user_id', $user->id)
                ->where('leave_type', $data['type'])
                ->where('year', $start->year)
                ->first();

            if (!$balance || (float) $balance->remaining_days < $daysCounted) {
                return response()->json([
                    'message' => 'Insufficient leave balance.',
                    'remaining' => $balance ? (float) $balance->remaining_days : 0,
                    'requested' => $daysCounted,
                ], 422);
            }
        }

        $leave = DB::table('leave_requests')->insertGetId([
            'user_id'     => $user->id,
            'type'        => $data['type'],
            'start_date'  => $data['start_date'],
            'end_date'    => $data['end_date'],
            'reason'      => $data['reason'],
            'half_day'    => $data['half_day'] ?? 0,
            'days_counted' => $daysCounted,
            'status'      => 'pending',
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        return response()->json([
            'success'     => true,
            'message'     => 'Leave request filed.',
            'days_counted' => $daysCounted,
            'id'          => $leave,
        ], 201);
    }

    /** DELETE /api/my-leaves/{id} — cancel pending leave */
    public function cancel(int $id): JsonResponse
    {
        $user  = auth()->user();
        $leave = DB::table('leave_requests')
            ->where('id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (!$leave) {
            return response()->json(['message' => 'Leave not found.'], 404);
        }

        if ($leave->status !== 'pending') {
            return response()->json(['message' => 'Only pending leaves can be cancelled.'], 422);
        }

        DB::table('leave_requests')->where('id', $id)->update([
            'status'     => 'cancelled',
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Leave cancelled.']);
    }
}
