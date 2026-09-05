<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add batch_deductions JSON column to service_item_usages so multi-batch
 * deductions are fully auditable (not just the primary batch_id).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_item_usages', function (Blueprint $table) {
            $table->json('batch_deductions')->nullable()->after('batch_id');
        });
    }

    public function down(): void
    {
        Schema::table('service_item_usages', function (Blueprint $table) {
            $table->dropColumn('batch_deductions');
        });
    }
};
