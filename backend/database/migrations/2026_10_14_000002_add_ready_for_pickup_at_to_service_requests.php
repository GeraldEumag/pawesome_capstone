<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('service_requests') && !Schema::hasColumn('service_requests', 'ready_for_pickup_at')) {
            Schema::table('service_requests', function (Blueprint $table) {
                $table->timestamp('ready_for_pickup_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('service_requests', 'ready_for_pickup_at')) {
            Schema::table('service_requests', function (Blueprint $table) {
                $table->dropColumn('ready_for_pickup_at');
            });
        }
    }
};
