<?php

namespace App\Console\Commands;

use App\Models\Employee;
use App\Models\User;
use App\Services\Payroll\PayrollComputationService;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * Accrue 13th month pay for all active staff for a given year+month.
 * Typically triggered after each monthly payroll run.
 *
 * Usage:
 *   php artisan payroll:accrue-13th-month 2026 9
 *   php artisan payroll:accrue-13th-month   (defaults to current year/month)
 */
class AccrueThirteenthMonth extends Command
{
    protected $signature   = 'payroll:accrue-13th-month {year?} {month?}';
    protected $description = 'Accrue 13th month pay for all active staff for a given year and month';

    public function handle(): int
    {
        $year  = (int) ($this->argument('year')  ?? now()->year);
        $month = (int) ($this->argument('month') ?? now()->month);

        if ($month < 1 || $month > 12) {
            $this->error("Invalid month: {$month}");
            return 1;
        }

        $service = app(PayrollComputationService::class);
        $count   = 0;

        $service->staffEmployees()->each(function (User $user) use ($service, $year, $month, &$count) {
            if ($user->base_salary > 0) {
                $service->accrue13thMonth($user, $year, $month, (float) $user->base_salary);
                $count++;
            }
        });

        Employee::where('is_active', true)->each(function (Employee $emp) use ($service, $year, $month, &$count) {
            if ($emp->base_salary > 0) {
                $service->accrue13thMonth($emp, $year, $month, (float) $emp->base_salary);
                $count++;
            }
        });

        $this->info("payroll:accrue-13th-month done — accrued for {$count} employees for {$year}-{$month}.");
        return 0;
    }
}
