<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('boardings')) {
            Schema::table('boardings', function (Blueprint $table) {
                if (!Schema::hasColumn('boardings', 'vaccination_card')) {
                    $table->string('vaccination_card')->nullable()->after('notes');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('boardings') && Schema::hasColumn('boardings', 'vaccination_card')) {
            Schema::table('boardings', function (Blueprint $table) {
                $table->dropColumn('vaccination_card');
            });
        }
    }
};
