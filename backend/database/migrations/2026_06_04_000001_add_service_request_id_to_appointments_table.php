<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('appointments')) {
            Schema::table('appointments', function (Blueprint $table) {
                if (!Schema::hasColumn('appointments', 'service_request_id')) {
                    $table->unsignedBigInteger('service_request_id')->nullable()->after('id');
                    $table->index('service_request_id', 'idx_appointments_service_request_id');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('appointments')) {
            Schema::table('appointments', function (Blueprint $table) {
                if (Schema::hasColumn('appointments', 'service_request_id')) {
                    $table->dropIndex('idx_appointments_service_request_id');
                    $table->dropColumn('service_request_id');
                }
            });
        }
    }
};
