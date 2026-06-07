<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('inventory_batches')) {
            return;
        }

        Schema::table('inventory_batches', function (Blueprint $table) {
            $table->date('manufacturing_date')->nullable()->after('received_date');
            $table->string('supplier', 255)->nullable()->after('manufacturing_date');
            $table->decimal('unit_cost', 10, 2)->nullable()->after('supplier');
            $table->string('proof_photo', 255)->nullable()->after('unit_cost');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('inventory_batches')) {
            return;
        }

        Schema::table('inventory_batches', function (Blueprint $table) {
            $table->dropColumn(['manufacturing_date', 'supplier', 'unit_cost', 'proof_photo']);
        });
    }
};
