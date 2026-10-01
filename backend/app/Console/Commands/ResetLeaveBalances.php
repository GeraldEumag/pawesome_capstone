<?php

namespace App\Console\Commands;

use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Annual leave balance reset (runs January 1).
 *
 * - Resets all leave balances for the new year (seeds fresh rows).
 * - SIL: unused days from previous year → cash equivalent bonus entry in Jan payroll.
 *   (DOLE Labor Code Art. 95: unused SIL must be converted to cash at end of year)
 *
 * Usage:
 *   php artisan leave:annual-reset 2027
 */
class ResetLeaveBalances extends Command
{
    protected $signature   = 'leave:annual-reset {year?}';
    protected $description = 'Reset leave balances for the new year and convert unused SIL to cash';

    public function handle(): int
    {
        $newYear  = (int) ($this->argument('year') ?? now()->year);
        $prevYear = $newYear - 1;

        $this->info("Resetting leave balances for {$newYear} (previous year: {$prevYear})...");

        $count = 0;

        // Convert unused SIL to cash bonus for account users
        User::whereIn('role', [
            'manager', 'cashier', 'receptionist', 'veterinary',
            'inventory', 'payroll', 'staff', 'groomer',
            'super_receptionist', 'admin',
        ])->where('is_active', true)->each(function (User $user) use ($prevYear, $newYear, &$count) {
            $this->processSilCash($user->id, null, $prevYear, (float) $user->base_salary);
            LeaveBalance::seedForPerson($user->id, null, $newYear);
            $count++;
        });

        // Convert unused SIL to cash bonus for non-account employees
        Employee::where('is_active', true)->each(function (Employee $emp) use ($prevYear, $newYear, &$count) {
            $this->processSilCash(null, $emp->id, $prevYear, (float) $emp->base_salary);
            LeaveBalance::seedForPerson(null, $emp->id, $newYear);
            $count++;
        });

        $this->info("leave:annual-reset done — {$count} employees reset for {$newYear}.");
        return 0;
    }

    private function processSilCash(?int $userId, ?int $employeeId, int $year, float $baseSalary): void
    {
        $clause = $userId
            ? ['user_id' => $userId]
            : ['employee_id' => $employeeId];

        $sil = LeaveBalance::where($clause)
            ->where('leave_type', 'service_incentive_leave')
            ->where('year', $year)
            ->first();

        if (!$sil || (float) $sil->remaining_days <= 0 || $baseSalary <= 0) {
            return;
        }

        // Daily rate using divisor 26
        $dailyRate = $baseSalary / 26;
        $cashValue = round((float) $sil->remaining_days * $dailyRate, 2);

        // Record as a bonus in January payroll note — create a system_settings log or
        // store as a bonus flag. We insert a note into a simple JSON structure here.
        // In a full implementation this would create a payroll_bonus record.
        DB::table('system_settings')->updateOrInsert(
            ['key' => "sil_cash_{$year}_" . ($userId ?? 'emp' . $employeeId)],
            [
                'value'      => json_encode([
                    'user_id'     => $userId,
                    'employee_id' => $employeeId,
                    'year'        => $year,
                    'days'        => (float) $sil->remaining_days,
                    'cash_value'  => $cashValue,
                    'applied_at'  => now()->toDateString(),
                ]),
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );

        $this->line("  SIL cash for " . ($userId ? "user #{$userId}" : "employee #{$employeeId}") . ": {$sil->remaining_days} days = ₱{$cashValue}");
    }
}
