<?php

namespace App\Console\Commands;

use App\Services\ConfinementAccrualService;
use Illuminate\Console\Command;

/**
 * Daily inpatient accrual: bills each open confinement's daily_rate onto the
 * linked visit's running invoice (Phase D).
 */
class AccrueConfinementDaily extends Command
{
    protected $signature = 'confinement:accrue-daily';
    protected $description = 'Accrue daily inpatient charges for open confinements';

    public function handle(): int
    {
        $results = ConfinementAccrualService::accrueAll();
        $totalDays = array_sum(array_column($results, 'accrued_days'));
        $totalAmount = array_sum(array_column($results, 'amount'));

        $this->info(sprintf(
            'Accrued %d inpatient day(s) across %d confinement(s): ₱%s',
            $totalDays,
            count($results),
            number_format($totalAmount, 2)
        ));

        return self::SUCCESS;
    }
}
