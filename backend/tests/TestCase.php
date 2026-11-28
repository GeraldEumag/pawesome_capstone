<?php

namespace Tests;

use App\Services\BookingAvailabilityService;
use App\Services\ServiceDurationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
    /**
     * Earliest bookable store date at least $daysAhead days out.
     *
     * Booking endpoints reject public holidays and closed days, so tests must
     * not hardcode now()->addDays(n) — the result can land on a holiday
     * (e.g. Nov 30 = Bonifacio Day) and fail only on certain calendar dates.
     */
    protected function nextBookableDate(int $daysAhead = 1): Carbon
    {
        $date = Carbon::now(ServiceDurationService::STORE_TIMEZONE)
            ->addDays($daysAhead)
            ->startOfDay();

        while (!BookingAvailabilityService::isBookableDate($date->toDateString())) {
            $date->addDay();
        }

        return $date;
    }

    /**
     * Existing feature tests model the active POS client, which submits one
     * idempotency key per logical sale. Tests for the required-key guard pass
     * an explicitly empty header.
     */
    public function postJson($uri, array $data = [], array $headers = [], $options = 0)
    {
        $path = parse_url($uri, PHP_URL_PATH);
        $hasIdempotencyHeader = collect(array_keys($headers))
            ->contains(fn ($name) => strcasecmp((string) $name, 'Idempotency-Key') === 0);

        if ($path === '/api/cashier/pos/transaction' && !$hasIdempotencyHeader) {
            $headers['Idempotency-Key'] = (string) Str::uuid();
        }

        return parent::postJson($uri, $data, $headers, $options);
    }
}
