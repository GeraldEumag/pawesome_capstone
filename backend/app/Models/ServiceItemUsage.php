<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceItemUsage extends Model
{
    use HasFactory;

    protected $fillable = [
        'service_type',
        'item_name_snapshot',
        'item_sku_snapshot',
        'pet_name_snapshot',
        'service_name_snapshot',
        'service_id',
        'appointment_id',
        'pet_id',
        'customer_id',
        'customer_email',
        'inventory_item_id',
        'batch_id',
        'batch_deductions',
        'quantity_used',
        'unit',
        'usage_type',
        'used_by',
        'role',
        'notes',
        // Billing fields
        'item_type',
        'description',
        'unit_price',
        'total_price',
        'charge_amount',
        'is_billable',
        'is_paid',
    ];

    protected $casts = [
        'quantity_used' => 'integer',
        'unit_price' => 'decimal:2',
        'total_price' => 'decimal:2',
        'charge_amount' => 'decimal:2',
        'is_billable' => 'boolean',
        'is_paid' => 'boolean',
        'batch_deductions' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected $appends = [
        'quantity',
    ];

    // Service type constants
    const SERVICE_VETERINARY = 'veterinary';
    const SERVICE_GROOMING = 'grooming';
    const SERVICE_BOARDING = 'boarding';
    const SERVICE_CASHIER = 'cashier';
    
    // Item type constants
    const ITEM_BASE_SERVICE = 'base_service';
    const ITEM_ADD_ON_SERVICE = 'add_on_service';
    const ITEM_INVENTORY_USAGE = 'inventory_usage';
    const ITEM_MANUAL_CHARGE = 'manual_charge';
    const ITEM_DISCOUNT = 'discount';

    /**
     * Get the inventory item that was used
     */
    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    /**
     * Get the inventory batch that was used
     */
    public function batch(): BelongsTo
    {
        return $this->belongsTo(InventoryBatch::class);
    }

    /**
     * Get the appointment where usage occurred
     */
    public function appointment(): BelongsTo
    {
        return $this->belongsTo(VetAppointment::class, 'appointment_id');
    }

    /**
     * Get the pet that received the service
     */
    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    /**
     * Get the user who recorded the usage
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'used_by');
    }

    /**
     * Scope for veterinary usage
     */
    public function scopeVeterinary($query)
    {
        return $query->where('service_type', self::SERVICE_VETERINARY);
    }

    /**
     * Scope for grooming usage
     */
    public function scopeGrooming($query)
    {
        return $query->where('service_type', self::SERVICE_GROOMING);
    }

    /**
     * Scope for boarding usage
     */
    public function scopeBoarding($query)
    {
        return $query->where('service_type', self::SERVICE_BOARDING);
    }

    /**
     * Scope for cashier usage
     */
    public function scopeCashier($query)
    {
        return $query->where('service_type', self::SERVICE_CASHIER);
    }
    
    /**
     * Scope for billable items only
     */
    public function scopeBillable($query)
    {
        return $query->where('is_billable', true);
    }
    
    /**
     * Scope for unpaid items only
     */
    public function scopeUnpaid($query)
    {
        return $query->where('is_billable', true)->where('is_paid', false);
    }
    
    /**
     * Scope for paid items only
     */
    public function scopePaid($query)
    {
        return $query->where('is_paid', true);
    }

    public function getQuantityAttribute()
    {
        return $this->quantity_used;
    }
    
    /**
     * Calculate total billable amount for a service
     */
    public static function calculateTotalBill($serviceType, $serviceId)
    {
        return self::where('service_type', $serviceType)
            ->where('service_id', $serviceId)
            ->billable()
            ->sum('total_price');
    }
    
    /**
     * Calculate total paid amount for a service
     */
    public static function calculateTotalPaid($serviceType, $serviceId)
    {
        return self::where('service_type', $serviceType)
            ->where('service_id', $serviceId)
            ->paid()
            ->sum('total_price');
    }
    
    /**
     * Calculate balance due for a service
     */
    public static function calculateBalanceDue($serviceType, $serviceId)
    {
        $totalBill = self::calculateTotalBill($serviceType, $serviceId);
        $totalPaid = self::calculateTotalPaid($serviceType, $serviceId);
        return $totalBill - $totalPaid;
    }
    
    /**
     * Get itemized billing for a service
     */
    public static function getItemizedBilling($serviceType, $serviceId)
    {
        return self::where('service_type', $serviceType)
            ->where('service_id', $serviceId)
            ->billable()
            ->with(['inventoryItem', 'user'])
            ->orderBy('created_at', 'asc')
            ->get();
    }
}
