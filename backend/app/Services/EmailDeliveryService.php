<?php

namespace App\Services;

use App\Jobs\SendEmailDelivery;
use App\Mail\CustomerNotificationMail;
use App\Mail\PaymentReceiptMail;
use App\Models\Customer;
use App\Models\EmailDelivery;
use App\Models\SystemSetting;
use Illuminate\Contracts\Mail\Mailable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

/**
 * Durable email-delivery outbox.
 *
 * Producers record an intent inside the business transaction; the queue
 * worker claims committed rows atomically and sends through Laravel
 * Mail's verified synchronous path (sendNow). Dispatch state and
 * provider outcome are tracked separately — an accepted send is not a
 * delivery, and an unknown outcome is never blindly retried.
 */
class EmailDeliveryService
{
    /** Seconds a 'processing' claim may go silent before reconcile marks it unknown. */
    public const LOCK_LEASE_SECONDS = 600;

    /** Backoff between retryable attempts (seconds), by attempt ordinal. */
    private const BACKOFF_SECONDS = [60, 300, 900];

    /** How long a dispatched-but-never-claimed row waits before the sweep republishes it. */
    private const REPUBLISH_AFTER_SECONDS = 90;

    /**
     * Record a delivery intent. Must be called inside the business
     * transaction — a rollback removes the intent; a commit makes it
     * dispatchable via the after-commit hook and the scheduled sweep.
     *
     * Context: event_key, occurrence_key (dedup identity), recipient,
     * source_type, source_id, user_id, customer_id, expires_at,
     * max_attempts, suppression (descriptor array), dispatch (bool).
     */
    public function intent(Mailable $mailable, array $context): EmailDelivery
    {
        $recipient = strtolower(trim((string) $context['recipient']));

        $delivery = EmailDelivery::createOrFirst(
            [
                'event_key' => $context['event_key'],
                'occurrence_key' => $context['occurrence_key'],
            ],
            [
                'uuid' => (string) Str::uuid(),
                'source_type' => $context['source_type'] ?? null,
                'source_id' => $context['source_id'] ?? null,
                'user_id' => $context['user_id'] ?? null,
                'customer_id' => $context['customer_id'] ?? null,
                'recipient_email' => Crypt::encryptString($recipient),
                'recipient_fingerprint' => EmailDelivery::fingerprint($recipient),
                'payload' => Crypt::encryptString(serialize($mailable)),
                'suppression' => isset($context['suppression'])
                    ? Crypt::encryptString(json_encode($context['suppression']))
                    : null,
                'status' => EmailDelivery::STATUS_PENDING,
                'attempts' => 0,
                'max_attempts' => $context['max_attempts'] ?? 4,
                'expires_at' => $context['expires_at'] ?? null,
            ]
        );

        if ($delivery->wasRecentlyCreated && ($context['dispatch'] ?? true)) {
            $delivery->update(['dispatched_at' => now()]);
            SendEmailDelivery::dispatch($delivery->id)->afterCommit();
        }

        return $delivery;
    }

