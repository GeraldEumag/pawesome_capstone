<?php

namespace App\Console\Commands;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use App\Support\CompanySchedule;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Nightly job: mark absent for all active staff who had no attendance punch
 * on the previous workday (or any past workday up to 7 days back).
 *
 * Runs at 23:30 daily via console schedule.
 */
class MarkDailyAbsent extends Command
{
    protected $signature   = 'attendance:mark-absent {--days=1 : How many past days to check (default 1)}';
    protected $description = 'Mark absent for scheduled staff who have no attendance record on past workdays';

    public function handle(): int
    {
        $days   = max(1, (int) $this->option('days'));
        $today  = Carbon::today();
        $marked = 0;

        for ($i = 1; $i <= $days; $i++) {
            $checkDate = $today->copy()->subDays($i);

            if (!CompanySchedule::isWorkday($checkDate)) {
                continue; // Skip off-days (Sunday, etc.)
            }

            $dateStr = $checkDate->toDateString();

            // Account users (staff roles)
            User::whereIn('role', [
                'manager', 'cashier', 'receptionist', 'veterinary',
                'inventory', 'payroll', 'staff', 'groomer',
                'super_receptionist', 'super_admin', 'admin',
            ])->where('is_active', true)->each(function (User $user) use ($dateStr, &$marked) {
                $hasRecord = Attendance::where('user_id', $user->id)
                    ->whereDate('date', $dateStr)
                    ->exists();

                // Also check if on approved leave
                $onLeave = DB::table('leave_requests')
                    ->where('user_id', $user->id)
                    ->where('status', 'approved')
                    ->whereDate('start_date', '<=', $dateStr)
                    ->whereDate('end_date', '>=', $dateStr)
                    ->exists();

                if (!$hasRecord && !$onLeave) {
                    Attendance::create([
                        'user_id' => $user->id,
                        'date'    => $dateStr,
                        'status'  => 'absent',
                        'source'  => 'auto',
                    ]);
                    $marked++;
                }
            });

            // Non-account employees
            Employee::where('is_active', true)->each(function (Employee $emp) use ($dateStr, &$marked) {
                $hasRecord = Attendance::where('employee_id', $emp->id)
                    ->whereDate('date', $dateStr)
                    ->exists();

                $onLeave = $emp->user_id !== null
                    && DB::table('leave_requests')
                        ->where('user_id', $emp->user_id)
                        ->where('status', 'approved')
                        ->whereDate('start_date', '<=', $dateStr)
                        ->whereDate('end_date', '>=', $dateStr)
                        ->exists();

                if (!$hasRecord && !$onLeave) {
                    Attendance::create([
                        'employee_id' => $emp->id,
                        'date'        => $dateStr,
                        'status'      => 'absent',
                        'source'      => 'auto',
                    ]);
                    $marked++;
                }
            });

            $this->line("  {$dateStr}: {$marked} absences marked so far");
        }

        $this->info("attendance:mark-absent done — {$marked} absent records created.");
        return 0;
    }
}
