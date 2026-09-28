<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Add new PH-mandated leave types to the leave_requests.type enum
 * and add half_day, attachment_path, days_counted columns.
 */
return new class extends Migration
{
    public function up(): void
    {
        // MySQL: modify ENUM to include new types
        DB::statement("ALTER TABLE leave_requests MODIFY COLUMN type ENUM(
            'sick_leave','vacation_leave','emergency_leave',
            'maternity_leave','paternity_leave','bereavement_leave',
            'service_incentive_leave','solo_parent_leave',
            'magna_carta_leave','special_leave_benefit','unpaid_leave'
        ) NOT NULL DEFAULT 'sick_leave'");

        Schema::table('leave_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('leave_requests', 'half_day')) {
                $table->tinyInteger('half_day')->default(0)->after('reason')
                      ->comment('0=full day, 1=AM half, 2=PM half');
            }
            if (!Schema::hasColumn('leave_requests', 'attachment_path')) {
                $table->string('attachment_path')->nullable()->after('half_day');
            }
            if (!Schema::hasColumn('leave_requests', 'days_counted')) {
                $table->decimal('days_counted', 5, 1)->default(1)->after('attachment_path')
                      ->comment('Computed working days this leave covers');
            }
        });
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE leave_requests MODIFY COLUMN type ENUM(
            'sick_leave','vacation_leave','emergency_leave',
            'maternity_leave','paternity_leave','bereavement_leave'
        ) NOT NULL DEFAULT 'sick_leave'");

        Schema::table('leave_requests', function (Blueprint $table) {
            foreach (['half_day', 'attachment_path', 'days_counted'] as $col) {
                if (Schema::hasColumn('leave_requests', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
