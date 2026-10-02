<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * PaymentVerificationService::rejectTablePayment writes rejected_by /
     * rejected_at / rejection_reason to boardings, appointments, groomings,
     * and medical_confinements. boardings and medical_confinements already
     * have these columns; appointments and groomings were missed.
     */
    public function up(): void
    {
        foreach (['appointments', 'groomings'] as $tableName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                if (!Schema::hasColumn($tableName, 'rejected_by')) {
                    $table->unsignedBigInteger('rejected_by')->nullable()->after('verified_at');
                }
                if (!Schema::hasColumn($tableName, 'rejected_at')) {
                    $table->timestamp('rejected_at')->nullable()->after('rejected_by');
                }
                if (!Schema::hasColumn($tableName, 'rejection_reason')) {
                    $table->text('rejection_reason')->nullable()->after('rejected_at');
                }
            });
        }
    }

    public function down(): void
    {
        foreach (['appointments', 'groomings'] as $tableName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                $columns = array_values(array_filter(
                    ['rejected_by', 'rejected_at', 'rejection_reason'],
                    fn ($column) => Schema::hasColumn($tableName, $column)
                ));

                if ($columns !== []) {
                    $table->dropColumn($columns);
                }
            });
        }
    }
};
