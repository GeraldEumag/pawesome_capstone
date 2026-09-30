<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The work_schedules table (per-employee shift scheduling) is being retired.
 * The company uses a single fixed schedule for all staff, now stored in
 * system_settings and accessed via App\Support\CompanySchedule.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('work_schedules');
    }

    public function down(): void
    {
        Schema::create('work_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->onDelete('cascade');
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->tinyInteger('day_of_week');
            $table->time('shift_start')->nullable();
            $table->time('shift_end')->nullable();
            $table->integer('break_minutes')->default(60);
            $table->boolean('is_off_day')->default(false);
            $table->timestamps();
        });
    }
};
