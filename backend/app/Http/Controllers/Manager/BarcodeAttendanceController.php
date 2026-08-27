<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BarcodeAttendanceController extends Controller
{
    /**
     * Parse an employee barcode into a user ID.
     * Accepts formats: "3", "EMP003", "EMP3", "emp003"
     */
    private function parseBarcodeToUserId(string $barcode): ?int
    {
        $barcode = trim($barcode);

        // Raw numeric ID
        if (ctype_digit($barcode)) {
            return (int) $barcode;
        }

        // EMP### format (case-insensitive)
        if (preg_match('/^EMP0*(\d+)$/i', $barcode, $matches)) {
            return (int) $matches[1];
        }

        return null;
    }

    /**
     * POST /manager/attendance/barcode-punch
     *
     * Accepts a barcode scan and records check-in or check-out automatically.
     * Punch type is auto-detected: no check-in yet → check_in, else → check_out.
     */
    public function punch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'barcode' => 'required|string|max:64',
        ]);

        $userId = $this->parseBarcodeToUserId($validated['barcode']);

        if (!$userId) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid barcode format. Expected a numeric ID (e.g. 3) or EMP format (e.g. EMP003).',
            ], 422);
        }

        $user = User::find($userId);

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => "No employee found for barcode \"{$validated['barcode']}\". Please verify the employee ID.",
            ], 404);
        }

        $today = Carbon::today()->toDateString();
        $now = Carbon::now();

        /** @var Attendance $attendance */
        $attendance = Attendance::firstOrNew([
            'user_id' => $user->id,
            'date'    => $today,
        ]);

        // Auto-detect punch type
        if (!$attendance->check_in) {
            // --- CHECK IN ---
            $attendance->check_in  = $now->format('H:i:s');
            $attendance->status    = 'present';
            $attendance->source    = 'barcode';

            // Late if after 08:00
            $isLate = $now->format('H:i') > '08:00';
            $attendance->is_late   = $isLate;
            if ($isLate) {
                $attendance->status = 'late';
            }

            $attendance->save();

            return response()->json([
                'success'    => true,
                'punch_type' => 'check_in',
                'message'    => $isLate
                    ? "Late check-in recorded for {$user->name}."
                    : "Check-in recorded for {$user->name}.",
                'data' => [
                    'employee_name' => $user->name,
                    'employee_id'   => $user->id,
                    'role'          => $user->role,
                    'date'          => $today,
                    'time'          => $now->format('H:i:s'),
                    'punch_type'    => 'check_in',
                    'status'        => $attendance->status,
                    'check_in'      => $attendance->check_in,
                    'check_out'     => null,
                    'is_late'       => $isLate,
                ],
            ]);
        }

        if (!$attendance->check_out) {
            // --- CHECK OUT ---
            $attendance->check_out = $now->format('H:i:s');
            $attendance->source    = 'barcode';
            $attendance->save();

            return response()->json([
                'success'    => true,
                'punch_type' => 'check_out',
                'message'    => "Check-out recorded for {$user->name}.",
                'data' => [
                    'employee_name' => $user->name,
                    'employee_id'   => $user->id,
                    'role'          => $user->role,
                    'date'          => $today,
                    'time'          => $now->format('H:i:s'),
                    'punch_type'    => 'check_out',
                    'status'        => $attendance->status,
                    'check_in'      => $attendance->check_in,
                    'check_out'     => $attendance->check_out,
                    'total_hours'   => $attendance->total_hours,
                    'is_late'       => (bool) $attendance->is_late,
                ],
            ]);
        }

        // Already has both check-in and check-out
        return response()->json([
            'success' => false,
            'message' => "{$user->name} has already completed their attendance for today (checked in and out).",
            'data' => [
                'employee_name' => $user->name,
                'check_in'      => $attendance->check_in,
                'check_out'     => $attendance->check_out,
            ],
        ], 422);
    }

    /**
     * GET /manager/attendance/barcode-log
     *
     * Returns today's barcode-sourced attendance records for the kiosk activity log.
     */
    public function todayLog(): JsonResponse
    {
        $today = Carbon::today()->toDateString();

        $records = Attendance::with('user')
            ->where('date', $today)
            ->orderByDesc('updated_at')
            ->limit(30)
            ->get()
            ->map(fn ($a) => [
                'employee_name' => $a->user?->name ?? 'Unknown',
                'employee_id'   => $a->user?->id ?? null,
                'role'          => $a->user?->role ?? '-',
                'check_in'      => $a->check_in ? Carbon::parse($a->check_in)->format('H:i') : null,
                'check_out'     => $a->check_out ? Carbon::parse($a->check_out)->format('H:i') : null,
                'status'        => $a->status,
                'source'        => $a->source ?? 'web',
                'is_late'       => (bool) $a->is_late,
                'total_hours'   => $a->total_hours,
            ]);

        return response()->json([
            'success' => true,
            'date'    => $today,
            'data'    => $records,
        ]);
    }
}
