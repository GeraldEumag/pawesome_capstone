<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Support\CompanySchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CompanyScheduleController extends Controller
{
    private const ALLOWED_KEYS = [
        'shift_start', 'shift_end', 'break_minutes',
        'work_days', 'grace_period_minutes',
        'daily_rate_divisor', 'overtime_threshold_hours',
        'late_escalation_days', 'absent_escalation_days',
        'probationary_alert_days',
    ];

    public function show(): JsonResponse
    {
        $settings = DB::table('system_settings')
            ->whereIn('key', self::ALLOWED_KEYS)
            ->pluck('value', 'key');

        return response()->json([
            'success' => true,
            'data' => [
                'shift_start'               => $settings->get('shift_start', '08:00'),
                'shift_end'                 => $settings->get('shift_end', '17:00'),
                'break_minutes'             => (int) $settings->get('break_minutes', 60),
                'work_days'                 => json_decode($settings->get('work_days', '[1,2,3,4,5,6]'), true),
                'grace_period_minutes'      => (int) $settings->get('grace_period_minutes', 15),
                'daily_rate_divisor'        => (int) $settings->get('daily_rate_divisor', 26),
                'overtime_threshold_hours'  => (int) $settings->get('overtime_threshold_hours', 8),
                'late_escalation_days'      => (int) $settings->get('late_escalation_days', 3),
                'absent_escalation_days'    => (int) $settings->get('absent_escalation_days', 2),
                'probationary_alert_days'   => (int) $settings->get('probationary_alert_days', 14),
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'shift_start'              => 'sometimes|string|regex:/^\d{2}:\d{2}$/',
            'shift_end'                => 'sometimes|string|regex:/^\d{2}:\d{2}$/',
            'break_minutes'            => 'sometimes|integer|min:0|max:120',
            'work_days'                => 'sometimes|array|min:1',
            'work_days.*'              => 'integer|min:0|max:6',
            'grace_period_minutes'     => 'sometimes|integer|min:0|max:60',
            'daily_rate_divisor'       => 'sometimes|integer|min:1|max:31',
            'overtime_threshold_hours' => 'sometimes|integer|min:4|max:12',
            'late_escalation_days'     => 'sometimes|integer|min:1',
            'absent_escalation_days'   => 'sometimes|integer|min:1',
            'probationary_alert_days'  => 'sometimes|integer|min:1',
        ]);

        $now = now();
        foreach ($data as $key => $value) {
            if (!in_array($key, self::ALLOWED_KEYS, true)) {
                continue;
            }
            $stored = is_array($value) ? json_encode(array_values($value)) : (string) $value;
            DB::table('system_settings')->updateOrInsert(
                ['key' => $key],
                ['value' => $stored, 'updated_at' => $now, 'created_at' => $now]
            );
        }

        CompanySchedule::clearCache();

        return $this->show();
    }
}
