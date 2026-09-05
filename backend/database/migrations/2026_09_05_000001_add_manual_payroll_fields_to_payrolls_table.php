<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (!Schema::hasColumn('payrolls', 'employment_type')) {
                $table->enum('employment_type', ['regular', 'part_time', 'contractual'])
                    ->default('regular')
                    ->after('position');
            }

            if (!Schema::hasColumn('payrolls', 'rate_type')) {
                $table->enum('rate_type', ['daily', 'hourly', 'monthly'])
                    ->default('monthly')
                    ->after('employment_type');
            }

            if (!Schema::hasColumn('payrolls', 'commission')) {
                $table->decimal('commission', 12, 2)->default(0)->after('allowances');
            }

            if (!Schema::hasColumn('payrolls', 'other_earnings')) {
                $table->decimal('other_earnings', 12, 2)->default(0)->after('commission');
            }

            if (!Schema::hasColumn('payrolls', 'salary_loan')) {
                $table->decimal('salary_loan', 12, 2)->default(0)->after('absent_deductions');
            }

            if (!Schema::hasColumn('payrolls', 'cash_advance')) {
                $table->decimal('cash_advance', 12, 2)->default(0)->after('salary_loan');
            }

            if (!Schema::hasColumn('payrolls', 'payment_reference')) {
                $table->string('payment_reference', 100)->nullable()->after('payment_method');
            }

            if (!Schema::hasColumn('payrolls', 'approved_by')) {
                $table->foreignId('approved_by')
                    ->nullable()
                    ->constrained('users')
                    ->onDelete('set null')
                    ->after('processed_by');
            }

            if (!Schema::hasColumn('payrolls', 'approved_at')) {
                $table->timestamp('approved_at')->nullable()->after('approved_by');
            }

            if (!Schema::hasColumn('payrolls', 'manual_attendance')) {
                $table->json('manual_attendance')->nullable()->after('approved_at');
            }
        });

        // Expand status enum to include 'approved' (MySQL/MariaDB)
        $driver = DB::getDriverName();
        if ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement("ALTER TABLE payrolls MODIFY COLUMN status ENUM('draft','processing','pending','approved','paid','cancelled') NOT NULL DEFAULT 'draft'");
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();
        if ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement("ALTER TABLE payrolls MODIFY COLUMN status ENUM('draft','processing','pending','paid','cancelled') NOT NULL DEFAULT 'draft'");
        }

        Schema::table('payrolls', function (Blueprint $table) {
            if (Schema::hasColumn('payrolls', 'manual_attendance')) {
                $table->dropColumn('manual_attendance');
            }
            if (Schema::hasColumn('payrolls', 'approved_at')) {
                $table->dropColumn('approved_at');
            }
            if (Schema::hasColumn('payrolls', 'approved_by')) {
                $table->dropForeign(['approved_by']);
                $table->dropColumn('approved_by');
            }
            if (Schema::hasColumn('payrolls', 'payment_reference')) {
                $table->dropColumn('payment_reference');
            }
            if (Schema::hasColumn('payrolls', 'cash_advance')) {
                $table->dropColumn('cash_advance');
            }
            if (Schema::hasColumn('payrolls', 'salary_loan')) {
                $table->dropColumn('salary_loan');
            }
            if (Schema::hasColumn('payrolls', 'other_earnings')) {
                $table->dropColumn('other_earnings');
            }
            if (Schema::hasColumn('payrolls', 'commission')) {
                $table->dropColumn('commission');
            }
            if (Schema::hasColumn('payrolls', 'rate_type')) {
                $table->dropColumn('rate_type');
            }
            if (Schema::hasColumn('payrolls', 'employment_type')) {
                $table->dropColumn('employment_type');
            }
        });
    }
};
