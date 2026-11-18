<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\AttendanceCorrection;
use App\Models\Attendance;
use App\Support\CompanySchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AttendanceCorrectionController extends Controller
{
    /** GET /manager/attendance/corrections?status=pending */
    public function index(Request $request): JsonResponse
    {
        $query = AttendanceCorrection::with([
            'user:id,name,employee_no',
            'attendance:id,date,check_in,check_out',
            'reviewer:id,name',
        ])
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
        $result = DB::transaction(function () use ($correction) {
            $correction = AttendanceCorrection::lockForUpdate()->findOrFail($correction->id);
            if ($correction->status !== 'pending') {
                return ['error' => 'Already reviewed.', 'status' => 422];
            }

            $date = \Carbon\Carbon::parse($correction->date);
            $periodStart = $date->day <= 15 ? $date->format('Y-m') . '-01' : $date->format('Y-m') . '-16';
            $periodEnd = $date->day <= 15 ? $date->format('Y-m') . '-15' : $date->copy()->endOfMonth()->toDateString();
            $payrollLocked = DB::table('payrolls')
                ->where('user_id', $correction->user_id)
                ->whereDate('pay_period_start', $periodStart)
                ->whereDate('pay_period_end', $periodEnd)
                ->whereIn('status', ['pending', 'approved', 'paid'])
                ->exists();
            if ($payrollLocked) {
                return ['error' => 'Payroll is approved or released; attendance requires an authorized historical correction workflow.', 'status' => 422];
            }

            // Find or create the attendance record for this date
            $attendance = Attendance::where('user_id', $correction->user_id)
                ->whereDate('date', $correction->date)
                ->lockForUpdate()
                ->first();

            if (!$attendance) {
                $attendance = Attendance::create([
                    'user_id' => $correction->user_id,
                    'date'    => $correction->date,
                    'status'  => 'present',
                ]);
            }

            $correction->original_check_in = $attendance->check_in;
            $correction->original_check_out = $attendance->check_out;

            // Apply the corrected times
            if ($correction->requested_check_in) {
                $attendance->check_in = $correction->requested_check_in;
            }
            if ($correction->requested_check_out) {
                $attendance->check_out = $correction->requested_check_out;
            }

            // Keep the stored late flag/status consistent with the corrected
            // check-in — same rule the barcode kiosk applies at punch time
            // (is_late + status='late' both derive from check_in vs the
            // company shift_start + grace period).
            $checkIn = $attendance->check_in
                ? ($attendance->check_in instanceof \Carbon\Carbon
                    ? $attendance->check_in->format('H:i')
                    : substr((string) $attendance->check_in, 0, 5))
                : null;

            if ($checkIn) {
                $isLate = CompanySchedule::lateMinutesForDate(
                    $correction->date instanceof \Carbon\Carbon
                        ? $correction->date->toDateString()
                        : (string) $correction->date,
                    $checkIn
                ) > 0;
                $attendance->is_late = $isLate;
                // 'on_leave' is deliberately untouched in both branches —
                // leave approval is a separate authority from the punch
                // record (payroll still counts late minutes on such rows;
                // that pre-existing double-count is a documented policy
                // question, not something this fix redefines).
                if ($isLate) {
                    if ($attendance->status !== 'on_leave') {
                        $attendance->status = 'late';
                    }
                } elseif (in_array($attendance->status, ['late', 'absent'], true)) {
                    // A corrected on-time punch disproves 'late'/'absent';
                    // 'early_leave'/'present'/'on_leave' keep their meaning.
                    $attendance->status = 'present';
                }
            }

            if ($attendance->check_out) {
                $checkOutHhmm = $attendance->check_out instanceof \Carbon\Carbon
                    ? $attendance->check_out->format('H:i')
                    : substr((string) $attendance->check_out, 0, 5);
                $isEarly = CompanySchedule::undertimeMinutesForDate(
                    $correction->date instanceof \Carbon\Carbon
                        ? $correction->date->toDateString()
                        : (string) $correction->date,
                    $checkIn,
                    $checkOutHhmm
                ) > 0;
                $attendance->is_early_leave = $isEarly;
                if ($attendance->status !== 'on_leave') {
                    if ($isEarly) {
                        $attendance->status = 'early_leave';
                    } elseif ($attendance->status === 'early_leave') {
                        $attendance->status = $attendance->is_late ? 'late' : 'present';
                    }
                }
            }

            $attendance->save(); // triggers calculateHours() + calculateEarnings() in boot

            $correction->update([
                'status'      => 'approved',
                'reviewed_by' => auth()->id(),
                'reviewed_at' => now(),
                'attendance_id' => $attendance->id,
            ]);

            return ['correction' => $correction->fresh()];
        });

        if (isset($result['error'])) {
            return response()->json(['success' => false, 'message' => $result['error']], $result['status']);
        }

        return response()->json(['success' => true, 'data' => $result['correction']]);
    }

    /** POST /manager/attendance/corrections/{id}/reject */
    public function reject(Request $request, AttendanceCorrection $correction): JsonResponse
    {
        $data = $request->validate([
            'remarks' => 'required|string|max:500',
        ]);

        $updated = DB::transaction(function () use ($correction, $data) {
            $locked = AttendanceCorrection::lockForUpdate()->findOrFail($correction->id);
            if ($locked->status !== 'pending') {
                return false;
            }
            $locked->update([
                'status' => 'rejected',
                'reviewed_by' => auth()->id(),
                'reviewed_at' => now(),
                'remarks' => $data['remarks'],
            ]);
            return true;
        });
        if (!$updated) {
            return response()->json(['success' => false, 'message' => 'Already reviewed.'], 422);
        }

        return response()->json(['success' => true, 'data' => $correction->fresh()]);
    }
}
