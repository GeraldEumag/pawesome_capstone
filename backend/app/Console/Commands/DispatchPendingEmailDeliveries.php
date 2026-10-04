<?php

namespace App\Console\Commands;

use App\Services\EmailDeliveryService;
use Illuminate\Console\Command;

/**
 * Republishes due pending email deliveries whose queue publication was
 * missed or lost. Idempotent — the job claims the row atomically, so
 * overlapping sweeps cannot double-send.
 */
class DispatchPendingEmailDeliveries extends Command
{
    protected $signature = 'email-deliveries:dispatch {--limit=100 : Maximum deliveries to dispatch per run}';

    protected $description = 'Dispatch due pending email deliveries to the queue';

    public function handle(EmailDeliveryService $deliveries): int
    {
        $count = $deliveries->dispatchDue((int) $this->option('limit'));
        $this->info("Dispatched {$count} pending email deliveries.");

        return self::SUCCESS;
    }
}
