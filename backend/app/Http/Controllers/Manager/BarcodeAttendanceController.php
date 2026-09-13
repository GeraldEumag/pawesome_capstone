<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BarcodeAttendanceController extends Controller
{
    /**
     * Resolve a scanned barcode to a person.
     *
     * Priority: unified employee_no on users → employee_no on employees →
     * legacy formats (numeric id, EMP###) against users.id.
     *
     * @return array{person: User|Employee, kind: 'user'|'employee'}|null
     */
    private function resolvePerson(string $barcode): ?array
    {
        $barcode = trim($barcode);

        // Unified employee number (e.g. PAW-0007) — users first, then employees.
        $user = User::where('employee_no', $barcode)->first();
        if ($user) {
            return ['person' => $user, 'kind' => 'user'];
        }

        $employee = Employee::where('employee_no', $barcode)->first();
        if ($employee) {
            return ['person' => $employee, 'kind' => 'employee'];
        }

        // Legacy: raw numeric ID or EMP### → users.id
        $userId = null;
        if (ctype_digit($barcode)) {
            $userId = (int) $barcode;
        } elseif (preg_match('/^EMP0*(\d+)$/i', $barcode, $matches)) {
            $userId = (int) $matches[1];
        }

        if ($userId && ($user = User::find($userId))) {
            return ['person' => $user, 'kind' => 'user'];
        }

        return null;
    }

    /**
     * POST /manager/attendance/barcode-punch
     *
     * Accepts a barcode scan and records check-in or check-out automatically.
     * Punch type is auto-detected: no check-in yet → check_in, else → check_out.
     * Works for both account users and non-account employees.
     */
    public function punch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'barcode' => 'required|string|max:64',
        ]);

        $resolved = $this->resolvePerson($validated['barcode']);

        if (!$resolved) {
            return response()->json([
                'success' => false,
                'message' => "No employee found for barcode \"{$validated['barcode']}\". Please verify the employee number.",
            ], 404);
        }

        /** @var User|Employee $person */
        $person = $resolved['person'];
        $isEmployee = $resolved['kind'] === 'employee';

        if ($isEmployee && !$person->is_active) {
            return response()->json([
                'success' => false,
                'message' => "{$person->name} is marked inactive. Contact a manager.",
            ], 422);
        }

        $today = Carbon::today()->toDateString();
        $now = Carbon::now();

        /** @var Attendance $attendance */
        $attendance = Attendance::firstOrNew(
            $isEmployee
                ? ['employee_id' => $person->id, 'date' => $today]
                : ['user_id' => $person->id, 'date' => $today]
        );

        $personPayload = [
            'employee_name' => $person->name,
            'employee_id'   => $person->id,
            'employee_no'   => $person->employee_no,
            'person_type'   => $resolved['kind'],
            'role'          => $isEmployee ? ($person->position ?? 'staff') : $person->role,
        ];

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
                    ? "Late check-in recorded for {$person->name}."
                    : "Check-in recorded for {$person->name}.",
                'data' => array_merge($personPayload, [
                    'date'       => $today,
                    'time'       => $now->format('H:i:s'),
                    'punch_type' => 'check_in',
                    'status'     => $attendance->status,
                    'check_in'   => $attendance->check_in,
                    'check_out'  => null,
                    'is_late'    => $isLate,
                ]),
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
                'message'    => "Check-out recorded for {$person->name}.",
                'data' => array_merge($personPayload, [
                    'date'        => $today,
                    'time'        => $now->format('H:i:s'),
                    'punch_type'  => 'check_out',
                    'status'      => $attendance->status,
                    'check_in'    => $attendance->check_in,
                    'check_out'   => $attendance->check_out,
                    'total_hours' => $attendance->total_hours,
                    'is_late'     => (bool) $attendance->is_late,
                ]),
            ]);
        }

        // Already has both check-in and check-out
        return response()->json([
            'success' => false,
            'message' => "{$person->name} has already completed their attendance for today (checked in and out).",
            'data' => array_merge($personPayload, [
                'check_in'  => $attendance->check_in,
                'check_out' => $attendance->check_out,
            ]),
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

        $records = Attendance::with(['user', 'employee'])
            ->where('date', $today)
            ->orderByDesc('updated_at')
            ->limit(30)
            ->get()
            ->map(fn ($a) => [
                'employee_name' => $a->user?->name ?? $a->employee?->name ?? 'Unknown',
                'employee_id'   => $a->user?->id ?? $a->employee?->id ?? null,
                'employee_no'   => $a->user?->employee_no ?? $a->employee?->employee_no ?? null,
                'person_type'   => $a->employee_id ? 'employee' : 'user',
                'role'          => $a->user?->role ?? $a->employee?->position ?? '-',
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
