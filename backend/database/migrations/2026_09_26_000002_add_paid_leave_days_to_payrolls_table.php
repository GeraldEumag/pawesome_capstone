<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (!Schema::hasColumn('payrolls', 'paid_leave_days')) {
                $table->unsignedSmallInteger('paid_leave_days')->default(0)->after('absent_days');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (Schema::hasColumn('payrolls', 'paid_leave_days')) {
                $table->dropColumn('paid_leave_days');
            }
        });
    }
};
