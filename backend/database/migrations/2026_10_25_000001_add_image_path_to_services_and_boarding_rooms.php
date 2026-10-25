<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->string('image_path')->nullable()->after('description');
        });
        Schema::table('boarding_rooms', function (Blueprint $table) {
            $table->string('image_path')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('services', fn (Blueprint $t) => $t->dropColumn('image_path'));
        Schema::table('boarding_rooms', fn (Blueprint $t) => $t->dropColumn('image_path'));
    }
};
