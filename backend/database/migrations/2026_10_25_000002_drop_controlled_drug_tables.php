<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Controlled-drug register feature removed — reclassify any leftover
        // items as regular medicines, then drop the append-only tables.
        DB::table('inventory_items')
            ->where('item_class', 'controlled_drug')
            ->update(['item_class' => 'medicine']);

        Schema::dropIfExists('controlled_drug_counts');
        Schema::dropIfExists('controlled_drug_register');
    }

    public function down(): void
    {
        // Tables intentionally not recreated — feature removed.
    }
};
