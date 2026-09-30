<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add Philippine government ID numbers to the users table so that
 * account-based staff (managers, cashiers, etc.) appear correctly on
 * SSS R3, PhilHealth RF-1, and Pag-IBIG RF-1 remittance reports.
 *
 * Non-account staff already have these on the employees table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('sss_no', 20)->nullable()->after('employee_no');
            $table->string('philhealth_no', 20)->nullable()->after('sss_no');
            $table->string('pagibig_no', 20)->nullable()->after('philhealth_no');
            $table->string('tin', 20)->nullable()->after('pagibig_no');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['sss_no', 'philhealth_no', 'pagibig_no', 'tin']);
        });
    }
};
