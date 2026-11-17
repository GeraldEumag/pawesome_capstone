<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use Illuminate\Http\Request;

class SystemSettingController extends Controller
{
    private const VALID_PRESETS = [
        'cream-white',
        'blush-pink',
        'peach',
        'sage-green',
        'lavender',
        'baby-blue',
        'butter-yellow',
        'rose-mauve',
        'mint',
        'dusty-lilac',
        'warm-tan',
        'pawesome-mix',
        'cotton-candy',
        'ocean-dusk',
        'grape-soda',
        'citrus-burst',
        'midnight-berry',
        'cherry-blossom',
        'candy-floss',
        'bubble-gum',
        'sugar-rush',
        'frosted-berry',
        'dreamsicle',
        'neon-twilight',
        'coral-reef',
        'emerald-mist',
        'golden-hour',
        'arctic-aurora',
    ];

    /**
     * Public endpoint — no auth required.
     * Returns the current system-wide theme color.
     */
    public function getPublicSettings()
    {
        return response()->json([
            'theme_color' => SystemSetting::get('theme_color', 'blush-pink'),
            'store_hours' => \App\Support\StoreHours::publicPayload(),
        ]);
    }

    /**
     * Admin-only — return all persisted settings grouped by category.
     */
    public function getSettings()
    {
        // Only settings with a live enforcement consumer are exposed — see
        // SystemSettingConsumers: ApiTokenAuth (session timeout, maintenance
        // mode), PasswordPolicy (password rules), the auth rate limiter
        // (max attempts), EmailDeliveryService (email kill switch),
        // AuthController (login/failed-login alerts) and KioskPinAuth (PIN).
        return response()->json([
            'general' => [
                'maintenanceMode' => (bool) SystemSetting::get('general_maintenance_mode', false),
            ],
            'security' => [
                'minPasswordLength'  => (int) SystemSetting::get('security_min_password_length', 8),
                'requireSpecialChars'=> (bool) SystemSetting::get('security_require_special_chars', true),
                'requireNumbers'     => (bool) SystemSetting::get('security_require_numbers', true),
                'requireUppercase'   => (bool) SystemSetting::get('security_require_uppercase', true),
                'maxLoginAttempts'   => (int) SystemSetting::get('security_max_login_attempts', 5),
                'sessionTimeout'     => (int) SystemSetting::get('security_session_timeout', 60),
                'kioskPin'           => (string) SystemSetting::get('attendance_kiosk_pin', ''),
            ],
            'notifications' => [
                'emailNotifications' => (bool) SystemSetting::get('notif_email_notifications', true),
                'loginAlerts'        => (bool) SystemSetting::get('notif_login_alerts', true),
                'failedLoginAlerts'  => (bool) SystemSetting::get('notif_failed_login_alerts', true),
            ],
        ]);
    }

    /**
     * Admin-only — save general settings.
     */
    public function updateGeneral(Request $request)
    {
        $request->validate([
            'maintenanceMode' => 'boolean',
        ]);

        SystemSetting::set('general_maintenance_mode', $request->boolean('maintenanceMode') ? '1' : '0');

        return response()->json(['message' => 'General settings saved successfully.']);
    }

    /**
     * Admin-only — save security settings.
     */
    public function updateSecurity(Request $request)
    {
        $request->validate([
            'minPasswordLength'   => 'required|integer|min:6|max:32',
            'requireSpecialChars' => 'boolean',
            'requireNumbers'      => 'boolean',
            'requireUppercase'    => 'boolean',
            'maxLoginAttempts'    => 'required|integer|min:3|max:10',
            'sessionTimeout'      => 'required|integer|min:15|max:480',
        ]);

        SystemSetting::set('security_min_password_length', $request->minPasswordLength);
        SystemSetting::set('security_require_special_chars', $request->boolean('requireSpecialChars') ? '1' : '0');
        SystemSetting::set('security_require_numbers', $request->boolean('requireNumbers') ? '1' : '0');
        SystemSetting::set('security_require_uppercase', $request->boolean('requireUppercase') ? '1' : '0');
        SystemSetting::set('security_max_login_attempts', $request->maxLoginAttempts);
        SystemSetting::set('security_session_timeout', $request->sessionTimeout);

        return response()->json(['message' => 'Security settings saved successfully.']);
    }

    /**
     * Admin-only — save the shared attendance-kiosk PIN.
     */
    public function updateKioskPin(Request $request)
    {
        $request->validate([
            'kioskPin' => 'required|string|min:4|max:64',
        ]);

        SystemSetting::set('attendance_kiosk_pin', $request->kioskPin);

        return response()->json(['message' => 'Attendance kiosk PIN saved successfully.']);
    }

    /**
     * Admin-only — save notification settings.
     */
    public function updateNotifications(Request $request)
    {
        $request->validate([
            'emailNotifications' => 'boolean',
            'loginAlerts'        => 'boolean',
            'failedLoginAlerts'  => 'boolean',
        ]);

        SystemSetting::set('notif_email_notifications', $request->boolean('emailNotifications') ? '1' : '0');
        SystemSetting::set('notif_login_alerts', $request->boolean('loginAlerts') ? '1' : '0');
        SystemSetting::set('notif_failed_login_alerts', $request->boolean('failedLoginAlerts') ? '1' : '0');

        return response()->json(['message' => 'Notification settings saved successfully.']);
    }

    /**
     * Admin-only — save the chosen theme color.
     */
    public function updateThemeColor(Request $request)
    {
        $request->validate([
            'theme_color' => ['required', 'string', 'in:' . implode(',', self::VALID_PRESETS)],
        ]);

        SystemSetting::set('theme_color', $request->theme_color);

        return response()->json([
            'message'     => 'Theme color updated successfully.',
            'theme_color' => $request->theme_color,
        ]);
    }
}
