<?php

namespace App\Http\Controllers\Api;

use App\Services\ServiceDurationService;
use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\AttendanceCorrection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MyAttendanceCorrectionController extends Controller
{
    /** GET /api/my-attendance/corrections */
    public function index(Request $request): JsonResponse
    {
        $user = auth()->user();
        $corrections = AttendanceCorrection::where('user_id', $user->id)
            ->with('reviewer:id,name')
            ->orderBy('created_at', 'desc')
            ->paginate(30);

        return response()->json(['success' => true, 'data' => $corrections]);
    }

    /** GET /api/my-attendance — own attendance for a period */
    public function attendance(Request $request): JsonResponse
    {
        $user      = auth()->user();
        $today     = now()->toDateString();
        $startDate = $request->query('start_date', now()->startOfMonth()->toDateString());
        $endDate   = $request->query('end_date', $today);

        $records = Attendance::where('user_id', $user->id)
            ->whereBetween('date', [$startDate, $endDate])
            ->orderBy('date', 'desc')
            ->get();

        return response()->json(['success' => true, 'today' => $today, 'data' => $records]);
    }

    /** POST /api/my-attendance/corrections */
    public function store(Request $request): JsonResponse
    {
        $user = auth()->user();

        $data = $request->validate([
            'date'                  => 'required|date|before_or_equal:' . ServiceDurationService::storeToday(),
            'requested_check_in'    => 'nullable|date_format:H:i',
            'requested_check_out'   => 'nullable|date_format:H:i',
            'reason'                => 'required|string|max:500',
        ]);

        if (empty($data['requested_check_in']) && empty($data['requested_check_out'])) {
            return response()->json(['message' => 'At least one corrected time is required.'], 422);
        }

        // Check if period is locked (payroll paid for this date's period)
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
            return response()->json([
                'success' => false,
                'message' => 'This payroll period is approved or released. Use the authorized historical correction process.',
            ], 422);
        }

        $result = DB::transaction(function () use ($user, $data) {
            \App\Models\User::lockForUpdate()->findOrFail($user->id);
            $duplicate = AttendanceCorrection::where('user_id', $user->id)
                ->whereDate('date', $data['date'])
                ->where('status', 'pending')
                ->exists();
            if ($duplicate) {
                return null;
            }

            $attendance = Attendance::where('user_id', $user->id)
                ->whereDate('date', $data['date'])
                ->first();

            return AttendanceCorrection::create([
                'user_id' => $user->id,
                'attendance_id' => $attendance?->id,
                'date' => $data['date'],
                'requested_check_in' => $data['requested_check_in'] ?? null,
                'requested_check_out' => $data['requested_check_out'] ?? null,
                'reason' => $data['reason'],
                'status' => 'pending',
            ]);
        });
        if (!$result) {
            return response()->json([
                'success' => false,
                'message' => 'A pending correction already exists for this date.',
            ], 422);
        }

        return response()->json([
            'success'  => true,
            'message'  => 'Correction request filed. Manager will review.',
            'data'     => $result,
            'period_locked' => false,
        ], 201);
    }
}
