<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('inventory_batches') || !Schema::hasColumn('inventory_batches', 'status')) {
            return;
        }

        Schema::table('inventory_batches', function (Blueprint $table) {
            $table->enum('status', ['active', 'expired', 'depleted', 'disposed', 'audit_adjusted'])
                ->default('active')
                ->change();
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('inventory_batches') || !Schema::hasColumn('inventory_batches', 'status')) {
            return;
        }

        if (DB::table('inventory_batches')->where('status', 'audit_adjusted')->exists()) {
            throw new \RuntimeException('Cannot roll back while audit-adjusted inventory batches exist.');
        }

        Schema::table('inventory_batches', function (Blueprint $table) {
            $table->enum('status', ['active', 'expired', 'depleted', 'disposed'])
                ->default('active')
                ->change();
        });
    }
};
