<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'address',
        'notes',
        'telegram_chat_id',
        'notification_preferences',
        'loyalty_points',
        'is_active',
        'user_id',
    ];

    protected $appends = ['profile_photo'];

    protected $casts = [
        'notification_preferences' => 'array',
        'loyalty_points' => 'integer',
        'is_active' => 'boolean',
    ];

    public function getProfilePhotoAttribute(): ?string
    {
        $userId = $this->user_id ?? $this->user?->id;
        if (!$userId) return null;
        // Delegate to the linked user's accessor
        $user = $this->relationLoaded('user') ? $this->user : \App\Models\User::find($userId);
        return $user?->profile_photo ?? null;
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function addLoyaltyPoints($points)
    {
        $this->increment('loyalty_points', $points);
    }

    public function deductLoyaltyPoints($points)
    {
        $this->decrement('loyalty_points', $points);
    }

    public function pets()
    {
        return $this->hasMany(Pet::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(CustomerOrder::class, 'customer_id', 'user_id');
    }

    public function serviceRequests(): HasMany
    {
        return $this->hasMany(ServiceRequest::class, 'customer_id', 'user_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
