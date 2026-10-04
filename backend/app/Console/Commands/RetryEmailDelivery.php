<?php

namespace App\Console\Commands;

use App\Models\EmailDelivery;
use App\Services\EmailDeliveryService;
use Illuminate\Console\Command;

/**
 * Privileged targeted retry for a single delivery. Terminal and
 * provider-accepted deliveries are refused outright; 'unknown' requires
 * --reconciled to confirm the operator verified no send occurred.
 */
class RetryEmailDelivery extends Command
{
    protected $signature = 'email-deliveries:retry
        {delivery : Delivery ID or UUID}
        {--reconciled : Confirm manual reconciliation verified the message was not sent}';

    protected $description = 'Retry a specific email delivery after validation';

    public function handle(EmailDeliveryService $deliveries): int
    {
        $key = $this->argument('delivery');
        $delivery = EmailDelivery::where('id', $key)->orWhere('uuid', $key)->first();

        if (!$delivery) {
            $this->error("Delivery not found: {$key}");
            return self::FAILURE;
        }

        [$ok, $reason] = $deliveries->requestRetry($delivery, (bool) $this->option('reconciled'));

        if (!$ok) {
            $this->error("Refused: {$reason}");
            return self::FAILURE;
        }

        $this->info("Delivery {$delivery->id} {$reason}.");

        return self::SUCCESS;
    }
}
