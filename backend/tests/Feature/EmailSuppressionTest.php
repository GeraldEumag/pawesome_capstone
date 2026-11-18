<?php

namespace Tests\Feature;

use App\Mail\EmailVerificationMail;
use App\Models\EmailDelivery;
use App\Models\EmailSuppression;
use App\Models\User;
use App\Services\EmailDeliveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Recipient suppression list: reason-scoped send blocking and the admin
 * observability API over deliveries and suppressions.
 */
class EmailSuppressionTest extends TestCase
{
    use RefreshDatabase;

    private function bearer(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('test')->plainTextToken];
    }

    private function deliveryFor(string $eventKey): EmailDelivery
    {
        return app(EmailDeliveryService::class)->intent(
            new EmailVerificationMail('tok', 'customer@example.com', 'Test'),
            [
                'event_key' => $eventKey,
                'occurrence_key' => 'occ:' . Str::random(12),
                'recipient' => 'customer@example.com',
                'dispatch' => false,
            ]
        );
    }

    private function fingerprint(): string
    {
        return EmailDelivery::fingerprint('customer@example.com');
    }

    public function test_hard_bounce_suppresses_non_auth_send(): void
    {
        Mail::fake();
        EmailSuppression::suppress($this->fingerprint(), EmailSuppression::REASON_HARD_BOUNCE);

        $delivery = $this->deliveryFor('lifecycle.request_update');

        $this->assertSame('suppressed', app(EmailDeliveryService::class)->send($delivery->id, 'worker:1'));
        $this->assertSame(EmailDelivery::STATUS_SUPPRESSED, $delivery->fresh()->status);
        Mail::assertNothingSent();
    }

    public function test_hard_bounce_suppresses_auth_send_too(): void
    {
        Mail::fake();
        EmailSuppression::suppress($this->fingerprint(), EmailSuppression::REASON_HARD_BOUNCE);

        // Dead mailboxes cannot receive reset links — auth is not exempt.
        $delivery = $this->deliveryFor('auth.password_reset');

        $this->assertSame('suppressed', app(EmailDeliveryService::class)->send($delivery->id, 'worker:1'));
        Mail::assertNothingSent();
    }

    public function test_spam_complaint_suppresses_non_auth_but_allows_auth(): void
    {
        Mail::fake();
        EmailSuppression::suppress($this->fingerprint(), EmailSuppression::REASON_SPAM);

        $lifecycle = $this->deliveryFor('lifecycle.request_update');
        $this->assertSame('suppressed', app(EmailDeliveryService::class)->send($lifecycle->id, 'worker:1'));

        $auth = $this->deliveryFor('auth.password_reset');
        $this->assertSame('accepted', app(EmailDeliveryService::class)->send($auth->id, 'worker:1'));

        Mail::assertSentCount(1);
    }

    public function test_released_suppression_no_longer_blocks(): void
    {
        Mail::fake();
        $row = EmailSuppression::suppress($this->fingerprint(), EmailSuppression::REASON_HARD_BOUNCE);
        $row->update(['released_at' => now()]);

        $delivery = $this->deliveryFor('lifecycle.request_update');

        $this->assertSame('accepted', app(EmailDeliveryService::class)->send($delivery->id, 'worker:1'));
        Mail::assertSentCount(1);
    }

    public function test_suppress_is_idempotent_and_re_suppresses_after_release(): void
    {
        EmailSuppression::suppress($this->fingerprint(), EmailSuppression::REASON_HARD_BOUNCE);
        EmailSuppression::suppress($this->fingerprint(), EmailSuppression::REASON_HARD_BOUNCE);
        $this->assertDatabaseCount('email_suppressions', 1);

        $row = EmailSuppression::firstOrFail();
        $row->update(['released_at' => now()]);

        EmailSuppression::suppress($this->fingerprint(), EmailSuppression::REASON_SPAM);
        $row->refresh();
        $this->assertSame(EmailSuppression::REASON_SPAM, $row->reason);
        $this->assertNull($row->released_at);
        $this->assertDatabaseCount('email_suppressions', 1);
    }

    public function test_admin_can_list_deliveries_and_release_suppression(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $delivery = $this->deliveryFor('lifecycle.request_update');
        EmailSuppression::suppress($this->fingerprint(), EmailSuppression::REASON_HARD_BOUNCE);

        $this->getJson('/api/admin/email-deliveries', $this->bearer($admin))
            ->assertOk()
            ->assertJsonStructure(['deliveries' => ['data'], 'status_counts']);

        $this->getJson("/api/admin/email-deliveries/{$delivery->id}", $this->bearer($admin))
            ->assertOk()
            ->assertJsonPath('delivery.event_key', 'lifecycle.request_update')
            ->assertJsonPath('delivery.recipient_email', 'customer@example.com');

        $suppression = EmailSuppression::firstOrFail();
        $this->getJson('/api/admin/email-suppressions', $this->bearer($admin))->assertOk();

        $this->deleteJson("/api/admin/email-suppressions/{$suppression->id}", [], $this->bearer($admin))
            ->assertOk();
        $this->assertNotNull($suppression->fresh()->released_at);
    }

    public function test_email_observability_requires_admin(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $delivery = $this->deliveryFor('lifecycle.request_update');

        $this->getJson('/api/admin/email-deliveries')->assertStatus(401);
        $this->getJson('/api/admin/email-deliveries', $this->bearer($customer))->assertStatus(403);
        $this->getJson("/api/admin/email-deliveries/{$delivery->id}", $this->bearer($customer))->assertStatus(403);
        $this->getJson('/api/admin/email-suppressions', $this->bearer($customer))->assertStatus(403);
    }
}
