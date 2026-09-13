<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Allow attendance and payroll rows to belong to either a user account
     * (user_id) or a non-account employee record (employee_id).
     */
    public function up(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            if (!Schema::hasColumn('attendance', 'employee_id')) {
                $table->foreignId('employee_id')
                    ->nullable()
                    ->after('user_id')
                    ->constrained('employees')
                    ->cascadeOnDelete();
            }
        });

        Schema::table('attendance', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->change();
        });

        Schema::table('attendance', function (Blueprint $table) {
            $table->unique(['employee_id', 'date'], 'attendance_employee_date_unique');
        });

        Schema::table('payrolls', function (Blueprint $table) {
            if (!Schema::hasColumn('payrolls', 'employee_id')) {
                $table->foreignId('employee_id')
                    ->nullable()
                    ->after('user_id')
                    ->constrained('employees')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (Schema::hasColumn('payrolls', 'employee_id')) {
                $table->dropConstrainedForeignId('employee_id');
            }
        });

        Schema::table('attendance', function (Blueprint $table) {
            $table->dropUnique('attendance_employee_date_unique');
            if (Schema::hasColumn('attendance', 'employee_id')) {
                $table->dropConstrainedForeignId('employee_id');
            }
            $table->foreignId('user_id')->nullable(false)->change();
        });
    }
};
