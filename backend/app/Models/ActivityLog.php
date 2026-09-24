<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ActivityLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'actor_role',
        'action',
        'description',
        'category',
        'subcategory',
        'reference_type',
        'reference_id',
        'metadata',
        'changes',
        'ip_address',
        'user_agent',
        'status',
    ];

    protected $casts = [
        'metadata' => 'array',
        'changes' => 'array',
    ];

    /**
     * Keys that must never be written to audit metadata/changes — credentials,
     * tokens, and uploaded file payloads are redacted before persistence.
     */
    private const SENSITIVE_KEY_PATTERN = '/password|token|secret|api_key|proof|photo|image|file|content|card|base64/i';

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Log a user activity. Actor id/role, IP, and user agent are resolved
     * server-side — callers (and therefore clients) cannot supply them.
     */
    public static function log($userId, $action, $description = null, $options = [])
    {
        return self::create([
            'user_id' => $userId,
            'actor_role' => $options['actor_role'] ?? self::resolveActorRole($userId),
            'action' => $action,
            'description' => $description,
            'category' => $options['category'] ?? 'general',
            'subcategory' => $options['subcategory'] ?? null,
            'reference_type' => $options['reference_type'] ?? null,
            'reference_id' => $options['reference_id'] ?? null,
            'metadata' => self::sanitize($options['metadata'] ?? null),
            'changes' => self::sanitize($options['changes'] ?? null),
            'ip_address' => $options['ip_address'] ?? request()->ip(),
            'user_agent' => $options['user_agent'] ?? request()->userAgent(),
            'status' => $options['status'] ?? 'completed',
        ]);
    }

    /**
     * Log activity for the authenticated user
     */
    public static function logForAuthUser($action, $description = null, $options = [])
    {
        $userId = auth()->id();
        if (!$userId) {
            return null;
        }
        return self::log($userId, $action, $description, $options);
    }

    private static function resolveActorRole($userId): ?string
    {
        if (!$userId) {
            return null;
        }

        $authUser = auth()->user();
        if ($authUser && (int) $authUser->id === (int) $userId) {
            return $authUser->role;
        }

        return User::whereKey($userId)->value('role');
    }

    /**
     * Recursively redact sensitive keys and non-scalar payloads so secrets and
     * file contents can never reach the audit trail.
     */
    private static function sanitize($value)
    {
        if (!is_array($value)) {
            return $value;
        }

        $clean = [];
        foreach ($value as $key => $item) {
            if (is_string($key) && preg_match(self::SENSITIVE_KEY_PATTERN, $key)) {
                $clean[$key] = '[redacted]';
                continue;
            }
            $clean[$key] = is_array($item)
                ? self::sanitize($item)
                : (is_scalar($item) || is_null($item) ? $item : '[redacted]');
        }

        return $clean;
    }
}
