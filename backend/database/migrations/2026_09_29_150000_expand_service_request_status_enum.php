<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE service_requests MODIFY COLUMN status ENUM('pending','scheduled','approved','rejected','cancelled','canceled','completed','paid','confirmed','rescheduled','in_progress','checked_in') NOT NULL DEFAULT 'pending'");
    }

    public function down(): void
    {
        if (DB::table('service_requests')->whereNotIn('status', ['pending', 'approved', 'rejected'])->exists()) {
            throw new RuntimeException('Cannot revert service request statuses while records use the expanded values.');
        }

        DB::statement("ALTER TABLE service_requests MODIFY COLUMN status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'");
    }
};
