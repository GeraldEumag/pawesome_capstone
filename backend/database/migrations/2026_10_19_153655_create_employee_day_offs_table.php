<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-person weekly day-offs (rest days).
 *
 * The business operates 7 days a week; each staff member gets assigned
 * recurring weekday(s) off. Rows may reference either a users.id (account
 * staff) or employees.id (non-account staff), matching the dual-ownership
 * pattern used by attendance and payroll.
 *
 * A person with NO configured rows falls back to the company-wide
 * work_days setting (legacy Mon–Sat behaviour).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_day_offs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->cascadeOnDelete();
            $table->unsignedTinyInteger('weekday'); // 0 = Sunday … 6 = Saturday
            $table->timestamps();

            $table->unique(['user_id', 'weekday']);
            $table->unique(['employee_id', 'weekday']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_day_offs');
    }
};
