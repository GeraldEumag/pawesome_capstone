<?php

namespace Tests\Feature;

use App\Models\EmailDelivery;
use App\Models\EmailSuppression;
use App\Services\EmailDeliveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Brevo transactional webhook: shared-secret auth, event → status mapping,
 * X-Mailin-custom/message-id correlation, terminal-state integrity,
 * idempotent replays, and suppression-list writes.
 */
class BrevoWebhookTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-webhook-secret';

    private const HEADERS = ['X-Pawesome-Webhook-Secret' => self::SECRET];

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.brevo.webhook_secret' => self::SECRET]);
    }

    private function makeDelivery(array $overrides = []): EmailDelivery
    {
        $delivery = app(EmailDeliveryService::class)->intent(
            new \App\Mail\EmailVerificationMail('tok-123', 'customer@example.com', 'Test'),
            array_merge([
                'event_key' => 'auth.email_verification',
                'occurrence_key' => 'occ:' . Str::random(12),
                'recipient' => 'customer@example.com',
                'dispatch' => false,
            ], $overrides)
        );

        $delivery->update([
            'status' => EmailDelivery::STATUS_ACCEPTED,
            'provider_message_id' => '<mid-abc@relay.brevo.com>',
            'accepted_at' => now(),
        ]);

        return $delivery->fresh();
    }

    public function test_rejects_missing_and_wrong_secret(): void
    {
        $this->postJson('/api/webhooks/brevo', ['event' => 'delivered'])->assertUnauthorized();
        $this->postJson(
            '/api/webhooks/brevo',
            ['event' => 'delivered'],
            ['X-Pawesome-Webhook-Secret' => 'wrong']
        )->assertUnauthorized();
    }

    public function test_fails_closed_when_secret_not_configured(): void
    {
        config(['services.brevo.webhook_secret' => '']);

        $this->postJson(
            '/api/webhooks/brevo',
            ['event' => 'delivered'],
            ['X-Pawesome-Webhook-Secret' => self::SECRET]
        )->assertStatus(503);
    }

    public function test_delivered_event_via_uuid_header(): void
    {
        $delivery = $this->makeDelivery();

        $this->postJson('/api/webhooks/brevo', [
            'event' => 'delivered',
            'email' => 'customer@example.com',
            'message-id' => '<mid-abc@relay.brevo.com>',
            'X-Mailin-custom' => $delivery->uuid,
            'ts_event' => now()->timestamp,
        ], self::HEADERS)->assertOk();

        $delivery->refresh();
        $this->assertSame(EmailDelivery::STATUS_DELIVERED, $delivery->status);
        $this->assertSame('delivered', $delivery->provider_status);
        $this->assertNotNull($delivery->delivered_at);
        $this->assertNotNull($delivery->finished_at);
    }

    public function test_delivered_event_via_message_id_fallback(): void
    {
        $delivery = $this->makeDelivery();

        $this->postJson('/api/webhooks/brevo', [
            'event' => 'delivered',
            'message-id' => 'mid-abc@relay.brevo.com', // no angle brackets
        ], self::HEADERS)->assertOk();

        $this->assertSame(EmailDelivery::STATUS_DELIVERED, $delivery->fresh()->status);
    }

    public function test_hard_bounce_marks_delivery_and_suppresses_recipient(): void
    {
        $delivery = $this->makeDelivery();

        $this->postJson('/api/webhooks/brevo', [
            'event' => 'hard_bounce',
            'email' => 'customer@example.com',
            'X-Mailin-custom' => $delivery->uuid,
        ], self::HEADERS)->assertOk();

        $this->assertSame(EmailDelivery::STATUS_BOUNCED, $delivery->fresh()->status);

        $suppression = EmailSuppression::firstOrFail();
        $this->assertSame(EmailSuppression::REASON_HARD_BOUNCE, $suppression->reason);
        $this->assertSame($delivery->recipient_fingerprint, $suppression->fingerprint);
        $this->assertSame($delivery->id, $suppression->source_delivery_id);
    }

    public function test_spam_event_marks_complaint_and_suppresses(): void
    {
        $delivery = $this->makeDelivery();

        $this->postJson('/api/webhooks/brevo', [
            'event' => 'spam',
            'X-Mailin-custom' => $delivery->uuid,
        ], self::HEADERS)->assertOk();

        $this->assertSame(EmailDelivery::STATUS_COMPLAINT, $delivery->fresh()->status);
        $this->assertSame(
            EmailSuppression::REASON_SPAM,
            EmailSuppression::firstOrFail()->reason
        );
    }

    public function test_blocked_and_error_and_deferred_events(): void
    {
        $blocked = $this->makeDelivery();
        $this->postJson('/api/webhooks/brevo', [
            'event' => 'blocked',
            'X-Mailin-custom' => $blocked->uuid,
        ], self::HEADERS)->assertOk();
        $this->assertSame(EmailDelivery::STATUS_BLOCKED, $blocked->fresh()->status);
        $this->assertSame(EmailSuppression::REASON_BLOCKED, EmailSuppression::firstOrFail()->reason);

        $error = $this->makeDelivery();
        $this->postJson('/api/webhooks/brevo', [
            'event' => 'error',
            'X-Mailin-custom' => $error->uuid,
        ], self::HEADERS)->assertOk();
        $this->assertSame(EmailDelivery::STATUS_FAILED, $error->fresh()->status);

        $deferred = $this->makeDelivery();
        $this->postJson('/api/webhooks/brevo', [
            'event' => 'deferred',
            'X-Mailin-custom' => $deferred->uuid,
        ], self::HEADERS)->assertOk();
        $deferred->refresh();
        $this->assertSame(EmailDelivery::STATUS_DEFERRED, $deferred->status);
        $this->assertNull($deferred->finished_at);
    }

    public function test_sent_event_never_marks_delivered(): void
    {
        $delivery = $this->makeDelivery();

        $this->postJson('/api/webhooks/brevo', [
            'event' => 'request',
            'X-Mailin-custom' => $delivery->uuid,
        ], self::HEADERS)->assertOk();

        $delivery->refresh();
        $this->assertSame('request', $delivery->provider_status);
        $this->assertSame(EmailDelivery::STATUS_ACCEPTED, $delivery->status);
        $this->assertNull($delivery->delivered_at);
    }

    public function test_terminal_status_never_regresses_on_replay(): void
    {
        $delivery = $this->makeDelivery();
        $delivery->update([
            'status' => EmailDelivery::STATUS_DELIVERED,
            'delivered_at' => now(),
            'finished_at' => now(),
        ]);

        $this->postJson('/api/webhooks/brevo', [
            'event' => 'deferred',
            'X-Mailin-custom' => $delivery->uuid,
        ], self::HEADERS)->assertOk();

        $this->assertSame(EmailDelivery::STATUS_DELIVERED, $delivery->fresh()->status);
    }

    public function test_duplicate_delivered_event_is_idempotent(): void
    {
        $delivery = $this->makeDelivery();
        $payload = [
            'event' => 'delivered',
            'X-Mailin-custom' => $delivery->uuid,
        ];

        $this->postJson('/api/webhooks/brevo', $payload, self::HEADERS)->assertOk();
        $this->postJson('/api/webhooks/brevo', $payload, self::HEADERS)->assertOk();

        $this->assertSame(EmailDelivery::STATUS_DELIVERED, $delivery->fresh()->status);
        $this->assertDatabaseCount('email_suppressions', 0);
    }

    public function test_unmatched_event_acks_and_suppresses_by_email(): void
    {
        $this->postJson('/api/webhooks/brevo', [
            'event' => 'hard_bounce',
            'email' => 'ghost@example.com',
            'message-id' => '<not-real@relay.brevo.com>',
        ], self::HEADERS)->assertOk();

        // Still protects reputation even without a matching delivery row.
        $this->assertSame(
            EmailDelivery::fingerprint('ghost@example.com'),
            EmailSuppression::firstOrFail()->fingerprint
        );
    }

    public function test_batched_event_payload(): void
    {
        $delivery = $this->makeDelivery();

        $this->postJson('/api/webhooks/brevo', [
            ['event' => 'delivered', 'X-Mailin-custom' => $delivery->uuid],
            ['event' => 'delivered', 'X-Mailin-custom' => $delivery->uuid],
        ], self::HEADERS)->assertOk();

        $this->assertSame(EmailDelivery::STATUS_DELIVERED, $delivery->fresh()->status);
    }

    public function test_malformed_payload_acks_without_processing(): void
    {
        $this->postJson('/api/webhooks/brevo', ['foo' => 'bar'], self::HEADERS)
            ->assertOk()
            ->assertJson(['processed' => 0]);
    }
}
