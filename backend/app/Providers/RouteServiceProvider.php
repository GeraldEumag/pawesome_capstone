<?php

namespace App\Providers;

use App\Models\SystemSetting;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\PersonalAccessToken;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    /**
     * The path to the "home" route for your application.
     *
     * Typically, users are redirected here after authentication.
     *
     * @var string
     */
    public const HOME = '/';

    /**
     * Define your route model bindings, pattern filters, and other route configuration.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();

        $this->routes(function () {
            Route::middleware('api')
                ->prefix('api')
                ->group(base_path('routes/api.php'));

            Route::middleware('web')
                ->group(base_path('routes/web.php'));
        });
    }

    /**
     * Configure the rate limiters for the application.
     */
    protected function configureRateLimiting(): void
    {
        // General API traffic uses the token owner when one can be resolved —
        // otherwise staff/customer sessions behind one office NAT incorrectly
        // share a single bucket. Invalid bearer strings still fall back to IP.
        RateLimiter::for('api', function (Request $request) {
            $plainToken = $request->bearerToken() ?: $request->cookie('auth_token');
            $accessToken = $plainToken ? PersonalAccessToken::findToken($plainToken) : null;
            $key = $accessToken
                ? 'api-user:' . $accessToken->tokenable_type . ':' . $accessToken->tokenable_id
                : 'api-ip:' . $request->ip();

            return Limit::perMinute(config('app.api_rate_limit_per_minute'))->by($key);
        });

        // Strict rate limit for authentication endpoints per account and IP.
        // The per-account threshold honors the admin-configured
        // security_max_login_attempts setting (bounded to the same 3-10
        // range the settings UI enforces); per-minute decay keeps the
        // lockout temporary and the login|IP key keeps it per-identity —
        // no permanent lockout, no enumeration oracle.
        RateLimiter::for('auth', function (Request $request) {
            $login = strtolower((string) $request->input('login', $request->input('email', 'guest')));
            $maxAttempts = (int) SystemSetting::get('security_max_login_attempts', 5);
            if ($maxAttempts < 3 || $maxAttempts > 10) {
                $maxAttempts = 5;
            }

            return [
                Limit::perMinute(config('app.api_rate_limit_per_minute'))->by('auth-ip:' . $request->ip()),
                Limit::perMinute($maxAttempts)->by('auth-account:' . $login . '|' . $request->ip()),
            ];
        });

        // Rate limit for sensitive operations: 10 requests per minute
        RateLimiter::for('sensitive', function (Request $request) {
            return Limit::perMinute(10)->by($request->ip());
        });

        // Chatbot AI spend guard: per-user minute + day caps. The bot
        // replies with a friendly message when the limit is hit (the widget
        // renders the 429 body as a bot bubble).
        RateLimiter::for('chatbot', function (Request $request) {
            $key = (string) ($request->user()?->id ?? $request->ip());

            return [
                Limit::perMinute(20)->by($key),
                Limit::perDay(200)->by($key . ':day'),
            ];
        });

        // Public landing bot: strict IP caps — no authenticated identity.
        RateLimiter::for('chatbot-public', function (Request $request) {
            return [
                Limit::perMinute(10)->by($request->ip()),
                Limit::perDay(100)->by($request->ip() . ':day'),
            ];
        });
    }
}
