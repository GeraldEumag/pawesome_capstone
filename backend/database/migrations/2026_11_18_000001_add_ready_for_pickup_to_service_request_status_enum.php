<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The grooming workflow PATCHes a service request to `ready_for_pickup`, but
 * the status enum never included that value — on MySQL 8 strict mode the
 * UPDATE failed with "Data truncated for column 'status'" and surfaced as a
 * 500 (on non-strict MariaDB it silently stored ''). The `ready_for_pickup_at`
 * column and the receptionist endpoint already exist; only the enum was
 * missing the value.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE service_requests MODIFY COLUMN status ENUM('pending','scheduled','approved','rejected','cancelled','canceled','completed','paid','confirmed','rescheduled','in_progress','checked_in','ready_for_pickup') NOT NULL DEFAULT 'pending'");
    }

    public function down(): void
    {
        if (DB::table('service_requests')->where('status', 'ready_for_pickup')->exists()) {
            throw new RuntimeException('Cannot revert service request statuses while records use ready_for_pickup.');
        }

        DB::statement("ALTER TABLE service_requests MODIFY COLUMN status ENUM('pending','scheduled','approved','rejected','cancelled','canceled','completed','paid','confirmed','rescheduled','in_progress','checked_in') NOT NULL DEFAULT 'pending'");
    }
};
