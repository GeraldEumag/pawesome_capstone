<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('groomings') && !Schema::hasColumn('groomings', 'appointment_id')) {
            Schema::table('groomings', function (Blueprint $table) {
                $table->foreignId('appointment_id')->nullable()->after('service_request_id')->constrained('appointments')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('groomings') && Schema::hasColumn('groomings', 'appointment_id')) {
            Schema::table('groomings', function (Blueprint $table) {
                $table->dropConstrainedForeignId('appointment_id');
            });
        }
    }
};
