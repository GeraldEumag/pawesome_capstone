<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use App\Support\CompanySchedule;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

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
        $idempotencyKey = $request->header('Idempotency-Key');
        if (!is_string($idempotencyKey) || !Str::isUuid($idempotencyKey)) {
            return response()->json([
                'success' => false,
                'message' => 'A valid Idempotency-Key UUID is required for each attendance punch.',
            ], 422);
        }
        $requestFingerprint = hash_hmac(
            'sha256',
            trim($validated['barcode']),
            (string) config('app.key')
        );

        $resolved = $this->resolvePerson($validated['barcode']);

        if (!$resolved) {
            return response()->json([
                'success' => false,
                'message' => "No employee found for barcode \"{$validated['barcode']}\". Please verify the employee number.",
            ], 404);
        }

        $personId = (int) $resolved['person']->id;
        $isEmployee = $resolved['kind'] === 'employee';
        $today = Carbon::today()->toDateString();
        $now = Carbon::now();

        return DB::transaction(function () use (
            $personId,
            $isEmployee,
            $resolved,
            $today,
            $now,
            $idempotencyKey,
            $requestFingerprint
        ): JsonResponse {
            $inserted = DB::table('attendance_punch_idempotency')->insertOrIgnore([
                'idempotency_key' => $idempotencyKey,
                'request_fingerprint' => $requestFingerprint,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if (!$inserted) {
                $prior = DB::table('attendance_punch_idempotency')
                    ->where('idempotency_key', $idempotencyKey)
                    ->lockForUpdate()
                    ->first();
                if (!$prior || !hash_equals($prior->request_fingerprint, $requestFingerprint)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Idempotency key was already used for a different barcode.',
                    ], 409);
                }
                if ($prior->response_body !== null) {
                    return response()->json(
                        json_decode(Crypt::decryptString($prior->response_body), true) ?: [],
                        (int) $prior->response_status
                    );
                }

                return response()->json([
                    'success' => false,
                    'message' => 'The original punch operation has not completed.',
                ], 409);
            }

            $respond = function (array $body, int $status = 200) use ($idempotencyKey): JsonResponse {
                DB::table('attendance_punch_idempotency')
                    ->where('idempotency_key', $idempotencyKey)
                    ->update([
                        'response_status' => $status,
                        'response_body' => Crypt::encryptString(json_encode($body, JSON_THROW_ON_ERROR)),
                        'updated_at' => now(),
                    ]);

                return response()->json($body, $status);
            };

            if ($isEmployee) {
                $person = Employee::whereKey($personId)->lockForUpdate()->firstOrFail();
                if (!$person->is_active) {
                    return $respond([
                        'success' => false,
                        'message' => "{$person->name} is marked inactive. Contact a manager.",
                    ], 422);
                }
                $identity = ['employee_id' => $person->id, 'date' => $today];
            } else {
                $person = User::whereKey($personId)->lockForUpdate()->firstOrFail();
                $staffRoles = [
                    'admin', 'manager', 'receptionist', 'cashier', 'inventory',
                    'veterinary', 'vet', 'veterinarian', 'vet_tech',
                    'super_receptionist', 'payroll', 'groomer', 'staff',
                ];
                if (!$person->is_active
                    || in_array($person->employment_status, ['resigned', 'terminated'], true)
                    || !in_array($person->role, $staffRoles, true)) {
                    return $respond([
                        'success' => false,
                        'message' => 'This barcode does not identify an active staff account.',
                    ], 403);
                }
                $identity = ['user_id' => $person->id, 'date' => $today];
            }

            $attendance = Attendance::where($identity)
                ->lockForUpdate()
                ->first() ?? new Attendance($identity);
            $personPayload = [
                'employee_name' => $person->name,
                'employee_id' => $person->id,
                'employee_no' => $person->employee_no,
                'person_type' => $resolved['kind'],
                'role' => $isEmployee ? ($person->position ?? 'staff') : $person->role,
            ];

            if (!$attendance->check_in) {
                $attendance->check_in = $now->format('H:i:s');
                $attendance->status = 'present';
                $attendance->source = 'barcode';
                $isLate = CompanySchedule::lateMinutesForDate($today, $now->format('H:i')) > 0;
                $attendance->is_late = $isLate;
                if ($isLate) {
                    $attendance->status = 'late';
                }
                $attendance->save();

                return $respond([
                    'success' => true,
                    'punch_type' => 'check_in',
                    'message' => $isLate
                        ? "Late check-in recorded for {$person->name}."
                        : "Check-in recorded for {$person->name}.",
                    'data' => array_merge($personPayload, [
                        'date' => $today,
                        'time' => $now->format('H:i:s'),
                        'punch_type' => 'check_in',
                        'status' => $attendance->status,
                        'check_in' => $attendance->check_in,
                        'check_out' => null,
                        'is_late' => $isLate,
                    ]),
                ]);
            }

            if (!$attendance->check_out) {
                $attendance->check_out = $now->format('H:i:s');
                $attendance->source = 'barcode';
                $checkInHhmm = $attendance->check_in instanceof Carbon
                    ? $attendance->check_in->format('H:i')
                    : substr((string) $attendance->check_in, 0, 5);
                $early = CompanySchedule::undertimeMinutesForDate(
                    $today,
                    $checkInHhmm,
                    $now->format('H:i')
                ) > 0;
                $attendance->is_early_leave = $early;
                if ($early && $attendance->status !== 'on_leave') {
                    $attendance->status = 'early_leave';
                } elseif (!$attendance->is_late && $attendance->status !== 'on_leave') {
                    $attendance->status = 'present';
                }
                $attendance->save();

                return $respond([
                    'success' => true,
                    'punch_type' => 'check_out',
                    'message' => "Check-out recorded for {$person->name}.",
                    'data' => array_merge($personPayload, [
                        'date' => $today,
                        'time' => $now->format('H:i:s'),
                        'punch_type' => 'check_out',
                        'status' => $attendance->status,
                        'check_in' => $attendance->check_in,
                        'check_out' => $attendance->check_out,
                        'total_hours' => $attendance->total_hours,
                        'is_late' => (bool) $attendance->is_late,
                    ]),
                ]);
            }

            return $respond([
                'success' => false,
                'message' => "{$person->name} has already completed their attendance for today.",
                'data' => array_merge($personPayload, [
                    'check_in' => $attendance->check_in,
                    'check_out' => $attendance->check_out,
                ]),
            ], 422);
        });
    }

    /**
     * GET /manager/attendance/barcode-log
     *
     * Returns today's barcode-sourced attendance records for the kiosk activity log.
     */
    public function todayLog(Request $request): JsonResponse
    {
        if (!$request->user() || !in_array($request->user()->role, ['manager', 'admin'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'A manager or admin session is required to view the kiosk attendance log.',
            ], 403);
        }

        $today = Carbon::today()->toDateString();

        $records = Attendance::with(['user', 'employee'])
            ->where('date', $today)
            ->where('source', 'barcode')
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
