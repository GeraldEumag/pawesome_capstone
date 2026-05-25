<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('boardings', function (Blueprint $table) {
            $table->timestamp('vaccination_card_verified_at')->nullable()->after('vaccination_card');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('boardings', function (Blueprint $table) {
            $table->dropColumn('vaccination_card_verified_at');
        });
    }
};
