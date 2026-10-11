<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds an authoritative booking channel ('online' | 'walk_in') to every
 * cashier-payable booking table. Previously nothing distinguished a
 * customer-submitted online request from a receptionist walk-in, so cash
 * eligibility had to be inferred from payment_method — NULL read as "cash"
 * and let approved online bookings be collected at the counter.
 *
 * Legacy rows stay NULL: the cashier gate treats NULL as 'online'
 * (strictest) and the data-quality report lists them for manual
 * classification — no speculative bulk rewrite.
 */
return new class extends Migration
{
    private const TABLES = [
        'service_requests',
        'boardings',
        'groomings',
        'appointments',
        'medical_confinements',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (!Schema::hasTable($table) || Schema::hasColumn($table, 'booking_channel')) {
                continue;
            }
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->string('booking_channel', 20)->nullable()->index();
            });
        }

        // Positive-detection backfill only: boardings tied to a legacy
        // hotel_rooms row were booked at the walk-in desk (the online
        // flow reserves boarding_rooms via boarding_room_reservations).
        // Online boardings on legacy rooms are indistinguishable and are
        // intentionally left NULL → treated as 'online' at the gate.
        if (Schema::hasColumn('boardings', 'booking_channel')) {
            DB::table('boardings')
                ->whereNull('booking_channel')
                ->whereNotNull('hotel_room_id')
                ->update(['booking_channel' => 'walk_in']);
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'booking_channel')) {
                continue;
            }
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropIndex(['booking_channel']);
                $blueprint->dropColumn('booking_channel');
            });
        }
    }
};
