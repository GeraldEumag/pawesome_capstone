<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\AttendanceCorrection;
use App\Models\Attendance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AttendanceCorrectionController extends Controller
{
    /** GET /manager/attendance/corrections?status=pending */
    public function index(Request $request): JsonResponse
    {
        $query = AttendanceCorrection::with(['user:id,name,employee_no', 'reviewer:id,name'])
            ->orderByRaw("FIELD(status,'pending','approved','rejected')")
            ->orderBy('created_at', 'desc');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        return response()->json(['success' => true, 'data' => $query->paginate(50)]);
    }

    /** POST /manager/attendance/corrections/{id}/approve */
    public function approve(Request $request, AttendanceCorrection $correction): JsonResponse
    {
        if ($correction->status !== 'pending') {
            return response()->json(['message' => 'Already reviewed.'], 422);
        }

        // Find or create the attendance record for this date
        $attendance = Attendance::where('user_id', $correction->user_id)
            ->whereDate('date', $correction->date)
            ->first();

        if (!$attendance) {
            $attendance = Attendance::create([
                'user_id' => $correction->user_id,
                'date'    => $correction->date,
                'status'  => 'present',
            ]);
        }

        // Apply the corrected times
        if ($correction->requested_check_in) {
            $attendance->check_in = $correction->requested_check_in;
        }
        if ($correction->requested_check_out) {
            $attendance->check_out = $correction->requested_check_out;
        }
        $attendance->save(); // triggers calculateHours() + calculateEarnings() in boot

        $correction->update([
            'status'      => 'approved',
            'reviewed_by' => auth()->id(),
            'reviewed_at' => now(),
            'attendance_id' => $attendance->id,
        ]);

        return response()->json(['success' => true, 'data' => $correction->fresh()]);
    }

    /** POST /manager/attendance/corrections/{id}/reject */
    public function reject(Request $request, AttendanceCorrection $correction): JsonResponse
    {
        if ($correction->status !== 'pending') {
            return response()->json(['message' => 'Already reviewed.'], 422);
        }

        $data = $request->validate([
            'remarks' => 'required|string|max:500',
        ]);

        $correction->update([
            'status'      => 'rejected',
            'reviewed_by' => auth()->id(),
            'reviewed_at' => now(),
            'remarks'     => $data['remarks'],
        ]);

        return response()->json(['success' => true, 'data' => $correction->fresh()]);
    }
}
