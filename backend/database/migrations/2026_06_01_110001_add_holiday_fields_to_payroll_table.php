<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (!Schema::hasColumn('payrolls', 'regular_holiday_pay')) {
                $table->decimal('regular_holiday_pay', 10, 2)->nullable()->default(0)->after('overtime_pay');
            }
            if (!Schema::hasColumn('payrolls', 'special_holiday_pay')) {
                $table->decimal('special_holiday_pay', 10, 2)->nullable()->default(0)->after('regular_holiday_pay');
            }
            if (!Schema::hasColumn('payrolls', 'night_differential')) {
                $table->decimal('night_differential', 10, 2)->nullable()->default(0)->after('special_holiday_pay');
            }
            if (!Schema::hasColumn('payrolls', 'regular_holiday_ot_pay')) {
                $table->decimal('regular_holiday_ot_pay', 10, 2)->nullable()->default(0)->after('night_differential');
            }
            if (!Schema::hasColumn('payrolls', 'special_holiday_ot_pay')) {
                $table->decimal('special_holiday_ot_pay', 10, 2)->nullable()->default(0)->after('regular_holiday_ot_pay');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->dropColumn([
                'regular_holiday_pay',
                'special_holiday_pay',
                'night_differential',
                'regular_holiday_ot_pay',
                'special_holiday_ot_pay',
            ]);
        });
    }
};
