<?php

namespace App\Console\Commands;

use App\Models\EmailDelivery;
use App\Services\EmailDeliveryService;
use Illuminate\Console\Command;

/**
 * Reconciles outbox state: expires overdue pending intents and marks
 * stale 'processing' rows (worker crash/timeout after possible provider
 * acceptance) as 'unknown' for manual review — never auto-resent.
 */
class ReconcileEmailDeliveries extends Command
{
    protected $signature = 'email-deliveries:reconcile';

    protected $description = 'Expire overdue deliveries and flag stale processing rows as unknown';

    public function handle(EmailDeliveryService $deliveries): int
    {
        $result = $deliveries->reconcile();
        $this->info("Expired {$result['expired']} pending deliveries; marked {$result['unknown']} stale processing deliveries as unknown.");

        EmailDelivery::selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status')
            ->each(fn ($count, $status) => $this->line("  {$status}: {$count}"));

        return self::SUCCESS;
    }
}
