<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * staff:check-probationary must alert managers once per alert event
 * (recipient + person + probation end date), never duplicating on
 * repeated daily runs inside the same alert window.
 */
class ProbationaryAlertTest extends TestCase
{
    use RefreshDatabase;

    private function makeManager(): User
    {
        return User::factory()->create(['role' => 'manager', 'is_active' => true]);
    }

    private function makeProbationary(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'role'              => 'cashier',
            'is_active'         => true,
            'employment_status' => 'probationary',
            // 180-day probation ends 13 days from now — inside the default
            // 14-day alert window.
            'employment_date'   => now()->subDays(167)->toDateString(),
        ], $overrides));
    }

    public function test_alert_uses_notification_schema_and_fields(): void
    {
        $mgr = $this->makeManager();
        $person = $this->makeProbationary();

        $this->artisan('staff:check-probationary')->assertExitCode(0);

        $n = Notification::where('user_id', $mgr->id)->sole();
        $this->assertSame('Probationary Period Ending', $n->title);
        $this->assertSame('warning', $n->type);
        $this->assertFalse($n->read);
        $this->assertSame('probationary_alert', $n->related_type);
        $this->assertSame($person->id, $n->related_id);
        $this->assertSame('user', $n->data['person_type']);
        $this->assertSame($person->id, $n->data['person_id']);
        $this->assertNotEmpty($n->data['probation_end']);
    }

    public function test_repeat_runs_do_not_duplicate_alerts(): void
    {
        $mgr = $this->makeManager();
        $this->makeProbationary();

        $this->artisan('staff:check-probationary');
        $this->artisan('staff:check-probationary');
        $this->artisan('staff:check-probationary');

        $this->assertSame(1, Notification::where('user_id', $mgr->id)->count());
    }

    public function test_distinct_people_produce_distinct_alerts(): void
    {
        $mgr = $this->makeManager();
        $this->makeProbationary();
        $this->makeProbationary(['employment_date' => now()->subDays(170)->toDateString()]);

        $this->artisan('staff:check-probationary');

        $this->assertSame(2, Notification::where('user_id', $mgr->id)->count());
    }

    public function test_changed_probation_end_is_a_new_alert_event(): void
    {
        $mgr = $this->makeManager();
        $person = $this->makeProbationary();

        $this->artisan('staff:check-probationary');

        // Corrected employment date shifts the probation end — a distinct event.
        $person->update(['employment_date' => now()->subDays(170)->toDateString()]);
        $this->artisan('staff:check-probationary');

        $this->assertSame(2, Notification::where('user_id', $mgr->id)->count());
    }

    public function test_employee_outside_window_produces_no_alert(): void
    {
        $mgr = $this->makeManager();
        $this->makeProbationary(['employment_date' => now()->subDays(100)->toDateString()]); // ends in 80 days

        $this->artisan('staff:check-probationary');

        $this->assertSame(0, Notification::where('user_id', $mgr->id)->count());
    }

    public function test_every_manager_and_admin_is_notified_once(): void
    {
        $mgr = $this->makeManager();
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $this->makeProbationary();

        $this->artisan('staff:check-probationary');
        $this->artisan('staff:check-probationary');

        $this->assertSame(1, Notification::where('user_id', $mgr->id)->count());
        $this->assertSame(1, Notification::where('user_id', $admin->id)->count());
    }
}
