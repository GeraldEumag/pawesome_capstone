<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the admin failed-login broadcast defect.
 *
 * Previously AuthController::alertAdminsOnRepeatedFailures created a single
 * shared row (user_id NULL, role 'admin'). The mutation endpoints scope to
 * the caller's own rows, so that alert was visible to every admin but could
 * never be marked read — a permanently stuck unread badge. The fix fans the
 * alert out as one owned row per active admin.
 */
class NotificationBroadcastAlertTest extends TestCase
{
    use RefreshDatabase;

    private function makeAdmin(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'admin',
            'is_active' => true,
            'email_verified_at' => now(),
        ], $overrides));
    }

    private function failLoginTimes(string $identifier, int $times): void
    {
        for ($i = 0; $i < $times; $i++) {
            $this->postJson('/api/auth/login', [
                'login' => $identifier,
                'password' => 'definitely-wrong-password',
            ])->assertUnauthorized();
        }
    }

    private function alertFor(User $admin): ?Notification
    {
        return Notification::where('user_id', $admin->id)
            ->where('title', 'Repeated failed logins detected')
            ->latest('id')
            ->first();
    }

    public function test_failed_login_burst_fans_out_one_owned_row_per_active_admin(): void
    {
        $adminA = $this->makeAdmin();
        $adminB = $this->makeAdmin();
        $inactiveAdmin = $this->makeAdmin(['is_active' => false]);

        $this->failLoginTimes('attacker-target@example.com', 3);

        $alertA = $this->alertFor($adminA);
        $alertB = $this->alertFor($adminB);

        $this->assertNotNull($alertA, 'active admin A must receive an owned alert row');
        $this->assertNotNull($alertB, 'active admin B must receive an owned alert row');
        $this->assertSame($adminA->id, $alertA->user_id);
        $this->assertSame($adminB->id, $alertB->user_id);
        $this->assertFalse((bool) $alertA->read);
        $this->assertSame('admin', $alertA->role);

        $this->assertNull(
            $this->alertFor($inactiveAdmin),
            'inactive admins must not receive the alert'
        );

        // The defect this fixes: no shared NULL-owner broadcast row may be
        // created — those are read-visible but permanently immutable.
        $this->assertSame(
            0,
            Notification::whereNull('user_id')
                ->where('title', 'Repeated failed logins detected')
                ->count(),
            'failed-login alert must not create a NULL-user_id broadcast row'
        );
    }

    public function test_per_admin_read_state_is_independent(): void
    {
        $adminA = $this->makeAdmin();
        $adminB = $this->makeAdmin();

        $this->failLoginTimes('attacker-target@example.com', 3);

        $alertA = $this->alertFor($adminA);
        $alertB = $this->alertFor($adminB);
        $this->assertNotNull($alertA);
        $this->assertNotNull($alertB);

        // Admin A marks their own copy read — admin B's copy is untouched.
        $tokenA = $adminA->createToken('t')->plainTextToken;
        $this->withHeaders(['Authorization' => "Bearer {$tokenA}"])
            ->postJson("/api/notifications/{$alertA->id}/read")
            ->assertOk()
            ->assertJsonPath('unread_count', 0);

        $this->assertFalse((bool) $alertB->fresh()->read, 'admin B copy must remain unread');

        $tokenB = $adminB->createToken('t')->plainTextToken;
        $this->withHeaders(['Authorization' => "Bearer {$tokenB}"])
            ->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('unread_count', 1);
    }

    public function test_unread_count_syncs_on_read_and_delete(): void
    {
        $admin = $this->makeAdmin();
        $n1 = Notification::create([
            'user_id' => $admin->id,
            'title' => 'First',
            'message' => 'm',
            'type' => 'info',
        ]);
        $n2 = Notification::create([
            'user_id' => $admin->id,
            'title' => 'Second',
            'message' => 'm',
            'type' => 'warning',
        ]);

        $headers = ['Authorization' => 'Bearer ' . $admin->createToken('t')->plainTextToken];

        // Mark one read — response carries the authoritative count.
        $this->withHeaders($headers)
            ->postJson("/api/notifications/{$n1->id}/read")
            ->assertOk()
            ->assertJsonPath('unread_count', 1);

        // Delete the other unread — count drops to zero.
        $this->withHeaders($headers)
            ->deleteJson("/api/notifications/{$n2->id}")
            ->assertOk()
            ->assertJsonPath('unread_count', 0);
    }
}
