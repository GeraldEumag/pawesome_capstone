<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private array $tables = [
        'service_requests',
        'customer_orders',
        'boardings',
        'appointments',
        'groomings',
        'medical_confinements',
    ];

    public function up(): void
    {
        foreach ($this->tables as $table) {
            if (!Schema::hasTable($table)) continue;

            Schema::table($table, function (Blueprint $table) {
                if (!Schema::hasColumn($table->getTable(), 'reference_number')) {
                    $table->string('reference_number')->nullable()->after('receipt_number');
                }
                if (!Schema::hasColumn($table->getTable(), 'verified_at')) {
                    $table->timestamp('verified_at')->nullable()->after('verified_by');
                }
            });
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $table) {
            if (!Schema::hasTable($table)) continue;

            Schema::table($table, function (Blueprint $table) {
                if (Schema::hasColumn($table->getTable(), 'reference_number')) {
                    $table->dropColumn('reference_number');
                }
                if (Schema::hasColumn($table->getTable(), 'verified_at')) {
                    $table->dropColumn('verified_at');
                }
            });
        }
    }
};
