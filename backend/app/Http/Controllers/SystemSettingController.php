<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use Illuminate\Http\Request;

class SystemSettingController extends Controller
{
    private const VALID_PRESETS = [
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
        ]);
    }

    /**
     * Admin-only — return all persisted settings grouped by category.
     */
    public function getSettings()
    {
        return response()->json([
            'general' => [
                'systemName'      => SystemSetting::get('general_system_name', 'Pawesome Admin'),
                'timezone'        => SystemSetting::get('general_timezone', 'Asia/Manila'),
                'dateFormat'      => SystemSetting::get('general_date_format', 'MM/DD/YYYY'),
                'maintenanceMode' => (bool) SystemSetting::get('general_maintenance_mode', false),
            ],
            'security' => [
                'minPasswordLength'  => (int) SystemSetting::get('security_min_password_length', 8),
                'requireSpecialChars'=> (bool) SystemSetting::get('security_require_special_chars', true),
                'requireNumbers'     => (bool) SystemSetting::get('security_require_numbers', true),
                'requireUppercase'   => (bool) SystemSetting::get('security_require_uppercase', true),
                'maxLoginAttempts'   => (int) SystemSetting::get('security_max_login_attempts', 5),
                'sessionTimeout'     => (int) SystemSetting::get('security_session_timeout', 60),
                'twoFactorAuth'      => (bool) SystemSetting::get('security_two_factor_auth', false),
            ],
            'notifications' => [
                'emailNotifications' => (bool) SystemSetting::get('notif_email_notifications', true),
                'loginAlerts'        => (bool) SystemSetting::get('notif_login_alerts', true),
                'failedLoginAlerts'  => (bool) SystemSetting::get('notif_failed_login_alerts', true),
                'dailyReports'       => (bool) SystemSetting::get('notif_daily_reports', false),
                'weeklyReports'      => (bool) SystemSetting::get('notif_weekly_reports', true),
            ],
        ]);
    }

    /**
     * Admin-only — save general settings.
     */
    public function updateGeneral(Request $request)
    {
        $request->validate([
            'systemName'      => 'required|string|max:100',
            'timezone'        => 'required|string|max:50',
            'dateFormat'      => 'required|string|in:MM/DD/YYYY,DD/MM/YYYY,YYYY-MM-DD',
            'maintenanceMode' => 'boolean',
        ]);

        SystemSetting::set('general_system_name', $request->systemName);
        SystemSetting::set('general_timezone', $request->timezone);
        SystemSetting::set('general_date_format', $request->dateFormat);
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
            'twoFactorAuth'       => 'boolean',
        ]);

        SystemSetting::set('security_min_password_length', $request->minPasswordLength);
        SystemSetting::set('security_require_special_chars', $request->boolean('requireSpecialChars') ? '1' : '0');
        SystemSetting::set('security_require_numbers', $request->boolean('requireNumbers') ? '1' : '0');
        SystemSetting::set('security_require_uppercase', $request->boolean('requireUppercase') ? '1' : '0');
        SystemSetting::set('security_max_login_attempts', $request->maxLoginAttempts);
        SystemSetting::set('security_session_timeout', $request->sessionTimeout);
        SystemSetting::set('security_two_factor_auth', $request->boolean('twoFactorAuth') ? '1' : '0');

        return response()->json(['message' => 'Security settings saved successfully.']);
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
            'dailyReports'       => 'boolean',
            'weeklyReports'      => 'boolean',
        ]);

        SystemSetting::set('notif_email_notifications', $request->boolean('emailNotifications') ? '1' : '0');
        SystemSetting::set('notif_login_alerts', $request->boolean('loginAlerts') ? '1' : '0');
        SystemSetting::set('notif_failed_login_alerts', $request->boolean('failedLoginAlerts') ? '1' : '0');
        SystemSetting::set('notif_daily_reports', $request->boolean('dailyReports') ? '1' : '0');
        SystemSetting::set('notif_weekly_reports', $request->boolean('weeklyReports') ? '1' : '0');

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
