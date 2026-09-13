<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Non-account staff records (employees without login accounts).
     */
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->string('employee_no', 20)->unique();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();

            // Personal information
            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('last_name');
            $table->string('suffix')->nullable();
            $table->date('birthdate')->nullable();
            $table->string('gender', 20)->nullable();
            $table->string('civil_status', 30)->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->string('emergency_contact_name')->nullable();
            $table->string('emergency_contact_phone', 30)->nullable();

            // Employment
            $table->string('position')->nullable();
            $table->string('department')->nullable();
            $table->date('hire_date')->nullable();
            $table->string('employment_status', 30)->default('probationary');
            $table->string('employment_type', 30)->default('full_time');
            $table->boolean('is_active')->default(true);

            // Payroll
            $table->decimal('base_salary', 12, 2)->default(0);
            $table->decimal('hourly_rate', 10, 2)->nullable();

            // Government IDs
            $table->string('sss_no', 20)->nullable();
            $table->string('philhealth_no', 20)->nullable();
            $table->string('pagibig_no', 20)->nullable();
            $table->string('tin_no', 20)->nullable();

            $table->timestamps();

            $table->index(['is_active', 'department']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};
