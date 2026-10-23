<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Dispensation extends Model
{
    public const STATUS_DISPENSED = 'dispensed';
    public const STATUS_RETURNED = 'returned';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'prescription_id',
        'inventory_item_id',
        'inventory_batch_id',
        'appointment_id',
        'medical_confinement_id',
        'pet_id',
        'customer_id',
        'quantity',
        'unit',
        'label_text',
        'directions',
        'dispensed_by',
        'counselled_at',
        'counselled_by',
        'status',
    ];

    protected $casts = [
        'counselled_at' => 'datetime',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(InventoryBatch::class, 'inventory_batch_id');
    }

    public function prescription(): BelongsTo
    {
        return $this->belongsTo(Prescription::class);
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function confinement(): BelongsTo
    {
        return $this->belongsTo(MedicalConfinement::class, 'medical_confinement_id');
    }

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function dispensedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispensed_by');
    }
}
