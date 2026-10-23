<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * MAR — a scheduled or recorded medication administration for a confined
 * patient. Stock only moves when the entry is confirmed 'administered'.
 */
class MedicationAdministrationRecord extends Model
{
    protected $fillable = [
        'medical_confinement_id',
        'prescription_id',
        'inventory_item_id',
        'inventory_batch_id',
        'medication_name',
        'dose',
        'route',
        'scheduled_at',
        'status',
        'administered_at',
        'administered_by',
        'notes',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'administered_at' => 'datetime',
    ];

    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_ADMINISTERED = 'administered';
    public const STATUS_SKIPPED = 'skipped';
    public const STATUS_HELD = 'held';

    public function confinement(): BelongsTo
    {
        return $this->belongsTo(MedicalConfinement::class, 'medical_confinement_id');
    }

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

    public function administeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'administered_by');
    }
}
