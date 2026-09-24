<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('payrolls')) {
            return;
        }

        $duplicateUserPeriods = DB::table('payrolls')
            ->whereNotNull('user_id')
            ->selectRaw('user_id, DATE(pay_period_start) as period_start, DATE(pay_period_end) as period_end')
            ->groupBy('user_id')
            ->groupByRaw('DATE(pay_period_start), DATE(pay_period_end)')
            ->havingRaw('COUNT(*) > 1')
            ->exists();
        $duplicateEmployeePeriods = DB::table('payrolls')
            ->whereNotNull('employee_id')
            ->selectRaw('employee_id, DATE(pay_period_start) as period_start, DATE(pay_period_end) as period_end')
            ->groupBy('employee_id')
            ->groupByRaw('DATE(pay_period_start), DATE(pay_period_end)')
            ->havingRaw('COUNT(*) > 1')
            ->exists();

        if ($duplicateUserPeriods || $duplicateEmployeePeriods) {
            throw new \RuntimeException('Cannot enforce unique payroll periods until existing duplicate records are reconciled.');
        }

        Schema::table('payrolls', function (Blueprint $table) {
            $table->unique(['user_id', 'pay_period_start', 'pay_period_end'], 'payroll_user_period_unique');
            $table->unique(['employee_id', 'pay_period_start', 'pay_period_end'], 'payroll_employee_period_unique');
            $table->dropIndex('payrolls_user_id_pay_period_start_pay_period_end_index');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('payrolls')) {
            return;
        }

        Schema::table('payrolls', function (Blueprint $table) {
            $table->index(['user_id', 'pay_period_start', 'pay_period_end'], 'payrolls_user_id_pay_period_start_pay_period_end_index');
            $table->dropUnique('payroll_user_period_unique');
            $table->dropUnique('payroll_employee_period_unique');
        });
    }
};
