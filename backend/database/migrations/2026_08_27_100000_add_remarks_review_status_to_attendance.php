<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            if (!Schema::hasColumn('attendance', 'remarks')) {
                $table->text('remarks')->nullable()->after('notes');
            }
            if (!Schema::hasColumn('attendance', 'review_status')) {
                $table->string('review_status')->default('pending')->after('remarks');
            }
        });
    }

    public function down(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->dropColumn(['remarks', 'review_status']);
        });
    }
};
