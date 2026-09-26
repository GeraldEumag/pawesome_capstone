<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KioskController extends Controller
{
    /**
     * POST /api/kiosk/verify
     *
     * Validates the shared attendance-kiosk PIN. Employees enter this on the
     * public kiosk page before the scanner UI is revealed.
     */
    public function verify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'pin' => 'required|string|max:64',
        ]);

        $expected = (string) SystemSetting::get('attendance_kiosk_pin', env('KIOSK_PIN', ''));

        if ($expected === '' || !hash_equals($expected, $validated['pin'])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid kiosk PIN.',
            ], 401);
        }

        return response()->json([
            'success' => true,
            'message' => 'Kiosk unlocked.',
        ]);
    }
}
