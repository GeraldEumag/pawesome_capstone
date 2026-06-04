<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('groomings')) {
            Schema::table('groomings', function (Blueprint $table) {
                if (!Schema::hasColumn('groomings', 'service_request_id')) {
                    $table->unsignedBigInteger('service_request_id')->nullable()->after('id');
                    $table->index('service_request_id', 'idx_groomings_service_request_id');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('groomings')) {
            Schema::table('groomings', function (Blueprint $table) {
                if (Schema::hasColumn('groomings', 'service_request_id')) {
                    $table->dropIndex('idx_groomings_service_request_id');
                    $table->dropColumn('service_request_id');
                }
            });
        }
    }
};
