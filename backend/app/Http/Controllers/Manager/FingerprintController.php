<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\BiometricCredential;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class FingerprintController extends Controller
{
    private const CHALLENGE_TTL = 120; // seconds

    /**
     * Generate a WebAuthn challenge for registration
     */
    public function registerChallenge(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
        ]);

        $user = User::findOrFail($validated['user_id']);
        $challenge = Str::random(32);
        $cacheKey = 'webauthn_reg_' . $user->id;

        Cache::put($cacheKey, $challenge, self::CHALLENGE_TTL);

        return response()->json([
            'success' => true,
            'challenge' => base64_encode($challenge),
            'user' => [
                'id' => base64_encode((string) $user->id),
                'name' => $user->name,
                'displayName' => $user->name,
            ],
            'rp' => [
                'name' => config('app.name', 'Pawesome Retreat'),
                'id' => $request->getHost(),
            ],
        ]);
    }

    /**
     * Store a registered WebAuthn credential
     */
    public function registerCredential(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'credential_id' => 'required|string',
            'type' => 'nullable|string|in:fingerprint,face,pin',
            'device_name' => 'nullable|string',
        ]);

        $user = User::findOrFail($validated['user_id']);
        $credentialId = $validated['credential_id'];

        // Prevent duplicate credential IDs
        $existing = BiometricCredential::where('credential_id', $credentialId)->first();
        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'This biometric credential is already registered.',
            ], 422);
        }

        $credential = BiometricCredential::create([
            'user_id' => $user->id,
            'credential_id' => $credentialId,
            'type' => $validated['type'] ?? 'fingerprint',
            'device_name' => $validated['device_name'] ?? null,
        ]);

        // Clear challenge cache
        Cache::forget('webauthn_reg_' . $user->id);

        return response()->json([
            'success' => true,
            'message' => 'Biometric credential registered successfully.',
            'data' => $credential->load('user'),
        ]);
    }

    /**
     * Generate a WebAuthn challenge for authentication (kiosk check-in)
     */
    public function verifyChallenge(Request $request): JsonResponse
    {
        $challenge = Str::random(32);
        $cacheKey = 'webauthn_auth_' . $challenge;

        Cache::put($cacheKey, true, self::CHALLENGE_TTL);

        // Get all registered credential IDs for the allowCredentials list
        $credentials = BiometricCredential::pluck('credential_id')->toArray();

        return response()->json([
            'success' => true,
            'challenge' => base64_encode($challenge),
            'allowCredentials' => array_map(fn ($id) => ['id' => $id, 'type' => 'public-key'], $credentials),
            'rpId' => $request->getHost(),
        ]);
    }

    /**
     * Verify biometric credential and record attendance
     */
    public function verifyAndPunch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'credential_id' => 'required|string',
            'type' => 'nullable|in:check_in,check_out',
            'terminal_id' => 'nullable|string',
        ]);

        $credentialId = $validated['credential_id'];
        $punchType = $validated['type'] ?? 'check_in';
        $terminalId = $validated['terminal_id'] ?? null;

        // Look up the credential
        $bioCred = BiometricCredential::where('credential_id', $credentialId)->first();

        if (!$bioCred) {
            return response()->json([
                'success' => false,
                'message' => 'Biometric credential not recognized.',
            ], 401);
        }

        $user = $bioCred->user;
        $today = Carbon::today()->toDateString();
        $now = Carbon::now();

        // Update last used
        $bioCred->update(['last_used_at' => now()]);

        // Find or create today's attendance record
        $attendance = Attendance::firstOrNew([
            'user_id' => $user->id,
            'date' => $today,
        ]);

        $message = '';
        $status = 'present';
        $isLate = false;

        if ($punchType === 'check_in') {
            if ($attendance->check_in) {
                return response()->json([
                    'success' => false,
                    'message' => 'Already checked in today at ' . $attendance->check_in . '.',
                    'data' => [
                        'employee_name' => $user->name,
                        'check_in' => $attendance->check_in,
                        'check_out' => $attendance->check_out,
                    ],
                ], 422);
            }

            $attendance->check_in = Carbon::parse($now->format('H:i:s'));
            $attendance->status = 'present';
            $attendance->source = $terminalId ? 'fingerprint_terminal' : 'biometric';
            $attendance->biometric_id = $credentialId;
            $attendance->terminal_id = $terminalId;

            // Determine if late (after 9:00 AM)
            $isLate = $now->hour > 9 || ($now->hour === 9 && $now->minute > 0);
            $attendance->is_late = $isLate;
            if ($isLate) {
                $attendance->status = 'late';
                $status = 'late';
            }

            $message = 'Check-in recorded.';
        } else {
            if (!$attendance->check_in) {
                return response()->json([
                    'success' => false,
                    'message' => 'No check-in found for today. Please check in first.',
                ], 422);
            }

            if ($attendance->check_out) {
                return response()->json([
                    'success' => false,
                    'message' => 'Already checked out today at ' . $attendance->check_out . '.',
                    'data' => [
                        'employee_name' => $user->name,
                        'check_in' => $attendance->check_in,
                        'check_out' => $attendance->check_out,
                    ],
                ], 422);
            }

            $attendance->check_out = Carbon::parse($now->format('H:i:s'));
            $attendance->source = $terminalId ? 'fingerprint_terminal' : 'biometric';

            // Calculate total hours
            $checkInTime = Carbon::parse($attendance->check_in);
            $totalMinutes = $checkInTime->diffInMinutes($now);
            $breakMinutes = 60; // 1 hour break
            $workMinutes = max(0, $totalMinutes - $breakMinutes);
            $totalHours = round($workMinutes / 60, 2);

            $attendance->total_hours = $totalHours;

            // Overtime: more than 8 hours
            $overtime = max(0, $totalHours - 8);
            $attendance->overtime_hours = round($overtime, 2);

            $message = 'Check-out recorded.';
        }

        $attendance->save();

        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => [
                'employee_name' => $user->name,
                'role' => $user->role,
                'date' => $today,
                'time' => $now->format('H:i:s'),
                'type' => $punchType,
                'status' => $status,
                'check_in' => $attendance->check_in,
                'check_out' => $attendance->check_out,
                'total_hours' => $attendance->total_hours,
                'source' => $attendance->source,
            ],
        ]);
    }

    /**
     * External fingerprint terminal punch endpoint
     */
    public function terminalPunch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'terminal_id' => 'required|string',
            'user_id' => 'required|integer|exists:users,id',
            'type' => 'required|in:check_in,check_out',
            'timestamp' => 'nullable|date',
        ]);

        $user = User::findOrFail($validated['user_id']);
        $punchType = $validated['type'];
        $terminalId = $validated['terminal_id'];
        $timestamp = $validated['timestamp'] ? Carbon::parse($validated['timestamp']) : Carbon::now();
        $today = $timestamp->toDateString();

        $attendance = Attendance::firstOrNew([
            'user_id' => $user->id,
            'date' => $today,
        ]);

        if ($punchType === 'check_in') {
            if ($attendance->check_in) {
                return response()->json([
                    'success' => false,
                    'message' => 'Already checked in today.',
                ], 422);
            }

            $attendance->check_in = Carbon::parse($timestamp->format('H:i:s'));
            $attendance->status = 'present';
            $attendance->source = 'fingerprint_terminal';
            $attendance->terminal_id = $terminalId;

            $isLate = $timestamp->hour > 9 || ($timestamp->hour === 9 && $timestamp->minute > 0);
            $attendance->is_late = $isLate;
            if ($isLate) {
                $attendance->status = 'late';
            }
        } else {
            if (!$attendance->check_in) {
                return response()->json([
                    'success' => false,
                    'message' => 'No check-in found for today.',
                ], 422);
            }
            if ($attendance->check_out) {
                return response()->json([
                    'success' => false,
                    'message' => 'Already checked out today.',
                ], 422);
            }

            $attendance->check_out = Carbon::parse($timestamp->format('H:i:s'));
            $attendance->source = 'fingerprint_terminal';
            $attendance->terminal_id = $terminalId;

            $checkInTime = Carbon::parse($attendance->check_in);
            $totalMinutes = $checkInTime->diffInMinutes($timestamp);
            $workMinutes = max(0, $totalMinutes - 60);
            $totalHours = round($workMinutes / 60, 2);
            $attendance->total_hours = $totalHours;
            $attendance->overtime_hours = round(max(0, $totalHours - 8), 2);
        }

        $attendance->save();

        return response()->json([
            'success' => true,
            'message' => ucfirst(str_replace('_', ' ', $punchType)) . ' recorded via terminal.',
            'data' => [
                'employee_name' => $user->name,
                'date' => $today,
                'time' => $timestamp->format('H:i:s'),
                'type' => $punchType,
                'status' => $attendance->status,
                'terminal_id' => $terminalId,
            ],
        ]);
    }

    /**
     * List biometric credentials for a user
     */
    public function listCredentials(Request $request): JsonResponse
    {
        $userId = $request->get('user_id');
        $query = BiometricCredential::with('user');

        if ($userId) {
            $query->where('user_id', $userId);
        }

        $credentials = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $credentials,
        ]);
    }

    /**
     * Delete a biometric credential
     */
    public function deleteCredential(BiometricCredential $credential): JsonResponse
    {
        $credential->delete();

        return response()->json([
            'success' => true,
            'message' => 'Biometric credential removed.',
        ]);
    }

    /**
     * Get today's biometric attendance summary
     */
    public function todaySummary(): JsonResponse
    {
        $today = Carbon::today()->toDateString();

        $totalBio = Attendance::where('date', $today)
            ->whereIn('source', ['biometric', 'fingerprint_terminal'])
            ->count();

        $checkedIn = Attendance::where('date', $today)
            ->whereIn('source', ['biometric', 'fingerprint_terminal'])
            ->whereNotNull('check_in')
            ->count();

        $checkedOut = Attendance::where('date', $today)
            ->whereIn('source', ['biometric', 'fingerprint_terminal'])
            ->whereNotNull('check_out')
            ->count();

        $recent = Attendance::with('user')
            ->where('date', $today)
            ->whereIn('source', ['biometric', 'fingerprint_terminal'])
            ->orderBy('check_in', 'desc')
            ->limit(10)
            ->get();

        return response()->json([
            'success' => true,
            'summary' => [
                'total_bio_records' => $totalBio,
                'checked_in' => $checkedIn,
                'checked_out' => $checkedOut,
            ],
            'recent' => $recent->map(fn ($a) => [
                'employee_name' => $a->user?->name ?? 'Unknown',
                'role' => $a->user?->role ?? '-',
                'check_in' => $a->check_in,
                'check_out' => $a->check_out,
                'status' => $a->status,
                'source' => $a->source,
            ]),
        ]);
    }
}
