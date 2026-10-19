<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Industry payroll fields: rest-day premiums, undertime, non-taxable
 * allowances, employer statutory shares, incomplete-punch flags and a loan
 * settlement guard. Day-count columns move to decimal(5,1) to support
 * half-day leave.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->decimal('rest_day_pay', 10, 2)->default(0)->after('night_differential');
            $table->decimal('rest_day_ot_pay', 10, 2)->default(0)->after('special_holiday_ot_pay');
            $table->decimal('non_taxable_allowances', 12, 2)->default(0)->after('allowances');
            $table->decimal('undertime_deductions', 12, 2)->default(0)->after('absent_deductions');
            $table->unsignedInteger('undertime_minutes')->default(0)->after('undertime_deductions');
            $table->unsignedSmallInteger('incomplete_punch_days')->default(0)->after('paid_leave_days');
            $table->decimal('sss_er_share', 12, 2)->default(0)->after('pagibig_contribution');
            $table->decimal('philhealth_er_share', 12, 2)->default(0)->after('sss_er_share');
            $table->decimal('pagibig_er_share', 12, 2)->default(0)->after('philhealth_er_share');
            $table->boolean('loans_settled')->default(false)->after('cash_advance');
        });

        Schema::table('payrolls', function (Blueprint $table) {
            $table->decimal('working_days', 5, 1)->default(0)->change();
            $table->decimal('present_days', 5, 1)->default(0)->change();
            $table->decimal('absent_days', 5, 1)->default(0)->change();
            $table->decimal('paid_leave_days', 5, 1)->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->integer('working_days')->default(0)->change();
            $table->integer('present_days')->default(0)->change();
            $table->integer('absent_days')->default(0)->change();
            $table->unsignedSmallInteger('paid_leave_days')->default(0)->change();
        });

        Schema::table('payrolls', function (Blueprint $table) {
            $table->dropColumn([
                'rest_day_pay',
                'rest_day_ot_pay',
                'non_taxable_allowances',
                'undertime_deductions',
                'undertime_minutes',
                'incomplete_punch_days',
                'sss_er_share',
                'philhealth_er_share',
                'pagibig_er_share',
                'loans_settled',
            ]);
        });
    }
};
