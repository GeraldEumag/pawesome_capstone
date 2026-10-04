<?php

namespace Tests\Feature;

use App\Jobs\SendEmailDelivery;
use App\Mail\EmailVerificationMail;
use App\Models\EmailDelivery;
use App\Models\User;
use App\Services\EmailDeliveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Exception\TransportException;
use Tests\TestCase;

/**
 * Phase 2 durable outbox: intent durability, dedup, atomic claiming,
 * synchronous send, suppression, failure classification, and recovery.
 */
class EmailDeliveryOutboxTest extends TestCase
{
    use RefreshDatabase;

    private function service(): EmailDeliveryService
    {
        return app(EmailDeliveryService::class);
    }

    private function mailable(): EmailVerificationMail
    {
        return new EmailVerificationMail('secret-token-123', 'customer@example.com', 'Test Customer');
    }

    private function context(array $overrides = []): array
    {
        return array_merge([
            'event_key' => 'auth.email_verification',
            'occurrence_key' => 'user:1:verify',
            'recipient' => 'Customer@Example.com',
            'user_id' => 1,
            'dispatch' => false,
        ], $overrides);
    }

    public function test_intent_persists_encrypted_deduplicated_delivery(): void
    {
        $delivery = $this->service()->intent($this->mailable(), $this->context());

        $this->assertDatabaseCount('email_deliveries', 1);
        $delivery->refresh();

        $this->assertSame(EmailDelivery::STATUS_PENDING, $delivery->status);
        $this->assertSame(EmailDelivery::fingerprint('customer@example.com'), $delivery->recipient_fingerprint);
        $this->assertSame('customer@example.com', Crypt::decryptString($delivery->recipient_email));

        // Raw columns never expose the recipient or token in plaintext.
        $this->assertStringNotContainsString('customer@example.com', $delivery->recipient_email);
        $this->assertStringNotContainsString('secret-token-123', $delivery->payload);

        // Same occurrence → same row, nothing duplicated.
        $again = $this->service()->intent($this->mailable(), $this->context());
        $this->assertSame($delivery->id, $again->id);
        $this->assertDatabaseCount('email_deliveries', 1);
    }

    public function test_intent_rolls_back_with_business_transaction(): void
    {
        DB::beginTransaction();
        $this->service()->intent($this->mailable(), $this->context());
        DB::rollBack();

        $this->assertDatabaseCount('email_deliveries', 0);
    }

    public function test_send_claims_and_sends_synchronously_exactly_once(): void
    {
        Mail::fake();
        $delivery = $this->service()->intent($this->mailable(), $this->context());

        $outcome = $this->service()->send($delivery->id, 'worker:1');

        $this->assertSame('accepted', $outcome);
        // sendNow records a sent mailable — not a queued one — even though
        // EmailVerificationMail implements ShouldQueue.
        Mail::assertSent(EmailVerificationMail::class, fn ($m) => $m->hasTo('customer@example.com'));
        Mail::assertNotQueued(EmailVerificationMail::class);

        $delivery->refresh();
        $this->assertSame(EmailDelivery::STATUS_ACCEPTED, $delivery->status);
        $this->assertSame(1, $delivery->attempts);
        $this->assertNotNull($delivery->accepted_at);
        $this->assertNull($delivery->locked_at);

        // A second claim loses — the row is no longer pending.
        $this->assertSame('skipped', $this->service()->send($delivery->id, 'worker:2'));
        Mail::assertSentCount(1);
    }

    public function test_expired_delivery_is_suppressed_from_sending(): void
    {
        Mail::fake();
        $delivery = $this->service()->intent($this->mailable(), $this->context([
            'expires_at' => now()->subMinute(),
        ]));

        $this->assertSame('expired', $this->service()->send($delivery->id, 'worker:1'));
        $this->assertSame(EmailDelivery::STATUS_EXPIRED, $delivery->fresh()->status);
        Mail::assertNothingSent();
    }

