<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use HasFactory, SoftDeletes;

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
        'deletion_reason',
        'deleted_by',
    ];

    protected $appends = ['profile_photo'];

    protected $casts = [
        'notification_preferences' => 'array',
        'loyalty_points' => 'integer',
        'is_active' => 'boolean',
    ];

    /**
     * Soft-delete frees the unique email index so the same address can
     * register again; the original is kept in original_email for the
     * audit trail and the restore path.
     */
    protected static function booted(): void
    {
        static::deleting(function (Customer $customer) {
            if ($customer->email) {
                $customer->original_email = $customer->email;
                $customer->email = "deleted_{$customer->id}@customers.invalid";
                // runSoftDelete() only writes deleted_at — save the swap here.
                $customer->save();
            }
        });

        static::restoring(function (Customer $customer) {
            if (!$customer->original_email) {
                return true;
            }

            $taken = static::withTrashed()
                ->where('id', '!=', $customer->id)
                ->where('email', $customer->original_email)
                ->exists();

            if ($taken) {
                return false;
            }

            $customer->email = $customer->original_email;
            $customer->original_email = null;

            return true;
        });
    }

    /**
     * Person names are stored in ALL CAPS — business/email convention.
     */
    public function setNameAttribute($value): void
    {
        if ($value === null) {
            $this->attributes['name'] = null;
            return;
        }
        $trimmed = trim((string) $value);
        $this->attributes['name'] = $trimmed === '' ? null : mb_strtoupper($trimmed);
    }

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
