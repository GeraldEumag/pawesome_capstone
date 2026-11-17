<?php

namespace Tests\Feature;

use App\Models\Holiday;
use App\Models\LoginLog;
use App\Models\Notification;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\BookingAvailabilityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression coverage for the admin-role deep audit (2026-11-18):
 * admin lockout guards, failed-login logging, login-alert notification
 * consumers, maintenance-mode enforcement, settings payload integrity,
 * and the api/* JSON contract.
 */
class AdminDeepAuditTest extends TestCase
{
    use RefreshDatabase;

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('audit-test')->plainTextToken];
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin', 'is_active' => true]);
    }

    // ── Admin lockout guards ────────────────────────────────────────────

    public function test_admin_cannot_deactivate_themselves_via_toggle(): void
    {
        $admin = $this->admin();

        $this->withHeaders($this->headers($admin))
            ->patchJson("/api/admin/users/{$admin->id}/toggle")
            ->assertForbidden();

        $this->assertTrue((bool) $admin->fresh()->is_active);
    }

    public function test_admin_cannot_deactivate_themselves_via_update(): void
    {
        $admin = $this->admin();

        $this->withHeaders($this->headers($admin))
            ->putJson("/api/admin/users/{$admin->id}", ['is_active' => false])
            ->assertForbidden();

        $this->assertTrue((bool) $admin->fresh()->is_active);
    }

    public function test_admin_cannot_change_their_own_role(): void
    {
        $admin = $this->admin();

        $this->withHeaders($this->headers($admin))
            ->putJson("/api/admin/users/{$admin->id}", ['role' => 'customer'])
            ->assertForbidden();

        $this->assertSame('admin', $admin->fresh()->role);
    }

    public function test_admin_cannot_delete_their_own_account(): void
    {
        $admin = $this->admin();

        $this->withHeaders($this->headers($admin))
            ->deleteJson("/api/admin/users/{$admin->id}", ['reason' => 'test_account'])
            ->assertForbidden();

        $this->assertNull($admin->fresh()->deleted_at);
    }

    public function test_another_admin_can_still_be_deactivated(): void
    {
        $admin = $this->admin();
        $other = User::factory()->create(['role' => 'admin', 'is_active' => true]);

        $this->withHeaders($this->headers($admin))
            ->patchJson("/api/admin/users/{$other->id}/toggle")
            ->assertOk();

        $this->assertFalse((bool) $other->fresh()->is_active);
    }

    public function test_last_active_admin_cannot_be_removed_by_legacy_super_admin(): void
    {
        // EnsureRole normalises 'super_admin' to 'admin' for authorisation,
        // but the role='admin' lockout count does not — so a super_admin
        // caller is the only state where the "last active admin is another
        // user" branch of the guard can fire.
        $superAdmin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $lastAdmin = $this->admin();
        $headers = $this->headers($superAdmin);

        $this->withHeaders($headers)
            ->patchJson("/api/admin/users/{$lastAdmin->id}/toggle")
            ->assertForbidden();
        $this->assertTrue((bool) $lastAdmin->fresh()->is_active);

        $this->withHeaders($headers)
            ->putJson("/api/admin/users/{$lastAdmin->id}", ['role' => 'customer'])
            ->assertForbidden();
        $this->assertSame('admin', $lastAdmin->fresh()->role);

        $this->withHeaders($headers)
            ->deleteJson("/api/admin/users/{$lastAdmin->id}", ['reason' => 'test_account'])
            ->assertForbidden();
        $this->assertNull($lastAdmin->fresh()->deleted_at);
    }

    public function test_deactivation_revokes_existing_tokens(): void
    {
        $admin = $this->admin();
        $staff = User::factory()->create(['role' => 'receptionist', 'is_active' => true]);
        $staffHeaders = $this->headers($staff);

        $this->withHeaders($staffHeaders)->getJson('/api/auth/me')->assertOk();

        $this->withHeaders($this->headers($admin))
            ->patchJson("/api/admin/users/{$staff->id}/toggle")
            ->assertOk();

        $this->withHeaders($staffHeaders)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_role_change_away_from_admin_is_audited(): void
    {
        $admin = $this->admin();
        $other = User::factory()->create(['role' => 'admin', 'is_active' => true]);

        $this->withHeaders($this->headers($admin))
            ->putJson("/api/admin/users/{$other->id}", ['role' => 'manager'])
            ->assertOk();

        $this->assertSame('manager', $other->fresh()->role);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'user_updated',
            'reference_id' => (string) $other->id,
        ]);
    }

    // ── Failed-login logging ────────────────────────────────────────────

    public function test_failed_login_attempt_is_recorded(): void
    {
        $user = User::factory()->create(['email' => 'staff@example.com']);

        $this->postJson('/api/auth/login', [
            'email' => 'staff@example.com',
            'password' => 'wrong-password',
        ])->assertUnauthorized();

        $this->assertDatabaseHas('login_logs', [
            'email' => 'staff@example.com',
            'action' => 'login',
            'status' => 'failed',
            'failure_reason' => 'invalid_credentials',
        ]);
    }

    public function test_failed_login_for_unknown_email_is_recorded(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => 'ghost@example.com',
            'password' => 'whatever1',
        ])->assertUnauthorized();

        $log = LoginLog::where('email', 'ghost@example.com')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('failed', $log->status);
        $this->assertNull($log->user_id);
    }

    public function test_inactive_account_login_is_recorded_as_failed(): void
    {
        User::factory()->create([
            'email' => 'inactive@example.com',
            'is_active' => false,
        ]);

        $this->postJson('/api/auth/login', [
            'email' => 'inactive@example.com',
            'password' => 'password',
        ])->assertForbidden();

        $this->assertDatabaseHas('login_logs', [
            'email' => 'inactive@example.com',
            'status' => 'failed',
            'failure_reason' => 'account_inactive',
        ]);
    }

    public function test_failed_login_statistics_now_count_failures(): void
    {
        $admin = $this->admin();
        User::factory()->create(['email' => 'stats@example.com']);

        $this->postJson('/api/auth/login', ['email' => 'stats@example.com', 'password' => 'bad1']);
        $this->postJson('/api/auth/login', ['email' => 'stats@example.com', 'password' => 'bad2']);

        $response = $this->withHeaders($this->headers($admin))
            ->getJson('/api/admin/login-logs/statistics')
            ->assertOk();

        $this->assertGreaterThanOrEqual(2, $response->json('failed_logins'));
    }

    // ── Login alert notification consumers ──────────────────────────────

    public function test_user_gets_login_alert_notification_when_enabled(): void
    {
        SystemSetting::set('notif_login_alerts', '1');
        $user = User::factory()->create(['email' => 'alertme@example.com']);

        $this->postJson('/api/auth/login', [
            'email' => 'alertme@example.com',
            'password' => 'password',
        ])->assertOk();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $user->id,
            'title' => 'New sign-in to your account',
        ]);
    }

    public function test_user_login_alert_suppressed_when_disabled(): void
    {
        SystemSetting::set('notif_login_alerts', '0');
        $user = User::factory()->create(['email' => 'quiet@example.com']);

        $this->postJson('/api/auth/login', [
            'email' => 'quiet@example.com',
            'password' => 'password',
        ])->assertOk();

        $this->assertDatabaseMissing('notifications', [
            'user_id' => $user->id,
            'title' => 'New sign-in to your account',
        ]);
    }

    public function test_admin_alerted_on_third_failed_login_when_enabled(): void
    {
        SystemSetting::set('notif_failed_login_alerts', '1');
        User::factory()->create(['email' => 'target@example.com']);

        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'target@example.com', 'password' => "bad{$i}"]);
        }

        $this->assertDatabaseHas('notifications', [
            'role' => 'admin',
            'type' => 'warning',
        ]);
    }

    public function test_admin_failed_login_alert_fires_only_once_per_burst(): void
    {
        SystemSetting::set('notif_failed_login_alerts', '1');
        User::factory()->create(['email' => 'burst@example.com']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'burst@example.com', 'password' => "bad{$i}"]);
        }

        $this->assertSame(1, Notification::where('role', 'admin')->where('type', 'warning')->count());
    }

    public function test_admin_failed_login_alert_suppressed_when_disabled(): void
    {
        SystemSetting::set('notif_failed_login_alerts', '0');
        User::factory()->create(['email' => 'silent@example.com']);

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'silent@example.com', 'password' => "bad{$i}"]);
        }

        $this->assertDatabaseMissing('notifications', [
            'role' => 'admin',
            'type' => 'warning',
        ]);
    }

    // ── Maintenance mode enforcement ────────────────────────────────────

    public function test_maintenance_mode_blocks_non_admin_sessions(): void
    {
        SystemSetting::set('general_maintenance_mode', '1');
        $customer = User::factory()->create(['role' => 'customer']);

        $this->withHeaders($this->headers($customer))
            ->getJson('/api/auth/me')
            ->assertStatus(503);
    }

    public function test_maintenance_mode_keeps_admin_access(): void
    {
        SystemSetting::set('general_maintenance_mode', '1');
        $admin = $this->admin();

        $this->withHeaders($this->headers($admin))
            ->getJson('/api/admin/settings')
            ->assertOk();
    }

    public function test_public_routes_stay_reachable_during_maintenance(): void
    {
        SystemSetting::set('general_maintenance_mode', '1');

        $this->getJson('/api/settings/public')->assertOk();
    }

    public function test_maintenance_mode_toggle_takes_effect_immediately(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $headers = $this->headers($customer);

        SystemSetting::set('general_maintenance_mode', '1');
        $this->withHeaders($headers)->getJson('/api/auth/me')->assertStatus(503);

        SystemSetting::set('general_maintenance_mode', '0');
        $this->withHeaders($headers)->getJson('/api/auth/me')->assertOk();
    }

    // ── Settings payload integrity ──────────────────────────────────────

    public function test_settings_payload_only_exposes_enforced_settings(): void
    {
        $admin = $this->admin();

        $response = $this->withHeaders($this->headers($admin))
            ->getJson('/api/admin/settings')
            ->assertOk();

        // Removed dead keys must not reappear.
        $this->assertArrayNotHasKey('systemName', $response->json('general'));
        $this->assertArrayNotHasKey('timezone', $response->json('general'));
        $this->assertArrayNotHasKey('dateFormat', $response->json('general'));
        $this->assertArrayNotHasKey('dailyReports', $response->json('notifications'));
        $this->assertArrayNotHasKey('weeklyReports', $response->json('notifications'));

        // Live settings must still be present.
        $this->assertArrayHasKey('maintenanceMode', $response->json('general'));
        $this->assertArrayHasKey('sessionTimeout', $response->json('security'));
        $this->assertArrayHasKey('emailNotifications', $response->json('notifications'));
    }

    public function test_maintenance_mode_setting_persists_via_endpoint(): void
    {
        $admin = $this->admin();
        $headers = $this->headers($admin);

        $this->withHeaders($headers)
            ->postJson('/api/admin/settings/general', ['maintenanceMode' => true])
            ->assertOk();

        $this->assertSame('1', SystemSetting::get('general_maintenance_mode'));

        $this->withHeaders($headers)
            ->postJson('/api/admin/settings/general', ['maintenanceMode' => false])
            ->assertOk();

        $this->assertSame('0', SystemSetting::get('general_maintenance_mode'));
    }

    // ── API JSON contract ───────────────────────────────────────────────

    public function test_api_validation_errors_render_json_without_accept_header(): void
    {
        $admin = $this->admin();

        // Non-JSON request (form post) still receives a JSON 422 — not an
        // HTML redirect — because api/* always answers JSON.
        $response = $this->withHeaders($this->headers($admin))
            ->post('/api/admin/chatbot/faqs', []);

        $response->assertStatus(422);
        $this->assertStringContainsString('application/json', $response->headers->get('content-type'));
    }

    public function test_api_404_renders_json(): void
    {
        $admin = $this->admin();

        $response = $this->withHeaders($this->headers($admin))
            ->get('/api/admin/definitely-not-a-route');

        $response->assertStatus(404);
        $this->assertStringContainsString('application/json', $response->headers->get('content-type'));
    }

    // ── Dashboard payload integrity ─────────────────────────────────────

    public function test_dashboard_does_not_report_fabricated_active_modules(): void
    {
        $admin = $this->admin();

        $this->withHeaders($this->headers($admin))
            ->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonMissingPath('data.active_modules');
    }

    // ── User list server-side pagination (ADM-10) ───────────────────────

    public function test_users_index_paginates_with_meta_and_stats(): void
    {
        $admin = $this->admin();
        User::factory()->count(30)->create();

        $response = $this->withHeaders($this->headers($admin))
            ->getJson('/api/admin/users?per_page=10');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('meta.per_page', 10)
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.total', 31)
            ->assertJsonPath('meta.last_page', 4)
            ->assertJsonPath('stats.total', 31);

        $page2 = $this->withHeaders($this->headers($admin))
            ->getJson('/api/admin/users?per_page=10&page=2')
            ->assertOk()
            ->assertJsonPath('meta.current_page', 2);

        $page1Ids = collect($response->json('data'))->pluck('id');
        $page2Ids = collect($page2->json('data'))->pluck('id');
        $this->assertEmpty($page1Ids->intersect($page2Ids));
    }

    public function test_users_index_all_flag_returns_full_list_without_meta(): void
    {
        $admin = $this->admin();
        User::factory()->count(30)->create();

        $response = $this->withHeaders($this->headers($admin))
            ->getJson('/api/admin/users?all=1');

        $response->assertOk()
            ->assertJsonCount(31, 'data')
            ->assertJsonMissingPath('meta');
    }

    public function test_users_index_filters_by_role_status_and_search(): void
    {
        $admin = $this->admin();
        User::factory()->count(3)->create(['role' => 'customer', 'is_active' => true]);
        User::factory()->create(['role' => 'cashier', 'is_active' => false, 'name' => 'Needleperson Audit']);

        $headers = $this->headers($admin);

        $this->withHeaders($headers)->getJson('/api/admin/users?role=customer')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('meta.total', 3);

        $inactive = $this->withHeaders($headers)->getJson('/api/admin/users?status=inactive');
        $this->assertEmpty(
            collect($inactive->json('data'))->filter(fn ($u) => (bool) $u['is_active'])
        );

        $this->withHeaders($headers)->getJson('/api/admin/users?search=Needleperson')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    // ── Booking rejection reasons (ADM-09) ──────────────────────────────

    private function bookableDate(): string
    {
        for ($i = 2; $i < 120; $i++) {
            $date = now()->addDays($i)->toDateString();
            if (BookingAvailabilityService::isBookableDate($date)) {
                return $date;
            }
        }

        $this->fail('No bookable date found within 120 days.');
    }

    public function test_unavailable_reason_reports_unaligned_minute(): void
    {
        $date = $this->bookableDate();
        $interval = \App\Services\ServiceDurationService::getTimeSlotInterval();
        $misaligned = sprintf('10:%02d', $interval === 60 ? 30 : intdiv($interval, 2) + 1);

        $reason = BookingAvailabilityService::serviceTimeUnavailableReason('veterinary', $date, $misaligned);

        $this->assertSame("Times are available in {$interval}-minute intervals.", $reason);
    }

    public function test_unavailable_reason_reports_outside_hours(): void
    {
        $date = $this->bookableDate();

        $reason = BookingAvailabilityService::serviceTimeUnavailableReason('veterinary', $date, '06:00');

        $this->assertStringContainsString('outside shop opening hours', $reason);
    }

    public function test_unavailable_reason_reports_holiday(): void
    {
        $date = $this->bookableDate();
        Holiday::create([
            'date' => $date,
            'name' => 'Audit Holiday',
            'type' => 'regular',
            'year' => (int) substr($date, 0, 4),
            'is_recurring' => false,
        ]);
        Holiday::clearCache((int) substr($date, 0, 4));

        $reason = BookingAvailabilityService::serviceTimeUnavailableReason('veterinary', $date, '10:00');

        $this->assertSame('This date is a public holiday (Audit Holiday); the store is closed.', $reason);
    }

    public function test_unavailable_reason_reports_overlap(): void
    {
        $date = $this->bookableDate();
        DB::table('service_requests')->insert([
            'customer_name' => 'Audit Customer',
            'request_type' => 'vet',
            'service_name' => 'General Check-up',
            'request_date' => $date,
            'request_time' => '10:00',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $reason = BookingAvailabilityService::serviceTimeUnavailableReason('veterinary', $date, '10:00');

        $this->assertSame('Time slot overlaps an existing booking.', $reason);
    }
}