    public function test_consumed_or_replaced_auth_token_suppresses_delivery(): void
    {
        Mail::fake();
        DB::table('password_reset_tokens')->insert([
            'email' => 'customer@example.com',
            'token' => Hash::make('secret-token-123'),
            'created_at' => now(),
        ]);

        $suppression = [['type' => 'token_row', 'table' => 'password_reset_tokens',
            'email' => 'customer@example.com', 'token' => 'secret-token-123']];

        // Valid unconsumed token → delivers.
        $delivery = $this->service()->intent($this->mailable(), $this->context([
            'suppression' => $suppression,
        ]));
        $this->assertSame('accepted', $this->service()->send($delivery->id, 'worker:1'));

        // Consumed (row deleted) → suppressed.
        $consumed = $this->service()->intent($this->mailable(), $this->context([
            'occurrence_key' => 'user:1:verify:2',
            'suppression' => $suppression,
        ]));
        DB::table('password_reset_tokens')->where('email', 'customer@example.com')->delete();
        $this->assertSame('suppressed', $this->service()->send($consumed->id, 'worker:1'));
        $this->assertSame(EmailDelivery::STATUS_SUPPRESSED, $consumed->fresh()->status);

        // Replaced (different hash) → suppressed.
        DB::table('password_reset_tokens')->insert([
            'email' => 'customer@example.com',
            'token' => Hash::make('different-token'),
            'created_at' => now(),
        ]);
        $replaced = $this->service()->intent($this->mailable(), $this->context([
            'occurrence_key' => 'user:1:verify:3',
            'suppression' => $suppression,
        ]));
        $this->assertSame('suppressed', $this->service()->send($replaced->id, 'worker:1'));

        Mail::assertSentCount(1);
    }

    public function test_inactive_recipient_suppresses_delivery(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer', 'is_active' => false]);

        $delivery = $this->service()->intent($this->mailable(), $this->context([
            'suppression' => [['type' => 'user_active', 'user_id' => $user->id]],
        ]));

        $this->assertSame('suppressed', $this->service()->send($delivery->id, 'worker:1'));
        Mail::assertNothingSent();
    }

    public function test_retryable_failure_reschedules_then_fails_permanently(): void
    {
        $delivery = $this->service()->intent($this->mailable(), $this->context());
        $exception = new TransportException('Connection refused');

        Mail::shouldReceive('to')->andReturnSelf();
        Mail::shouldReceive('sendNow')->andThrow($exception);

        $this->assertSame('retry_scheduled', $this->service()->send($delivery->id, 'worker:1'));
        $delivery->refresh();
        $this->assertSame(EmailDelivery::STATUS_PENDING, $delivery->status);
        $this->assertSame(EmailDelivery::FAILURE_RETRYABLE, $delivery->failure_class);
        $this->assertSame('connection_error', $delivery->failure_code);
        $this->assertTrue($delivery->next_attempt_at->greaterThan(now()->addSeconds(50)));

        // Exhausted attempts become a permanent failure, not an endless retry.
        $delivery->update([
            'attempts' => 4,
            'next_attempt_at' => now()->subSecond(),
        ]);
        $this->assertSame('failed', $this->service()->send($delivery->id, 'worker:1'));
        $this->assertSame(EmailDelivery::STATUS_FAILED, $delivery->fresh()->status);
    }

    public function test_timeout_is_classified_unknown_and_never_auto_retried(): void
    {
        $delivery = $this->service()->intent($this->mailable(), $this->context());

        Mail::shouldReceive('to')->andReturnSelf();
        Mail::shouldReceive('sendNow')->andThrow(new TransportException('Connection timed out'));

        $this->assertSame('unknown', $this->service()->send($delivery->id, 'worker:1'));
        $delivery->refresh();
        $this->assertSame(EmailDelivery::STATUS_UNKNOWN, $delivery->status);
        $this->assertSame('provider_timeout', $delivery->failure_code);
        $this->assertNull($delivery->next_attempt_at);

        // Not eligible for retry without explicit reconciliation.
        [$ok, $reason] = $this->service()->requestRetry($delivery);
        $this->assertFalse($ok);
        $this->assertStringContainsString('reconciled', $reason);

        Bus::fake();
        [$ok] = $this->service()->requestRetry($delivery, reconciled: true);
        $this->assertTrue($ok);
        $this->assertSame(EmailDelivery::STATUS_PENDING, $delivery->fresh()->status);
        Bus::assertDispatched(SendEmailDelivery::class);
    }

    public function test_permanent_failure_marks_failed_without_retry(): void
    {
        $delivery = $this->service()->intent($this->mailable(), $this->context());

        Mail::shouldReceive('to')->andReturnSelf();
        Mail::shouldReceive('sendNow')->andThrow(
            new TransportException('Invalid recipient address rejected by provider')
        );

        $this->assertSame('failed', $this->service()->send($delivery->id, 'worker:1'));
        $delivery->refresh();
        $this->assertSame(EmailDelivery::STATUS_FAILED, $delivery->status);
        $this->assertSame(EmailDelivery::FAILURE_PERMANENT, $delivery->failure_class);
        $this->assertSame('invalid_recipient', $delivery->failure_code);
        $this->assertNull($delivery->next_attempt_at);
    }

