<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Units of measurement for inventory items (panel §8.3).
 *
 * `unit` (added by the stock-movement migration) is the item's base unit
 * label (e.g. "piece", "tablet", "can"). `pack_size` and `box_size` are the
 * number of BASE units contained in one pack / one box. When set, stock
 * transactions may be entered in packs or boxes and are converted to base
 * units server-side before any quantity, batch or ledger write.
 *
 * Both columns are nullable: an item without them only supports base-unit
 * transactions, which keeps every existing item and flow unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            if (!Schema::hasColumn('inventory_items', 'pack_size')) {
                $table->unsignedInteger('pack_size')->nullable()->after('unit');
            }
            if (!Schema::hasColumn('inventory_items', 'box_size')) {
                $table->unsignedInteger('box_size')->nullable()->after('pack_size');
            }
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            if (Schema::hasColumn('inventory_items', 'box_size')) {
                $table->dropColumn('box_size');
            }
            if (Schema::hasColumn('inventory_items', 'pack_size')) {
                $table->dropColumn('pack_size');
            }
        });
    }
};
