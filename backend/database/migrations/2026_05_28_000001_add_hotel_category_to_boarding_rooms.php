<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('boarding_rooms', function (Blueprint $table) {
            $table->string('hotel_category')->nullable()->after('room_type');
        });

        // Back-fill existing rows based on room_type
        DB::table('boarding_rooms')
            ->whereIn('room_type', ['dog_standard', 'dog_large', 'dog_family'])
            ->update(['hotel_category' => 'dog_hotel']);

        DB::table('boarding_rooms')
            ->whereIn('room_type', ['cat_condo', 'cat_suite'])
            ->update(['hotel_category' => 'cat_hotel']);

        DB::table('boarding_rooms')
            ->whereIn('room_type', ['daycare_dog', 'daycare_cat', 'daycare_mixed'])
            ->update(['hotel_category' => 'daycare']);

        DB::table('boarding_rooms')
            ->where('room_type', 'small_pet')
            ->update(['hotel_category' => 'other']);
    }

    public function down(): void
    {
        Schema::table('boarding_rooms', function (Blueprint $table) {
            $table->dropColumn('hotel_category');
        });
    }
};
