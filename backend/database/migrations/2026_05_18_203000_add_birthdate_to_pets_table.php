<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pets', function (Blueprint $table) {
            if (!Schema::hasColumn('pets', 'birthdate')) {
                $table->date('birthdate')->nullable()->after('breed');
            }

            if (!Schema::hasColumn('pets', 'deleted_at')) {
                $table->softDeletes();
            }
        });
    }

    public function down(): void
    {
        Schema::table('pets', function (Blueprint $table) {
            if (Schema::hasColumn('pets', 'birthdate')) {
                $table->dropColumn('birthdate');
            }

            if (Schema::hasColumn('pets', 'deleted_at')) {
                $table->dropSoftDeletes();
            }
        });
    }
};
