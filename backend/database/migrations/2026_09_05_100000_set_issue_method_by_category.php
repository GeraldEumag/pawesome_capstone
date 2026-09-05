<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Backfill issue_method for existing inventory items based on the legacy
 * category-based FEFO logic, so the new needsFefo() behavior is backward
 * compatible.
 *
 * Legacy rule: Food, Health, Grooming → FEFO; everything else → FIFO.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('inventory_items')
            ->whereIn('category', ['Food', 'Health', 'Grooming'])
            ->update(['issue_method' => 'FEFO', 'requires_expiry_tracking' => true]);

        DB::table('inventory_items')
            ->whereNotIn('category', ['Food', 'Health', 'Grooming'])
            ->update(['issue_method' => 'FIFO', 'requires_expiry_tracking' => false]);
    }

    public function down(): void
    {
        DB::table('inventory_items')
            ->update(['issue_method' => 'FEFO', 'requires_expiry_tracking' => false]);
    }
};
