<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
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
