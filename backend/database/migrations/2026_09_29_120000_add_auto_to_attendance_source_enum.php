<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE attendance MODIFY COLUMN source ENUM('web','fingerprint_terminal','biometric','manual','barcode','kiosk','auto') NOT NULL DEFAULT 'web'");
    }

    public function down(): void
    {
        DB::table('attendance')->where('source', 'auto')->update(['source' => 'web']);
        DB::statement("ALTER TABLE attendance MODIFY COLUMN source ENUM('web','fingerprint_terminal','biometric','manual','barcode','kiosk') NOT NULL DEFAULT 'web'");
    }
};
