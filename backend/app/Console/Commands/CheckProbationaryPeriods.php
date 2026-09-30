<?php

namespace App\Console\Commands;

use App\Models\Employee;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Daily job: alert manager when an employee's probationary period is ending soon.
 * Philippine law: max 6 months (180 days) probationary period.
 *
 * Creates in-app notification records for the manager role.
 */
class CheckProbationaryPeriods extends Command
{
    protected $signature   = 'staff:check-probationary';
    protected $description = 'Alert manager when probationary period is ending within the configured alert window';

    public function handle(): int
    {
        $alertDays = (int) (DB::table('system_settings')
            ->where('key', 'probationary_alert_days')
            ->value('value') ?? 14);

        $today        = Carbon::today();
        $alertDate    = $today->copy()->addDays($alertDays);
        $endDate      = $today->copy()->addDays(180); // 6-month mark from hire
        $count        = 0;

        // Account users
        User::where('employment_status', 'probationary')
            ->where('is_active', true)
            ->whereNotNull('employment_date')
            ->each(function (User $user) use ($today, $alertDate, $alertDays, &$count) {
                $endOfProbation = Carbon::parse($user->employment_date)->addDays(180);
                if ($endOfProbation->between($today, $alertDate)) {
                    $this->createAlert($user->name, 'user', $user->id, $endOfProbation, $alertDays);
                    $count++;
                }
            });

        // Non-account employees
        Employee::where('employment_status', 'probationary')
            ->where('is_active', true)
            ->whereNotNull('hire_date')
            ->each(function (Employee $emp) use ($today, $alertDate, $alertDays, &$count) {
                $endOfProbation = Carbon::parse($emp->hire_date)->addDays(180);
                if ($endOfProbation->between($today, $alertDate)) {
                    $this->createAlert($emp->name, 'employee', $emp->id, $endOfProbation, $alertDays);
                    $count++;
                }
            });

        $this->info("staff:check-probationary done — {$count} alerts created.");
        return 0;
    }

    private function createAlert(string $name, string $type, int $id, Carbon $endDate, int $alertDays): void
    {
        $message = "⚠ Probationary period for {$name} ends on {$endDate->toFormattedDateString()} ({$alertDays} days notice). Please decide on regularization.";

        // Find all manager + admin users and create a notification for each
        User::whereIn('role', ['manager', 'admin', 'super_admin'])->each(function (User $mgr) use ($message, $name, $type, $id, $endDate) {
            DB::table('notifications')->insert([
                'id'             => \Illuminate\Support\Str::uuid(),
                'type'           => 'App\Notifications\ProbationaryAlertNotification',
                'notifiable_type' => User::class,
                'notifiable_id'  => $mgr->id,
                'data'           => json_encode([
                    'message'          => $message,
                    'person_name'      => $name,
                    'person_type'      => $type,
                    'person_id'        => $id,
                    'probation_end'    => $endDate->toDateString(),
                    'type'             => 'probationary_alert',
                ]),
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);
        });

        $this->line("  Alert created for {$name} — probation ends {$endDate->toDateString()}");
    }
}
