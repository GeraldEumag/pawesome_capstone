<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('service_requests') && !Schema::hasColumn('service_requests', 'pet_type')) {
            Schema::table('service_requests', function (Blueprint $table) {
                $table->string('pet_type', 50)->nullable()->after('pet_name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('service_requests') && Schema::hasColumn('service_requests', 'pet_type')) {
            Schema::table('service_requests', function (Blueprint $table) {
                $table->dropColumn('pet_type');
            });
        }
    }
};
