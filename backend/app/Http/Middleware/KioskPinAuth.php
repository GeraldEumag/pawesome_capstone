<?php

namespace App\Http\Middleware;

use App\Models\SystemSetting;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Attendance kiosk guard.
 *
 * Allows a request when EITHER:
 *  - it carries a valid staff bearer token (so logged-in managers/admins can
 *    still open the kiosk), or
 *  - it sends an X-Kiosk-Pin header matching the shared kiosk PIN stored in
 *    system_settings (attendance_kiosk_pin).
 *
 * The kiosk PIN is a shared device secret — it only unlocks punch/log
 * endpoints, never user data.
 */
class KioskPinAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken() ?: $request->query('token');

        if ($token) {
            $accessToken = PersonalAccessToken::findToken($token);
            $user = $accessToken?->tokenable;

            if ($user && (!isset($user->is_active) || $user->is_active)) {
                if (method_exists($user, 'withAccessToken')) {
                    $user->withAccessToken($accessToken);
                }
                Auth::setUser($user);
                $request->setUserResolver(fn () => $user);
                return $next($request);
            }
        }

        $pin = (string) ($request->header('X-Kiosk-Pin') ?: $request->input('pin', ''));
        $expected = (string) SystemSetting::get('attendance_kiosk_pin', env('KIOSK_PIN', ''));

        if ($pin !== '' && $expected !== '' && hash_equals($expected, $pin)) {
            return $next($request);
        }

        return response()->json(['message' => 'Kiosk access denied.'], 401);
    }
}