    /**
     * Republish due pending intents whose queue publication was missed
     * (worker down at commit time, lost job, etc.). Called by the
     * scheduler — safe to run repeatedly.
     */
    public function dispatchDue(int $limit = 100): int
    {
        $ids = EmailDelivery::where('status', EmailDelivery::STATUS_PENDING)
            ->where(fn ($q) => $q->whereNull('next_attempt_at')->orWhere('next_attempt_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('dispatched_at')->orWhere('dispatched_at', '<=', now()->subSeconds(self::REPUBLISH_AFTER_SECONDS)))
            ->limit($limit)
            ->pluck('id');

        foreach ($ids as $id) {
            EmailDelivery::where('id', $id)
                ->where('status', EmailDelivery::STATUS_PENDING)
                ->update(['dispatched_at' => now()]);
            SendEmailDelivery::dispatch($id);
        }

        return $ids->count();
    }

    /**
     * Claim a delivery atomically and send it. Returns an outcome key:
     * skipped, expired, suppressed, accepted, retry_scheduled, failed, unknown.
     */
    public function send(int $deliveryId, string $worker): string
    {
        $claimed = EmailDelivery::where('id', $deliveryId)
            ->where('status', EmailDelivery::STATUS_PENDING)
            ->where(fn ($q) => $q->whereNull('next_attempt_at')->orWhere('next_attempt_at', '<=', now()))
            ->update([
                'status' => EmailDelivery::STATUS_PROCESSING,
                'locked_by' => $worker,
                'locked_at' => now(),
                'last_attempt_at' => now(),
                'attempts' => DB::raw('attempts + 1'),
            ]);

        if (!$claimed) {
            return 'skipped';
        }

        $delivery = EmailDelivery::findOrFail($deliveryId);

        if ($delivery->expires_at && now()->greaterThan($delivery->expires_at)) {
            return $this->finish($delivery, EmailDelivery::STATUS_EXPIRED, 'expired');
        }

        if ($this->isSuppressed($delivery)) {
            return $this->finish($delivery, EmailDelivery::STATUS_SUPPRESSED, 'suppressed');
        }

        try {
            [$mailable, $recipient] = $this->hydrate($delivery);
            $sent = Mail::to($recipient)->sendNow($mailable);
        } catch (\Throwable $e) {
            return $this->handleFailure($delivery, $e);
        }

        $delivery->update([
            'status' => EmailDelivery::STATUS_ACCEPTED,
            'provider_status' => EmailDelivery::STATUS_ACCEPTED,
            'provider_message_id' => $this->extractMessageId($sent),
            'accepted_at' => now(),
            'locked_at' => null,
            'locked_by' => null,
            'failure_class' => null,
            'failure_code' => null,
        ]);

        return 'accepted';
    }

    /**
     * Expire pending rows past their deadline and reclassify stale
     * processing rows (crash/timeout after possible provider acceptance)
     * as unknown — never auto-resent.
     */
    public function reconcile(): array
    {
        $expired = EmailDelivery::where('status', EmailDelivery::STATUS_PENDING)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->update(['status' => EmailDelivery::STATUS_EXPIRED, 'finished_at' => now()]);

        $stale = EmailDelivery::where('status', EmailDelivery::STATUS_PROCESSING)
            ->where('locked_at', '<=', now()->subSeconds(self::LOCK_LEASE_SECONDS))
            ->update([
                'status' => EmailDelivery::STATUS_UNKNOWN,
                'failure_class' => EmailDelivery::FAILURE_UNKNOWN,
                'failure_code' => 'stale_processing',
                'locked_at' => null,
                'locked_by' => null,
            ]);

        return ['expired' => $expired, 'unknown' => $stale];
    }

    /**
     * Record a customer-facing lifecycle email (request submitted,
     * approved, boarding update, reminder, …). Honors the global email
     * switch and per-customer email preference at intent time, and
     * re-checks them at send time through the suppression descriptor.
     */
    public function lifecycle(
        ?string $recipient,
        string $title,
        string $message,
        string $type,
        array $context
    ): ?EmailDelivery {
        $recipient = strtolower(trim((string) $recipient));
        if ($recipient === '') {
            return null;
        }

        if (!(bool) SystemSetting::get('notif_email_notifications', true)) {
            return null;
        }

        $userId = $context['user_id'] ?? null;
        if ($userId === null) {
            $userId = DB::table('users')->where('email', $recipient)->value('id');
        }

        $customerId = $context['customer_id'] ?? null;
        if ($customerId === null && $userId) {
            $customerId = Customer::where('user_id', $userId)->value('id');
        }

        // Intent-time preference gate (mirrors the legacy queue-time check).
        if ($customerId) {
            $customer = Customer::find($customerId);
            if ((($customer?->notification_preferences ?? [])['email'] ?? true) === false) {
                return null;
            }
        }

        $suppression = array_merge(
            $userId ? [
                ['type' => 'user_active', 'user_id' => $userId],
                ['type' => 'recipient_unchanged', 'user_id' => $userId, 'email' => $recipient],
            ] : [],
            $customerId ? [['type' => 'customer_email_enabled', 'customer_id' => $customerId]] : [],
            $context['suppression'] ?? []
        );

        return $this->intent(new CustomerNotificationMail($title, $message, $type), [
            'event_key' => $context['event_key'],
            'occurrence_key' => $context['occurrence_key'],
            'source_type' => $context['source_type'] ?? null,
            'source_id' => $context['source_id'] ?? null,
            'user_id' => $userId,
            'customer_id' => $customerId,
            'recipient' => $recipient,
            'expires_at' => $context['expires_at'] ?? now()->addDays(7),
            'suppression' => $suppression,
            'dispatch' => $context['dispatch'] ?? true,
        ]);
    }

    /**
     * Record a payment-receipt intent for a customer-facing settlement.
     * Same recipient binding and suppression gates as lifecycle() — the
     * receipt payload must already be built from persisted settlement data,
     * never from request input.
     */
    public function paymentReceipt(
        ?string $recipient,
        string $receiptType,
        array $receipt,
        array $context = []
    ): ?EmailDelivery {
        $recipient = strtolower(trim((string) $recipient));
        if ($recipient === '') {
            return null;
        }

        if (!(bool) SystemSetting::get('notif_email_notifications', true)) {
            return null;
        }

        $userId = $context['user_id'] ?? null;
        if ($userId === null) {
            $userId = DB::table('users')->where('email', $recipient)->value('id');
        }

        $customerId = $context['customer_id'] ?? null;
        if ($customerId === null && $userId) {
            $customerId = Customer::where('user_id', $userId)->value('id');
        }

        if ($customerId) {
            $customer = Customer::find($customerId);
            if ((($customer?->notification_preferences ?? [])['email'] ?? true) === false) {
                return null;
            }
        }

        $suppression = array_merge(
            $userId ? [
                ['type' => 'user_active', 'user_id' => $userId],
                ['type' => 'recipient_unchanged', 'user_id' => $userId, 'email' => $recipient],
            ] : [],
            $customerId ? [['type' => 'customer_email_enabled', 'customer_id' => $customerId]] : [],
            $context['suppression'] ?? []
        );

        return $this->intent(new PaymentReceiptMail($receiptType, $receipt), [
            'event_key' => $context['event_key'] ?? "payment.receipt.{$receiptType}",
            'occurrence_key' => $context['occurrence_key'],
            'source_type' => $context['source_type'] ?? null,
            'source_id' => $context['source_id'] ?? null,
            'user_id' => $userId,
            'customer_id' => $customerId,
            'recipient' => $recipient,
            'expires_at' => $context['expires_at'] ?? now()->addDays(30),
            'suppression' => $suppression,
            'dispatch' => $context['dispatch'] ?? true,
        ]);
    }

    /**
     * Privileged targeted retry. Terminal states and provider-accepted
     * deliveries are refused; an unknown outcome requires the operator to
     * confirm reconciliation so a possible first send is not duplicated.
     */
    public function requestRetry(EmailDelivery $delivery, bool $reconciled = false): array
    {
        if ($delivery->isTerminal()) {
            return [false, "delivery is terminal ({$delivery->status})"];
        }

        if ($delivery->status === EmailDelivery::STATUS_ACCEPTED) {
            return [false, 'provider already accepted — resending could duplicate'];
        }

        if ($delivery->status === EmailDelivery::STATUS_UNKNOWN && !$reconciled) {
            return [false, 'unknown outcome requires --reconciled after manual verification'];
        }

        $delivery->update([
            'status' => EmailDelivery::STATUS_PENDING,
            'next_attempt_at' => null,
            'locked_at' => null,
            'locked_by' => null,
            'dispatched_at' => now(),
            'failure_class' => null,
            'failure_code' => null,
        ]);

        SendEmailDelivery::dispatch($delivery->id);

        return [true, 'queued'];
    }

    private function finish(EmailDelivery $delivery, string $status, string $outcome): string
    {
        $delivery->update([
            'status' => $status,
            'finished_at' => now(),
            'locked_at' => null,
            'locked_by' => null,
        ]);

        return $outcome;
    }

    private function handleFailure(EmailDelivery $delivery, \Throwable $e): string
    {
        [$class, $code] = $this->classifyFailure($e);

        Log::warning('Email delivery attempt failed', [
            'delivery_id' => $delivery->id,
            'event_key' => $delivery->event_key,
            'failure_class' => $class,
            'failure_code' => $code,
            'exception' => get_class($e),
        ]);

        if ($class === EmailDelivery::FAILURE_PERMANENT) {
            $delivery->update([
                'status' => EmailDelivery::STATUS_FAILED,
                'failure_class' => $class,
                'failure_code' => $code,
                'finished_at' => now(),
                'locked_at' => null,
                'locked_by' => null,
            ]);

            return 'failed';
        }

        if ($class === EmailDelivery::FAILURE_RETRYABLE && $delivery->attempts < $delivery->max_attempts) {
            $delay = self::BACKOFF_SECONDS[min($delivery->attempts, count(self::BACKOFF_SECONDS)) - 1];
            $delivery->update([
                'status' => EmailDelivery::STATUS_PENDING,
                'next_attempt_at' => now()->addSeconds($delay),
                'dispatched_at' => null,
                'failure_class' => $class,
                'failure_code' => $code,
                'locked_at' => null,
                'locked_by' => null,
            ]);

            return 'retry_scheduled';
        }

        // Retryable but attempts exhausted, or the outcome is genuinely
        // unknown (possible provider acceptance) — stop, do not resend.
        $delivery->update([
            'status' => $class === EmailDelivery::FAILURE_RETRYABLE
                ? EmailDelivery::STATUS_FAILED
                : EmailDelivery::STATUS_UNKNOWN,
            'failure_class' => $class,
            'failure_code' => $code,
            'finished_at' => $class === EmailDelivery::FAILURE_RETRYABLE ? now() : null,
            'locked_at' => null,
            'locked_by' => null,
        ]);

        return $class === EmailDelivery::FAILURE_RETRYABLE ? 'failed' : 'unknown';
    }

    /**
     * Classify a send failure. Only provably-unsent failures are
     * retryable; a timeout after the request may have been accepted goes
     * to unknown for reconciliation — never blind resend.
     */
    public function classifyFailure(\Throwable $e): array
    {
        $text = strtolower(get_class($e) . ' ' . $e->getMessage());

        if (str_contains($text, 'unserialize') || str_contains($text, 'decrypt') || str_contains($text, 'payload')) {
            return [EmailDelivery::FAILURE_PERMANENT, 'corrupt_payload'];
        }

        if ($e instanceof TransportExceptionInterface || str_contains($text, 'transport')) {
            return match (true) {
                preg_match('/timed? ?out|deadline/i', $text) === 1 => [EmailDelivery::FAILURE_UNKNOWN, 'provider_timeout'],
                preg_match('/unauthori|forbidden|invalid (api|key|token|credential)|authentication|access denied|\b401\b|\b403\b/i', $text) === 1 => [EmailDelivery::FAILURE_PERMANENT, 'provider_auth'],
                preg_match('/invalid (recipient|email|address)|mailbox|recipient rejected|\b550\b|\b553\b/i', $text) === 1 => [EmailDelivery::FAILURE_PERMANENT, 'invalid_recipient'],
                preg_match('/could not|connection refused|resolve|dns|network|unreachable|ssl|connection reset/i', $text) === 1 => [EmailDelivery::FAILURE_RETRYABLE, 'connection_error'],
                preg_match('/\b5\d\d\b|server error|temporarily|unavailable|try again|rate.?limit|throttl/i', $text) === 1 => [EmailDelivery::FAILURE_RETRYABLE, 'provider_5xx'],
                default => [EmailDelivery::FAILURE_UNKNOWN, 'transport_unclassified'],
            };
        }

        // Deterministic application-level failures (bad view, missing
        // template, invalid mailable state) will fail identically on retry.
        if (preg_match('/view \[|not found|undefined|must be of type|invalid argument/i', $text) === 1) {
            return [EmailDelivery::FAILURE_PERMANENT, 'render_error'];
        }

        return [EmailDelivery::FAILURE_UNKNOWN, 'unclassified'];
    }

    /**
     * Evaluate the suppression descriptor recorded at intent time —
     * stale/consumed/replaced auth links and deactivated recipients are
     * suppressed at send time, not merely at queue time.
     */
    private function isSuppressed(EmailDelivery $delivery): bool
    {
        if (!$delivery->suppression) {
            return false;
        }

        $checks = json_decode(Crypt::decryptString($delivery->suppression), true) ?: [];

        foreach ($checks as $check) {
            $suppressed = match ($check['type'] ?? null) {
                'token_row' => $this->tokenRowConsumed($check),
                'user_active' => !DB::table('users')->where('id', $check['user_id'] ?? 0)->where('is_active', true)->exists(),
                'recipient_unchanged' => !DB::table('users')->where('id', $check['user_id'] ?? 0)->where('email', $check['email'] ?? '')->exists(),
                'customer_email_enabled' => $this->customerEmailOptedOut($check),
                'model_field' => $this->modelFieldMismatch($check),
                default => false,
            };

            if ($suppressed) {
                return true;
            }
        }

        return false;
    }

    private function tokenRowConsumed(array $check): bool
    {
        $row = DB::table($check['table'] ?? '')->where('email', $check['email'] ?? '')->first();

        return !$row || !Hash::check($check['token'] ?? '', $row->token);
    }

    private function customerEmailOptedOut(array $check): bool
    {
        $customer = Customer::find($check['customer_id'] ?? 0);

        return $customer && (($customer->notification_preferences ?? [])['email'] ?? true) === false;
    }

    private function modelFieldMismatch(array $check): bool
    {
        if (empty($check['table']) || empty($check['field'])) {
            return false;
        }

        return !DB::table($check['table'])
            ->where('id', $check['id'] ?? 0)
            ->whereIn($check['field'], $check['allowed'] ?? [])
            ->exists();
    }

    /**
     * @return array{0: Mailable, 1: string}
     */
    private function hydrate(EmailDelivery $delivery): array
    {
        return [
            unserialize(Crypt::decryptString($delivery->payload)),
            Crypt::decryptString($delivery->recipient_email),
        ];
    }

    private function extractMessageId($sent): ?string
    {
        try {
            return $sent?->getSymfonySentMessage()?->getMessageId();
        } catch (\Throwable) {
            return null;
        }
    }
}
