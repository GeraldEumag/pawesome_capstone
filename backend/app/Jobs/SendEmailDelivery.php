<?php

namespace App\Jobs;

use App\Services\EmailDeliveryService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Sends one email_deliveries row. The job carries only the delivery ID —
 * token-bearing payloads stay encrypted at rest — and delegates all
 * claim/send/retry semantics to EmailDeliveryService so concurrent
 * workers cannot double-send.
 */
class SendEmailDelivery implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Retries are governed by the delivery row, not the job. */
    public $tries = 1;

    public $timeout = 30;

    public function __construct(public int $deliveryId)
    {
        $this->onQueue('emails');
    }

    public function handle(EmailDeliveryService $deliveries): void
    {
        $deliveries->send(
            $this->deliveryId,
            'worker:' . ($this->job?->getJobId() ?? 'local')
        );
    }
}
