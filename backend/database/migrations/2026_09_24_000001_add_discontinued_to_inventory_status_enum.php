<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('inventory_items') || !Schema::hasColumn('inventory_items', 'status')) {
            return;
        }

        Schema::table('inventory_items', function (Blueprint $table) {
            $table->enum('status', ['active', 'inactive', 'discontinued', 'archived'])
                ->default('active')
                ->change();
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('inventory_items') || !Schema::hasColumn('inventory_items', 'status')) {
            return;
        }

        if (DB::table('inventory_items')->where('status', 'discontinued')->exists()) {
            throw new \RuntimeException('Cannot roll back while discontinued inventory items exist.');
        }

        Schema::table('inventory_items', function (Blueprint $table) {
            $table->enum('status', ['active', 'inactive', 'archived'])
                ->default('active')
                ->change();
        });
    }
};
