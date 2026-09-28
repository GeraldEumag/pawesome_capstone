<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('notifications:send-reminders')->dailyAt('08:00');

// HR & Payroll automated commands
// Mark absent for all staff who had no punch on the previous workday
Schedule::command('attendance:mark-absent')->dailyAt('23:30');

// Accrue 13th month pay on the 16th and last day of each month
Schedule::command('payroll:accrue-13th-month')->monthlyOn(16, '01:00');
Schedule::command('payroll:accrue-13th-month')->lastDayOfMonth('01:00');

// Annual leave balance reset + SIL cash conversion (January 1 at 00:05)
Schedule::command('leave:annual-reset')->yearlyOn(1, 1, '00:05');

// Check probationary period endings daily at 08:00
Schedule::command('staff:check-probationary')->dailyAt('08:00');
