<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only controlled-drug register row. balance_after is computed under
 * the item row lock inside ControlledDrugService::record — entries are never
 * updated or deleted; corrections are new reversing entries.
 */
class ControlledDrugEntry extends Model
{
    protected $table = 'controlled_drug_register';

    public $timestamps = false;

    public const TYPE_RECEIVED = 'received';
    public const TYPE_DISPENSED = 'dispensed';
    public const TYPE_ADMINISTERED = 'administered';
    public const TYPE_RETURNED = 'returned';
    public const TYPE_WASTAGE = 'wastage';
    public const TYPE_COUNT_CORRECTION = 'count_correction';

    protected $fillable = [
        'inventory_item_id',
        'inventory_batch_id',
        'dispensation_id',
        'mar_id',
        'prescription_id',
        'appointment_id',
        'medical_confinement_id',
        'pet_id',
        'customer_id',
        'prescriber_id',
        'performed_by',
        'witness_id',
        'entry_type',
        'quantity_delta',
        'balance_after',
        'notes',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function performedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by');
    }

    public function witness(): BelongsTo
    {
        return $this->belongsTo(User::class, 'witness_id');
    }

    public function prescriber(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prescriber_id');
    }

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }
}
