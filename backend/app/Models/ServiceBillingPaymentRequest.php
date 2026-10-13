<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceBillingPaymentRequest extends Model
{
    public const STATUS_AWAITING_CASHIER = 'awaiting_cashier';
    public const STATUS_PENDING_VERIFICATION = 'pending_verification';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_STALE = 'stale';
    public const STATUS_PAID = 'paid';
    public const STATUS_CANCELLED = 'cancelled';

    public const OPEN_STATUSES = [
        self::STATUS_AWAITING_CASHIER,
        self::STATUS_PENDING_VERIFICATION,
    ];

    protected $fillable = [
        'appointment_id',
        'service_request_id',
        'customer_id',
        'customer_name',
        'customer_email',
        'pet_name',
        'service_name',
        'created_by',
        'verified_by',
        'amount_due',
        'invoice_version',
        'payment_channel',
        'payment_method',
        'payment_reference',
        'payment_proof',
        'status',
        'receipt_number',
        'rejection_reason',
        'cashier_remarks',
        'cash_received',
        'change_amount',
        'submitted_at',
        'verified_at',
        'paid_at',
    ];

    protected $casts = [
        'amount_due' => 'decimal:2',
        'cash_received' => 'decimal:2',
        'change_amount' => 'decimal:2',
        'submitted_at' => 'datetime',
        'verified_at' => 'datetime',
        'paid_at' => 'datetime',
    ];

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function serviceRequest(): BelongsTo
    {
        return $this->belongsTo(ServiceRequest::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(ServiceBillingPaymentRequestItem::class, 'payment_request_id');
    }
}
