<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Normalize existing boarding reservations to same-day stays.
 *
 * The store operates 9:00 AM - 7:00 PM only, so check-out always happens
 * on the check-in date. Open/future bookings get check_out = check_in;
 * in-progress stays check out today; historical records are untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('boardings') && Schema::hasColumn('boardings', 'check_out')) {
            $setDays = Schema::hasColumn('boardings', 'number_of_days')
                ? ", number_of_days = 1"
                : "";

            // In-progress stays end today per the same-day policy
            DB::statement(
                "UPDATE boardings SET check_out = CURDATE(){$setDays}
                 WHERE check_out IS NOT NULL AND check_out <> check_in
                   AND status IN ('checked_in', 'in_care', 'in_stay', 'ready_for_pickup')"
            );

            // Open/future bookings become same-day
            DB::statement(
                "UPDATE boardings SET check_out = check_in{$setDays}
                 WHERE (check_out IS NULL OR check_out <> check_in)
                   AND status NOT IN ('checked_in', 'in_care', 'in_stay', 'ready_for_pickup',
                                      'checked_out', 'completed', 'cancelled', 'rejected', 'archived')"
            );
        }

        if (Schema::hasTable('boarding_room_reservations')) {
            DB::statement(
                "UPDATE boarding_room_reservations SET check_out_date = check_in_date
                 WHERE check_out_date IS NOT NULL AND check_out_date <> check_in_date
                   AND status NOT IN ('checked_out', 'completed', 'cancelled', 'rejected')"
            );
        }
    }

    public function down(): void
    {
        // Data normalization is not reversible; original check-out dates are not retained.
    }
};
