<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Auth;

class Sale extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_id',
        'cashier_id',
        'product_id',
        'transaction_number',
        'type',
        'status',
        'payment_type',
        'payment_method',
        'subtotal',
        'tax_amount',
        'discount_amount',
        'discount_code',
        'total_amount',
        'amount',
        'cash_amount',
        'card_amount',
        'notes',
        'void_reason',
        'voided_by',
        'voided_at',
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'amount' => 'decimal:2',
        'cash_amount' => 'decimal:2',
        'card_amount' => 'decimal:2',
        'voided_at' => 'datetime',
    ];

    /**
     * Valid sale statuses
     */
    public const VALID_STATUSES = ['pending', 'completed', 'cancelled', 'refunded', 'voided'];

    /**
     * Valid sale types
     */
    public const VALID_TYPES = ['product', 'service', 'mixed', 'appointment', 'boarding', 'refund', 'multi_payment'];

    /**
     * Boot method for model-level validation
     */
    protected static function boot()
    {
        parent::boot();

        static::creating(function ($sale) {
            if (empty($sale->transaction_number)) {
                $sale->transaction_number = 'TRX-' . strtoupper(uniqid());
            }
            // Keep amount in sync with total_amount for backward compatibility
            if (empty($sale->amount) && !empty($sale->total_amount)) {
                $sale->amount = $sale->total_amount;
            }
        });

        static::saving(function ($sale) {
            // Validate status
            if (!in_array($sale->status, self::VALID_STATUSES)) {
                $sale->status = 'pending';
            }

            // Validate type
            if (!in_array($sale->type, self::VALID_TYPES)) {
                $sale->type = 'product';
            }

            // Ensure non-negative amounts
            $sale->subtotal = max(0, (float) $sale->subtotal);
            $sale->tax_amount = max(0, (float) $sale->tax_amount);
            $sale->discount_amount = max(0, (float) $sale->discount_amount);
            $sale->total_amount = max(0, (float) $sale->total_amount);
            $sale->amount = max(0, (float) $sale->amount);

            // Keep amount in sync with total_amount
            if ($sale->total_amount > 0) {
                $sale->amount = $sale->total_amount;
            }
        });
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cashier_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function invoice(): HasOne
    {
        return $this->hasOne(Invoice::class);
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeToday($query)
    {
        return $query->whereDate('created_at', today());
    }

    public function calculateTotals(): void
    {
        $subtotal = $this->items->sum('total_price');
        $tax = $subtotal * 0.12; // 12% tax rate
        $discount = $this->discount_amount ?? 0;
        $total = max($subtotal + $tax - $discount, 0);

        $this->update([
            'subtotal' => $subtotal,
            'tax_amount' => $tax,
            'total_amount' => $total,
            'amount' => $total,
        ]);
    }

    public function markAsCompleted(): void
    {
        $this->update(['status' => 'completed']);
    }

    public function markAsCancelled(?string $reason = null): void
    {
        $this->update([
            'status' => 'cancelled',
            'notes' => $reason ? $this->notes . ' [Cancelled: ' . $reason . ']' : $this->notes,
            'void_reason' => $reason,
            'voided_by' => Auth::id(),
            'voided_at' => now(),
        ]);
    }
}
