<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The barcode kiosk writes source='barcode' but the enum predates it —
     * values were being truncated. Widen to include 'barcode' and 'kiosk'.
     */
    public function up(): void
    {
        DB::statement("ALTER TABLE attendance MODIFY COLUMN source ENUM('web','fingerprint_terminal','biometric','manual','barcode','kiosk') NOT NULL DEFAULT 'web'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE attendance MODIFY COLUMN source ENUM('web','fingerprint_terminal','biometric','manual') NOT NULL DEFAULT 'web'");
    }
};
