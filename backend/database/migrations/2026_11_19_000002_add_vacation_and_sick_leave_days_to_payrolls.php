<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->decimal('vacation_leave_days', 5, 1)->default(0)->after('paid_leave_days');
            $table->decimal('sick_leave_days', 5, 1)->default(0)->after('vacation_leave_days');
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->dropColumn(['vacation_leave_days', 'sick_leave_days']);
        });
    }
};
