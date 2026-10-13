<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('grooming_appointments') && !Schema::hasColumn('grooming_appointments', 'appointment_time')) {
            Schema::table('grooming_appointments', function (Blueprint $table) {
                $table->time('appointment_time')->nullable()->after('appointment_date');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('grooming_appointments') && Schema::hasColumn('grooming_appointments', 'appointment_time')) {
            Schema::table('grooming_appointments', function (Blueprint $table) {
                $table->dropColumn('appointment_time');
            });
        }
    }
};
