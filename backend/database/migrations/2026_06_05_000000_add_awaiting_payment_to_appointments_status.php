<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Converts appointments.status from enum to string so new statuses
     * (awaiting_payment, in_consultation, etc.) can be stored.
     */
    public function up(): void
    {
        if (!Schema::hasTable('appointments')) {
            return;
        }

        Schema::table('appointments', function (Blueprint $table) {
            $table->string('status', 50)->default('pending')->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('appointments')) {
            return;
        }

        Schema::table('appointments', function (Blueprint $table) {
            $table->enum('status', [
                'pending', 'approved', 'scheduled', 'in_progress', 'treated',
                'completed', 'cancelled', 'rejected', 'no_show',
            ])->default('pending')->change();
        });
    }
};
