<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (!Schema::hasColumn('payrolls', 'employee_name')) {
                $table->string('employee_name')->nullable()->after('user_id');
            }
        });

        // Make user_id nullable (employees without accounts)
        $driver = DB::getDriverName();
        if ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement('ALTER TABLE payrolls MODIFY user_id BIGINT UNSIGNED NULL');
        } else {
            // SQLite fallback
            // SQLite doesn't support ALTER COLUMN easily; skip for non-MySQL
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();
        if ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement('ALTER TABLE payrolls MODIFY user_id BIGINT UNSIGNED NOT NULL');
        }

        Schema::table('payrolls', function (Blueprint $table) {
            if (Schema::hasColumn('payrolls', 'employee_name')) {
                $table->dropColumn('employee_name');
            }
        });
    }
};
