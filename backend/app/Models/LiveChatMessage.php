<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LiveChatMessage extends Model
{
    protected $fillable = [
        'session_id',
        'sender_type',
        'sender_id',
        'sender_name',
        'message',
        'is_read_by_staff',
        'is_read_by_customer',
    ];

    protected $casts = [
        'is_read_by_staff' => 'boolean',
        'is_read_by_customer' => 'boolean',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(LiveChatSession::class, 'session_id');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }
}
