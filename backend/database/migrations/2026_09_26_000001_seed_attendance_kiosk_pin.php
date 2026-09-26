<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed the shared attendance-kiosk PIN if it has not been configured yet.
        // Admins can change it in Settings; employees need it to open the kiosk.
        $exists = DB::table('system_settings')->where('key', 'attendance_kiosk_pin')->exists();
        if (!$exists) {
            DB::table('system_settings')->insert([
                'key' => 'attendance_kiosk_pin',
                'value' => env('KIOSK_PIN', '1234'),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('system_settings')->where('key', 'attendance_kiosk_pin')->delete();
    }
};
