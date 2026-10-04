<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailDelivery extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_ACCEPTED = 'accepted';
    public const STATUS_DELIVERED = 'delivered';
    public const STATUS_DEFERRED = 'deferred';
    public const STATUS_BOUNCED = 'bounced';
    public const STATUS_BLOCKED = 'blocked';
    public const STATUS_COMPLAINT = 'complaint';
    public const STATUS_FAILED = 'failed';
    public const STATUS_SUPPRESSED = 'suppressed';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_UNKNOWN = 'unknown';

    public const TERMINAL_STATUSES = [
        self::STATUS_DELIVERED,
        self::STATUS_BOUNCED,
        self::STATUS_BLOCKED,
        self::STATUS_COMPLAINT,
        self::STATUS_FAILED,
        self::STATUS_SUPPRESSED,
        self::STATUS_EXPIRED,
    ];

    public const FAILURE_PERMANENT = 'permanent';
    public const FAILURE_RETRYABLE = 'retryable';
    public const FAILURE_UNKNOWN = 'unknown';

    protected $fillable = [
        'uuid',
        'event_key',
        'occurrence_key',
        'source_type',
        'source_id',
        'user_id',
        'customer_id',
        'recipient_email',
        'recipient_fingerprint',
        'payload',
        'suppression',
        'status',
        'attempts',
        'max_attempts',
        'next_attempt_at',
        'locked_at',
        'locked_by',
        'dispatched_at',
        'last_attempt_at',
        'provider_message_id',
        'provider_status',
        'failure_class',
        'failure_code',
        'expires_at',
        'accepted_at',
        'delivered_at',
        'finished_at',
    ];

    protected $casts = [
        'attempts' => 'integer',
        'max_attempts' => 'integer',
        'next_attempt_at' => 'datetime',
        'locked_at' => 'datetime',
        'dispatched_at' => 'datetime',
        'last_attempt_at' => 'datetime',
        'expires_at' => 'datetime',
        'accepted_at' => 'datetime',
        'delivered_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public static function fingerprint(string $email): string
    {
        return hash_hmac('sha256', strtolower(trim($email)), (string) config('app.key'));
    }

    public function isTerminal(): bool
    {
        return in_array($this->status, self::TERMINAL_STATUSES, true);
    }
}
