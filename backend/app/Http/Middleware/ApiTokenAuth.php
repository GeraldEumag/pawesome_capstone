<?php

namespace App\Http\Middleware;

use App\Models\SystemSetting;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class ApiTokenAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        // Bearer header only — accepting ?token= query params would leak
        // credentials into access logs, browser history and referrers.
        $token = $request->bearerToken();

        if (!$token && $request->user()) {
            return $next($request);
        }

        if (!$token) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $accessToken = PersonalAccessToken::findToken($token);

        $expiration = config('sanctum.expiration');

        if (!$accessToken
            || ($accessToken->expires_at && $accessToken->expires_at->isPast())
            || ($expiration && !$accessToken->created_at->gt(now()->subMinutes($expiration)))) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Inactivity timeout (F-04): the admin "Session Timeout" setting is
        // advertised as "idle time before automatic logout" — enforce it
        // against the token's last use. last_used_at is refreshed below,
        // throttled to one write per minute so hot API clients don't add a
        // DB write per request; timeout granularity is therefore ~1 minute.
        $sessionTimeout = (int) SystemSetting::get('security_session_timeout', 60);
        if ($sessionTimeout < 15 || $sessionTimeout > 480) {
            $sessionTimeout = 60;
        }
        $lastActivity = $accessToken->last_used_at ?? $accessToken->created_at;
        if ($lastActivity && $lastActivity->lt(now()->subMinutes($sessionTimeout))) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        if (!$accessToken->last_used_at || $accessToken->last_used_at->lt(now()->subMinute())) {
            $accessToken->forceFill(['last_used_at' => now()])->save();
        }

        $user = $accessToken->tokenable;

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Deactivated accounts must not retain API access via previously issued
        // tokens. The database user record is authoritative — not the token.
        if (!$user->is_active) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Admin-controlled maintenance mode: authenticated non-admin sessions
        // are refused while it is on. Admins keep API access so they can turn
        // it back off; public routes (login, landing) stay reachable either way.
        if ((bool) SystemSetting::get('general_maintenance_mode', false)
            && !in_array($user->role, ['admin', 'super_admin'], true)) {
            return response()->json([
                'message' => 'System is under maintenance. Please try again later.',
            ], 503);
        }

        if (method_exists($user, 'withAccessToken')) {
            $user->withAccessToken($accessToken);
        }

        Auth::setUser($user);

        $request->setUserResolver(function () use ($user) {
            return $user;
        });

        return $next($request);
    }
}