    public function test_failure_classification_boundaries(): void
    {
        $svc = $this->service();

        $this->assertSame(
            [EmailDelivery::FAILURE_UNKNOWN, 'provider_timeout'],
            $svc->classifyFailure(new TransportException('Request timed out'))
        );
        $this->assertSame(
            [EmailDelivery::FAILURE_RETRYABLE, 'connection_error'],
            $svc->classifyFailure(new TransportException('Connection refused'))
        );
        $this->assertSame(
            [EmailDelivery::FAILURE_RETRYABLE, 'provider_5xx'],
            $svc->classifyFailure(new TransportException('Provider returned 503 unavailable'))
        );
        $this->assertSame(
            [EmailDelivery::FAILURE_PERMANENT, 'invalid_recipient'],
            $svc->classifyFailure(new TransportException('Invalid recipient mailbox'))
        );
        $this->assertSame(
            [EmailDelivery::FAILURE_PERMANENT, 'provider_auth'],
            $svc->classifyFailure(new TransportException('401 unauthorized'))
        );
    }

    public function test_dispatch_due_republishes_missed_pending_intents(): void
    {
        Bus::fake();
        $delivery = $this->service()->intent($this->mailable(), $this->context());

        $this->artisan('email-deliveries:dispatch')->assertSuccessful();
        Bus::assertDispatched(SendEmailDelivery::class, fn ($job) => $job->deliveryId === $delivery->id);

        // A recently dispatched row is not republished inside the sweep window.
        Bus::fake();
        $this->artisan('email-deliveries:dispatch')->assertSuccessful();
        Bus::assertNotDispatched(SendEmailDelivery::class);

        // After the republish window a still-pending row is recovered.
        $delivery->update(['dispatched_at' => now()->subSeconds(120)]);
        $this->artisan('email-deliveries:dispatch')->assertSuccessful();
        Bus::assertDispatched(SendEmailDelivery::class);
    }

    public function test_reconcile_expires_pending_and_marks_stale_processing_unknown(): void
    {
        $expired = $this->service()->intent($this->mailable(), $this->context([
            'occurrence_key' => 'k:expired',
            'expires_at' => now()->subMinute(),
        ]));
        $stale = $this->service()->intent($this->mailable(), $this->context([
            'occurrence_key' => 'k:stale',
        ]));
        $stale->update([
            'status' => EmailDelivery::STATUS_PROCESSING,
            'locked_at' => now()->subMinutes(20),
            'locked_by' => 'crashed-worker',
        ]);

        $this->artisan('email-deliveries:reconcile')->assertSuccessful();

        $this->assertSame(EmailDelivery::STATUS_EXPIRED, $expired->fresh()->status);
        $fresh = $stale->fresh();
        $this->assertSame(EmailDelivery::STATUS_UNKNOWN, $fresh->status);
        $this->assertSame('stale_processing', $fresh->failure_code);
        $this->assertNull($fresh->locked_at);
    }

    public function test_retry_command_refuses_terminal_and_accepted_deliveries(): void
    {
        $delivered = $this->service()->intent($this->mailable(), $this->context([
            'occurrence_key' => 'k:delivered',
        ]));
        $delivered->update(['status' => EmailDelivery::STATUS_DELIVERED]);

        $this->artisan('email-deliveries:retry', ['delivery' => $delivered->id])
            ->assertFailed();

        $accepted = $this->service()->intent($this->mailable(), $this->context([
            'occurrence_key' => 'k:accepted',
        ]));
        $accepted->update(['status' => EmailDelivery::STATUS_ACCEPTED]);

        $this->artisan('email-deliveries:retry', ['delivery' => $accepted->id])
            ->assertFailed();
    }

    public function test_job_sends_via_service_and_claims_once(): void
    {
        Mail::fake();
        $delivery = $this->service()->intent($this->mailable(), $this->context());

        SendEmailDelivery::dispatchSync($delivery->id);

        Mail::assertSent(EmailVerificationMail::class);
        $this->assertSame(EmailDelivery::STATUS_ACCEPTED, $delivery->fresh()->status);
    }
}
