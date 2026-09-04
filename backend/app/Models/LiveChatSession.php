<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LiveChatSession extends Model
{
    protected $fillable = [
        'customer_id',
        'customer_name',
        'customer_email',
        'status',
        'assigned_to',
        'last_message_at',
        'closed_at',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function messages(): HasMany
    {
        return $this->hasMany(LiveChatMessage::class, 'session_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    public function assignedStaff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function lastMessage()
    {
        return $this->hasOne(LiveChatMessage::class, 'session_id')->latestOfMany();
    }

    public function unreadByStaffCount(): int
    {
        return $this->messages()->where('sender_type', 'customer')->where('is_read_by_staff', false)->count();
    }
}
