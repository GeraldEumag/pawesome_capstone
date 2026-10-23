<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class VisitConsent extends Model
{
    public const STATUS_SIGNED = 'signed';
    public const STATUS_REVOKED = 'revoked';

    public const TYPE_GENERAL_TREATMENT = 'general_treatment';
    public const TYPE_SURGERY = 'surgery';
    public const TYPE_ANESTHESIA = 'anesthesia';
    public const TYPE_CONFINEMENT = 'confinement';
    public const TYPE_EUTHANASIA = 'euthanasia';
    public const TYPE_OTHER = 'other';

    protected $fillable = [
        'consentable_type',
        'consentable_id',
        'type',
        'title',
        'body',
        'signer_name',
        'signer_relationship',
        'channel',
        'signed_by_user_id',
        'signed_at',
        'status',
        'revoked_at',
        'revoked_by',
        'revoke_reason',
    ];

    protected $casts = [
        'signed_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function consentable(): MorphTo
    {
        return $this->morphTo();
    }

    public function signedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'signed_by_user_id');
    }
}
