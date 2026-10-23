<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a prescription line to the inventory item it came from so vets can
 * pick in-store medication from a dropdown while still allowing free-text
 * entries for medication the clinic does not stock.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->unsignedBigInteger('inventory_item_id')
                ->nullable()
                ->after('medication_name')
                ->index();
            $table->foreign('inventory_item_id')
                ->references('id')
                ->on('inventory_items')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->dropForeign(['inventory_item_id']);
            $table->dropIndex(['inventory_item_id']);
            $table->dropColumn('inventory_item_id');
        });
    }
};
