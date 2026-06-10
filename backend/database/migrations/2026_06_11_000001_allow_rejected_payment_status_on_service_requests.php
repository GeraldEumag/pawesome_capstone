<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('service_requests', 'payment_status')) {
            return;
        }

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE service_requests MODIFY payment_status ENUM('unpaid','pending','partial','paid','rejected','refunded') NOT NULL DEFAULT 'unpaid'");
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('service_requests', 'payment_status')) {
            return;
        }

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE service_requests MODIFY payment_status ENUM('unpaid','pending','paid') NOT NULL DEFAULT 'unpaid'");
        }
    }
};
