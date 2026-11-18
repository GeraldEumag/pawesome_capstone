<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Hourly (not a single morning run): reminders target tomorrow's bookings and
// are deduped by reminder_sent_at, so extra runs are no-ops while same-day
// bookings for tomorrow still get reminded within the hour. withoutOverlapping
// closes the check-then-set race if a manual artisan run ever coincides with
// the scheduled one — the cache mutex serializes the send loop.
Schedule::command('notifications:send-reminders')->hourly()->withoutOverlapping(30);

// Email delivery outbox: republish missed pending intents and reconcile
// stale processing rows (crash after possible provider acceptance).
Schedule::command('email-deliveries:dispatch')->everyMinute();
Schedule::command('email-deliveries:reconcile')->everyTenMinutes();

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

// Phase D: daily batch-expiry sweep (90/30-day alerts + expired flagging)
// and inpatient daily-rate accrual into running visit invoices.
Schedule::command('inventory:check-expiries')->dailyAt('07:30');
Schedule::command('confinement:accrue-daily')->dailyAt('07:45');

// Phase E: recall scheduler — vaccine due (30-day look-ahead) and
// post-discharge follow-up checks (24–48h after release).
Schedule::command('recalls:send')->dailyAt('08:15');

// Chatbot transcript retention — deletes rows older than
// chatbot.log_retention_days (default 90).
Schedule::command('chatbot:prune-logs')->daily();

// Stored idempotency responses expire after 30 days (enforced lazily in the
// middleware too — this just keeps the table bounded).
Schedule::call(fn () => \Illuminate\Support\Facades\DB::table('idempotency_keys')
    ->where('created_at', '<', now()->subDays(30))->delete())
    ->name('idempotency:prune-keys')->daily();
