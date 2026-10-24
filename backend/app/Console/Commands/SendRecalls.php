<?php

namespace App\Console\Commands;

use App\Models\MedicalConfinement;
use App\Models\Vaccination;
use App\Services\WorkflowNotifier;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Phase E recall scheduler. Sends (once each, deduped via recall_dispatches):
 *
 * - vaccine_due:           vaccination.next_due_date within the next 30 days
 * - post_discharge_check:  confinement discharged 24–48 hours ago — the
 *                          standard post-surgery/inpatient follow-up touch
 *
 * Medication-end recalls are not emitted: prescriptions/MAR carry no end
 * date in the schema, so there is no due date to key a recall on.
 */
class SendRecalls extends Command
{
    protected $signature = 'recalls:send {--days=30 : Look-ahead window for vaccine due dates}';

    protected $description = 'Send recall notifications for vaccine due dates and post-discharge follow-ups';

    public function handle(): int
    {
        $sent = 0;
        $sent += $this->vaccineDue((int) $this->option('days'));
        $sent += $this->postDischargeChecks();

        $this->info("Recalls dispatched: {$sent}");

        return Command::SUCCESS;
    }

    /** Vaccines coming due within the window — one notification per due date. */
    private function vaccineDue(int $days): int
    {
        $due = Vaccination::with(['pet.customer.user'])
            ->whereNotNull('next_due_date')
            ->whereDate('next_due_date', '>=', now()->toDateString())
            ->whereDate('next_due_date', '<=', now()->addDays($days)->toDateString())
            ->get();

        $sent = 0;
        foreach ($due as $vaccination) {
            $alreadySent = DB::table('recall_dispatches')
                ->where('kind', 'vaccine_due')
                ->where('ref_id', $vaccination->id)
                ->where('due_date', $vaccination->next_due_date->toDateString())
                ->exists();
            if ($alreadySent) {
                continue;
            }

            $user = $vaccination->pet?->customer?->user;
            if (!$user) {
                continue;
            }

            WorkflowNotifier::notifyUser(
                $user->id,
                'Vaccination due soon',
                "{$vaccination->pet->name} is due for {$vaccination->vaccine_name} on {$vaccination->next_due_date->format('M j, Y')}. Book a visit to keep them protected.",
                'warning',
                'vaccination',
                $vaccination->id
            );

            $notificationId = DB::table('notifications')->where('user_id', $user->id)->latest('id')->value('id');

            DB::table('recall_dispatches')->insertOrIgnore([
                'kind' => 'vaccine_due',
                'ref_id' => $vaccination->id,
                'due_date' => $vaccination->next_due_date->toDateString(),
                'user_id' => $user->id,
                'notification_id' => $notificationId,
                'sent_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $sent++;
        }

        return $sent;
    }

    /** Pets discharged from confinement 24–48h ago get a follow-up check. */
    private function postDischargeChecks(): int
    {
        $recent = MedicalConfinement::with(['pet.customer.user'])
            ->whereIn('status', ['discharged', 'transferred'])
            ->whereNotNull('discharged_at')
            ->where('discharged_at', '>=', now()->subHours(48))
            ->where('discharged_at', '<=', now()->subHours(24))
            ->get();

        $sent = 0;
        foreach ($recent as $confinement) {
            $alreadySent = DB::table('recall_dispatches')
                ->where('kind', 'post_discharge_check')
                ->where('ref_id', $confinement->id)
                ->exists();
            if ($alreadySent) {
                continue;
            }

            $user = $confinement->pet?->customer?->user;
            if (!$user) {
                continue;
            }

            WorkflowNotifier::notifyUser(
                $user->id,
                'How is your pet doing?',
                "{$confinement->pet_name} was discharged {$confinement->discharged_at->diffForHumans()}. Please watch their appetite and energy — contact us right away if anything seems off.",
                'info',
                'medical_confinement',
                $confinement->id
            );

            $notificationId = DB::table('notifications')->where('user_id', $user->id)->latest('id')->value('id');

            // due_date must be non-null — NULLs are distinct in MySQL unique
            // indexes, which would let a concurrent rerun double-notify.
            // The discharge date is a stable dedupe anchor for this recall.
            DB::table('recall_dispatches')->insertOrIgnore([
                'kind' => 'post_discharge_check',
                'ref_id' => $confinement->id,
                'due_date' => $confinement->discharged_at->toDateString(),
                'user_id' => $user->id,
                'notification_id' => $notificationId,
                'sent_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $sent++;
        }

        return $sent;
    }
}
