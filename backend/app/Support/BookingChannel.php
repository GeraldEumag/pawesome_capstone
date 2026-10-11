<?php

namespace App\Support;

use App\Models\User;

/**
 * Authoritative booking channel values. The cashier payment gate uses these
 * to decide whether a booking may be settled with counter cash: 'walk_in'
 * bookings may always pay cash; 'online' bookings must pay via verified
 * e-wallet proof unless their proof was rejected (counter fallback).
 */
final class BookingChannel
{
    public const ONLINE = 'online';
    public const WALK_IN = 'walk_in';

    /**
     * Channel for a record created by the given actor: customers book
     * online; any staff role creating a booking is a counter/walk-in entry.
     */
    public static function forUser(?User $user): string
    {
        return ($user && $user->role === 'customer') ? self::ONLINE : self::WALK_IN;
    }
}
