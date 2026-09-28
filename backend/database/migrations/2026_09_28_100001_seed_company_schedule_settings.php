<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const SETTINGS = [
        'shift_start'              => '08:00',
        'shift_end'                => '17:00',
        'break_minutes'            => '60',
        'work_days'                => '[1,2,3,4,5,6]',
        'grace_period_minutes'     => '15',
        'daily_rate_divisor'       => '26',
        'overtime_threshold_hours' => '8',
        'late_escalation_days'     => '3',
        'absent_escalation_days'   => '2',
        'probationary_alert_days'  => '14',
    ];

    public function up(): void
    {
        $now = now();
        foreach (self::SETTINGS as $key => $value) {
            DB::table('system_settings')->updateOrInsert(
                ['key' => $key],
                ['value' => $value, 'updated_at' => $now, 'created_at' => $now]
            );
        }
    }

    public function down(): void
    {
        DB::table('system_settings')->whereIn('key', array_keys(self::SETTINGS))->delete();
    }
};
