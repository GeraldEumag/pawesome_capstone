<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const SETTINGS = [
        'store_open_time'  => '10:00',
        'store_close_time' => '18:00',
        'store_open_days'  => '[0,1,2,3,4,5,6]',
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
