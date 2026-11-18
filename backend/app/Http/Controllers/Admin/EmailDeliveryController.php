<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\EmailDelivery;
use App\Models\EmailSuppression;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;

/**
 * Read-only admin observability over the email_deliveries outbox and the
 * recipient suppression list. Payloads stay opaque — admins see delivery
 * metadata, the decrypted recipient, and timestamps, never the rendered
 * body or embedded tokens.
 */
class EmailDeliveryController extends Controller
{
    /**
     * GET /api/admin/email-deliveries
     * Filters: status, event_key, recipient (plaintext → fingerprint),
     * date_from/date_to (created_at), search (event_key). Paginated.
     * Returns per-status counts alongside the page.
     */
    public function index(Request $request)
    {
        $query = EmailDelivery::query();

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        if ($request->filled('event_key') && $request->event_key !== 'all') {
            $query->where('event_key', $request->event_key);
        }

        if ($request->filled('recipient')) {
            $query->where('recipient_fingerprint', EmailDelivery::fingerprint($request->recipient));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        if ($request->filled('search')) {
            $term = '%' . $request->search . '%';
            $query->where(function ($q) use ($term) {
                $q->where('event_key', 'like', $term)
                    ->orWhere('occurrence_key', 'like', $term)
                    ->orWhere('uuid', 'like', $term);
            });
        }

        $counts = EmailDelivery::selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        $perPage = min((int) $request->get('per_page', 20), 100);
        $rows = $query->orderByDesc('created_at')->paginate($perPage);

        $rows->getCollection()->transform(fn (EmailDelivery $d) => $this->present($d));

        return response()->json([
            'deliveries' => $rows,
            'status_counts' => $counts,
        ]);
    }

    /**
     * GET /api/admin/email-deliveries/{id}
     */
    public function show(int $id)
    {
        $delivery = EmailDelivery::findOrFail($id);

        return response()->json(['delivery' => $this->present($delivery, true)]);
    }

    /**
     * GET /api/admin/email-suppressions — active + released rows.
     */
    public function suppressions(Request $request)
    {
        $query = EmailSuppression::orderByDesc('created_at');

        if ($request->boolean('active')) {
            $query->whereNull('released_at');
        }

        return response()->json([
            'suppressions' => $query->paginate(min((int) $request->get('per_page', 50), 100)),
        ]);
    }

    /**
     * DELETE /api/admin/email-suppressions/{id} — releases an address so
     * future sends may reach it again (sets released_at; row is retained).
     */
    public function releaseSuppression(int $id)
    {
        $suppression = EmailSuppression::findOrFail($id);
        $suppression->update(['released_at' => now()]);

        return response()->json(['message' => 'Suppression released', 'suppression' => $suppression]);
    }

    private function present(EmailDelivery $d, bool $detail = false): array
    {
        $base = [
            'id' => $d->id,
            'uuid' => $d->uuid,
            'event_key' => $d->event_key,
            'occurrence_key' => $d->occurrence_key,
            'status' => $d->status,
            'provider_status' => $d->provider_status,
            'attempts' => $d->attempts,
            'max_attempts' => $d->max_attempts,
            'failure_class' => $d->failure_class,
            'failure_code' => $d->failure_code,
            'created_at' => $d->created_at,
            'dispatched_at' => $d->dispatched_at,
            'last_attempt_at' => $d->last_attempt_at,
            'accepted_at' => $d->accepted_at,
            'delivered_at' => $d->delivered_at,
            'finished_at' => $d->finished_at,
            'expires_at' => $d->expires_at,
        ];

        if ($detail) {
            $base['source_type'] = $d->source_type;
            $base['source_id'] = $d->source_id;
            $base['user_id'] = $d->user_id;
            $base['customer_id'] = $d->customer_id;
            $base['provider_message_id'] = $d->provider_message_id;
            $base['locked_by'] = $d->locked_by;
            $base['locked_at'] = $d->locked_at;
            $base['recipient_email'] = $this->decrypt($d->recipient_email);
            // The decrypted suppression descriptor is intentionally never
            // exposed — auth descriptors embed live bearer tokens
            // (token_row checks) that must not leave the backend.
        }

        return $base;
    }

    private function decrypt(?string $value): ?string
    {
        if (!$value) {
            return null;
        }
        try {
            return Crypt::decryptString($value);
        } catch (\Throwable) {
            return null;
        }
    }
}
