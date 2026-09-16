<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookingAddOn extends Model
{
    use HasFactory;

    protected $table = 'booking_addons';

    protected $fillable = [
        'booking_id',
        'add_on_id',
        'inventory_item_id',
        'name',
        'add_on_type',
        'charge_type',
        'quantity',
        'unit_price',
        'number_of_days',
        'subtotal',
        'inventory_deducted_at',
        'inventory_deducted_by',
        'inventory_deducted_quantity',
        'deduction_status',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'subtotal' => 'decimal:2',
        'number_of_days' => 'integer',
    ];

    /**
     * Get the booking
     */
    public function booking(): BelongsTo
    {
        return $this->belongsTo(Boarding::class);
    }

    /**
     * Get the add-on
     */
    public function addOn(): BelongsTo
    {
        return $this->belongsTo(AddOn::class);
    }

    /**
     * Get the inventory item
     */
    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }
}
