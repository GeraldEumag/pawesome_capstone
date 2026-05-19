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
        Schema::table('boarding_room_reservations', function (Blueprint $table) {
            if (!Schema::hasColumn('boarding_room_reservations', 'source_type')) {
                $table->string('source_type')->nullable()->after('id');
            }
            if (!Schema::hasColumn('boarding_room_reservations', 'source_id')) {
                $table->unsignedBigInteger('source_id')->nullable()->after('source_type');
            }
            
            // Add index if it doesn't exist
            if (!Schema::hasIndex('boarding_room_reservations', 'room_reservations_source')) {
                $table->index(['source_type', 'source_id'], 'room_reservations_source');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('boarding_room_reservations', function (Blueprint $table) {
            $table->dropIndex('room_reservations_source');
            $table->dropColumn(['source_type', 'source_id']);
        });
    }
};
