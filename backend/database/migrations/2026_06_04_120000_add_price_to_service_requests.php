<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('service_requests') && !Schema::hasColumn('service_requests', 'price')) {
            Schema::table('service_requests', function (Blueprint $table) {
                $table->decimal('price', 10, 2)->nullable()->after('service_name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('service_requests') && Schema::hasColumn('service_requests', 'price')) {
            Schema::table('service_requests', function (Blueprint $table) {
                $table->dropColumn('price');
            });
        }
    }
};
