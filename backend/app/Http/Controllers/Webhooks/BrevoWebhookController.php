<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\EmailDelivery;
use App\Models\EmailSuppression;
use App\Services\EmailDeliveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Receives Brevo transactional webhook events and reconciles outbox rows.
 *
 * Brevo webhooks carry no HMAC signature, so authentication is a shared
 * secret sent as the X-Pawesome-Webhook-Secret header (configurable in the
 * Brevo webhook's custom-headers setting) or a ?secret= query token.
 *
 * Correlation: the delivery uuid is echoed back via the X-Mailin-custom
 * header stamped at send time; Brevo's message-id is the fallback.
 *
 * The endpoint always answers 200 once authorized — Brevo retries on
 * non-2xx and every replay is a no-op anyway because terminal outbox
 * statuses never regress.
 */
class BrevoWebhookController extends Controller
{
    /** Events that mean the recipient is a dead or unwilling address. */
    private const SUPPRESSING_EVENTS = [
        'hard_bounce' => EmailSuppression::REASON_HARD_BOUNCE,
        'invalid_email' => EmailSuppression::REASON_INVALID,
        'blocked' => EmailSuppression::REASON_BLOCKED,
        'spam' => EmailSuppression::REASON_SPAM,
    ];

    public function handle(Request $request, EmailDeliveryService $deliveries): JsonResponse
    {
        $secret = (string) config('services.brevo.webhook_secret', '');
        if ($secret === '') {
            Log::error('Brevo webhook hit but BREVO_WEBHOOK_SECRET is not configured');
            return response()->json(['message' => 'Webhook not configured'], 503);
        }

        $provided = (string) ($request->header('X-Pawesome-Webhook-Secret') ?: $request->query('secret', ''));
        if (!hash_equals($secret, $provided)) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        // Brevo posts a single event object, or a JSON array when the
        // webhook is configured as batched.
        $payload = $request->json()->all();
        $events = array_is_list($payload) ? $payload : [$payload];

        $processed = 0;
        foreach ($events as $item) {
            if ($this->processEvent($item, $deliveries)) {
                $processed++;
            }
        }

        return response()->json(['processed' => $processed]);
    }

    private function processEvent(mixed $item, EmailDeliveryService $deliveries): bool
    {
        if (!is_array($item)) {
            return false;
        }

        $event = $item['event'] ?? null;
        if (!is_string($event) || $event === '') {
            return false;
        }

        $delivery = $this->resolveDelivery($item);

        if ($delivery) {
            $status = $deliveries->recordProviderEvent($delivery, $event);
            Log::info('Brevo event applied', [
                'delivery_id' => $delivery->id,
                'event' => $event,
                'status' => $status,
            ]);
        } else {
            Log::warning('Brevo event did not match a delivery', ['event' => $event]);
        }

        // Suppression signals stand on their own — a dead address is dead
        // even when the delivery row can no longer be correlated.
        if (isset(self::SUPPRESSING_EVENTS[$event])) {
            $fingerprint = $delivery?->recipient_fingerprint
                ?? (isset($item['email']) && is_string($item['email'])
                    ? EmailDelivery::fingerprint($item['email'])
                    : null);

            if ($fingerprint) {
                EmailSuppression::suppress(
                    $fingerprint,
                    self::SUPPRESSING_EVENTS[$event],
                    $delivery?->id,
                );
            }
        }

        return true;
    }

    private function resolveDelivery(array $item): ?EmailDelivery
    {
        $uuid = $item['X-Mailin-custom'] ?? null;
        if (is_string($uuid) && $uuid !== '') {
            $delivery = EmailDelivery::where('uuid', trim($uuid))->first();
            if ($delivery) {
                return $delivery;
            }
        }

        $messageId = $item['message-id'] ?? null;
        if (is_string($messageId) && $messageId !== '') {
            // Brevo wraps the id in angle brackets in some payloads.
            $normalized = trim($messageId, "<> \t\n\r\0\x0B");
            return EmailDelivery::where('provider_message_id', $messageId)
                ->orWhere('provider_message_id', $normalized)
                ->orWhere('provider_message_id', "<{$normalized}>")
                ->first();
        }

        return null;
    }
}
