<?php

namespace App\Console\Commands;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SendReminders extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'notifications:send-reminders';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send reminder notifications for upcoming appointments and boardings';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $this->info('Sending reminders...');

        $this->sendAppointmentReminders();
        $this->sendBoardingReminders();

        $this->info('Reminders sent successfully!');

        return Command::SUCCESS;
    }

    /**
     * Send appointment reminders
     */
    private function sendAppointmentReminders(): void
    {
        // Remind 24 hours before appointment
        $tomorrowStart = Carbon::now()->addDay()->startOfDay();
        $tomorrowEnd = Carbon::now()->addDay()->endOfDay();

        $appointments = Appointment::where('status', 'scheduled')
            ->whereBetween('scheduled_at', [$tomorrowStart, $tomorrowEnd])
            ->where(function ($query) {
                // Only get appointments that haven't had a 24h reminder sent
                $query->whereNull('reminder_sent_at')
                      ->orWhere('reminder_sent_at', '<', Carbon::now()->subDay());
            })
            ->with(['customer', 'pet', 'service'])
            ->get();

        $count = 0;
        foreach ($appointments as $appointment) {
            try {
                NotificationService::sendReminder($appointment, 'appointment', 24);
                
                // Mark reminder as sent
                $appointment->update(['reminder_sent_at' => Carbon::now()]);
                
                $count++;
            } catch (\Exception $e) {
                $this->error("Failed to send reminder for appointment {$appointment->id}: {$e->getMessage()}");
            }
        }

        $this->info("Sent {$count} appointment reminders");
    }

    /**
     * Send boarding check-in reminders
     */
    private function sendBoardingReminders(): void
    {
        // Remind 24 hours before check-in
        $tomorrowStart = Carbon::now()->addDay()->startOfDay();
        $tomorrowEnd = Carbon::now()->addDay()->endOfDay();

        $boardings = Boarding::whereIn('status', ['pending', 'confirmed'])
            ->whereBetween('check_in', [$tomorrowStart, $tomorrowEnd])
            ->where(function ($query) {
                // Only get boardings that haven't had a 24h reminder sent
                $query->whereNull('reminder_sent_at')
                      ->orWhere('reminder_sent_at', '<', Carbon::now()->subDay());
            })
            ->with(['customer', 'pet', 'hotelRoom'])
            ->get();

        $count = 0;
        foreach ($boardings as $boarding) {
            try {
                NotificationService::sendReminder($boarding, 'boarding', 24);
                
                // Mark reminder as sent
                $boarding->update(['reminder_sent_at' => Carbon::now()]);
                
                $count++;
            } catch (\Exception $e) {
                $this->error("Failed to send reminder for boarding {$boarding->id}: {$e->getMessage()}");
            }
        }

        $this->info("Sent {$count} boarding reminders");
    }
}
