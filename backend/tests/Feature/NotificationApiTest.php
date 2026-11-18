<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * API contract + authorization coverage for /api/notifications.
 *
 * Complements NotificationMatrixTest (event/producer coverage) by pinning the
 * endpoint envelope, per-endpoint authorization, and the rule that legacy
 * broadcast rows (user_id NULL + role tag) are read-visible but immutable —
 * one recipient must never flip shared read state for everyone.
 */
class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['customer', 'receptionist', 'admin'] as $role) {
            $this->users[$role] = User::factory()->create([
                'role' => $role,
                'is_active' => true,
                'email_verified_at' => now(),
            ]);
        }
    }

    private function as(string $role): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $this->users[$role]->createToken('t')->plainTextToken]);
    }

    private function notify(User $user, array $overrides = []): Notification
    {
        return Notification::create(array_merge([
            'user_id' => $user->id,
            'title' => 'Test notice',
            'message' => 'hello',
            'type' => 'info',
            'read' => false,
        ], $overrides));
    }

    public function test_index_returns_envelope_and_only_own_notifications(): void
    {
        $customer = $this->users['customer'];
        $this->notify($customer, ['title' => 'Mine']);
        $this->notify($this->users['receptionist'], ['title' => 'Not mine']);

        $response = $this->as('customer')->getJson('/api/notifications')->assertOk();

        $response->assertJsonPath('success', true)
            ->assertJsonCount(1, 'notifications')
            ->assertJsonPath('notifications.0.title', 'Mine')
            ->assertJsonPath('unread_count', 1);
    }

    public function test_index_unread_filter_and_limit_clamp(): void
    {
        $customer = $this->users['customer'];
        $this->notify($customer, ['title' => 'Read one', 'read' => true, 'read_at' => now()]);
        $this->notify($customer, ['title' => 'Unread one']);

        $this->as('customer')->getJson('/api/notifications?unread=1')
            ->assertOk()
            ->assertJsonCount(1, 'notifications')
            ->assertJsonPath('notifications.0.title', 'Unread one');

        // limit is clamped to [1, 50]; invalid values fall back safely
        $this->as('customer')->getJson('/api/notifications?limit=999')->assertOk();
        $this->as('customer')->getJson('/api/notifications?limit=-5')->assertOk();
    }

    public function test_get_unread_returns_unread_only_with_count(): void
    {
        $customer = $this->users['customer'];
        $this->notify($customer, ['read' => true, 'read_at' => now()]);
        $this->notify($customer);

        $this->as('customer')->getJson('/api/notifications/unread')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'notifications')
            ->assertJsonPath('unread_count', 1);
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/notifications')->assertUnauthorized();
        $this->getJson('/api/notifications/unread-count')->assertUnauthorized();
        $this->postJson('/api/notifications/1/read')->assertUnauthorized();
        $this->postJson('/api/notifications/mark-all-read')->assertUnauthorized();
        $this->deleteJson('/api/notifications/1')->assertUnauthorized();
    }

    public function test_store_requires_admin_and_validates(): void
    {
        $customer = $this->users['customer'];
        $payload = ['user_id' => $customer->id, 'title' => 'Manual', 'message' => 'hi'];

        $this->as('customer')->postJson('/api/notifications', $payload)->assertForbidden();
        $this->as('receptionist')->postJson('/api/notifications', $payload)->assertForbidden();

        $this->as('admin')->postJson('/api/notifications', ['title' => 'x'])->assertUnprocessable();

        $this->as('admin')->postJson('/api/notifications', $payload)
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('notification.user_id', $customer->id);
    }

    public function test_mark_all_and_clear_all_only_touch_own_rows(): void
    {
        $customer = $this->users['customer'];
        $other = $this->users['receptionist'];
        $this->notify($customer);
        $foreign = $this->notify($other);

        $this->as('customer')->postJson('/api/notifications/mark-all-read')->assertOk();
        $this->assertTrue((bool) $foreign->fresh()->read === false, 'mark-all-read must not touch other users');

        $this->notify($customer);
        $this->as('customer')->postJson('/api/notifications/clear-all')->assertOk();
        $this->assertSame(0, Notification::where('user_id', $customer->id)->count());
        $this->assertDatabaseHas('notifications', ['id' => $foreign->id]);
    }

    public function test_legacy_broadcast_row_is_visible_but_immutable(): void
    {
        // Legacy broadcast shape: shared row, user_id NULL, tagged to a role.
        $broadcast = Notification::create([
            'user_id' => null,
            'role' => 'receptionist',
            'title' => 'Broadcast',
            'message' => 'shared row',
            'type' => 'info',
            'read' => false,
        ]);

        // Visible in the feed + unread count for that role.
        $this->as('receptionist')->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('unread_count', 1);
        $this->as('customer')->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('unread_count', 0);

        // But no single recipient may flip the shared row.
        $this->as('receptionist')->postJson("/api/notifications/{$broadcast->id}/read")->assertNotFound();
        $this->as('receptionist')->deleteJson("/api/notifications/{$broadcast->id}")->assertNotFound();
        $this->as('receptionist')->postJson('/api/notifications/mark-all-read')->assertOk();
        $this->as('receptionist')->postJson('/api/notifications/clear-all')->assertOk();

        $broadcast->refresh();
        $this->assertFalse((bool) $broadcast->read, 'shared broadcast row must stay unread for all recipients');
        $this->assertNotNull($broadcast->id, 'shared broadcast row must not be deleted by one recipient');
        $this->assertDatabaseHas('notifications', ['id' => $broadcast->id]);
    }

    public function test_removed_booking_status_endpoint_is_gone(): void
    {
        $this->as('receptionist')->postJson('/api/notifications/booking-status', [
            'status' => 'approved',
            'customerEmail' => 'x@example.com',
        ])->assertNotFound();
    }
}
