<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailSuppression extends Model
{
    /** Provider/operator reasons a recipient fingerprint may be suppressed. */
    public const REASON_HARD_BOUNCE = 'hard_bounce';
    public const REASON_INVALID = 'invalid_email';
    public const REASON_BLOCKED = 'blocked';
    public const REASON_SPAM = 'spam';
    public const REASON_MANUAL = 'manual';

    /**
     * Reasons that suppress every send, including auth emails — the mailbox
     * provably cannot receive anything (or the provider refuses it).
     */
    public const SUPPRESS_ALL_REASONS = [
        self::REASON_HARD_BOUNCE,
        self::REASON_INVALID,
        self::REASON_BLOCKED,
        self::REASON_MANUAL,
    ];

    protected $fillable = [
        'fingerprint',
        'reason',
        'source_delivery_id',
        'released_at',
    ];

    protected $casts = [
        'released_at' => 'datetime',
    ];

    /**
     * Record (idempotently) an active suppression for a fingerprint.
     * A previously released address is re-suppressed rather than skipped.
     */
    public static function suppress(string $fingerprint, string $reason, ?int $sourceDeliveryId = null): self
    {
        $row = static::firstOrNew(['fingerprint' => $fingerprint]);
        $row->reason = $reason;
        $row->source_delivery_id = $sourceDeliveryId;
        $row->released_at = null;
        $row->save();

        return $row;
    }

    /**
     * Whether an active suppression blocks a send for the given event key.
     * Spam complaints suppress non-auth mail only; everything else blocks
     * all sends including auth (dead mailboxes cannot recover accounts).
     */
    public static function blocks(string $fingerprint, string $eventKey): bool
    {
        $rows = static::where('fingerprint', $fingerprint)->whereNull('released_at')->get();

        foreach ($rows as $row) {
            if (in_array($row->reason, self::SUPPRESS_ALL_REASONS, true)) {
                return true;
            }
            if ($row->reason === self::REASON_SPAM && !str_starts_with($eventKey, 'auth.')) {
                return true;
            }
        }

        return false;
    }
}
