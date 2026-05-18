<?php

namespace App\Services;

use App\Models\ServiceItemUsage;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\InventoryBatch;
use App\Models\User;
use App\Models\Appointment;
use App\Models\Grooming;
use App\Models\GroomingAppointment;
use App\Models\Boarding;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;

class ServiceBillingService
{
    /**
     * Add a billing item to a service with optional inventory deduction
     */
    public static function addBillingItem(array $data): array
    {
        return DB::transaction(function () use ($data) {
            $serviceType = $data['service_type'];
            $serviceId = $data['service_id'];
            $itemType = $data['item_type'];
            $description = $data['description'];
            $quantity = $data['quantity'] ?? 1;
            $unitPrice = $data['unit_price'];
            $totalPrice = $data['total_price'] ?? ($quantity * $unitPrice);
            $inventoryItemId = $data['inventory_item_id'] ?? null;
            $notes = $data['notes'] ?? '';
            $addedBy = Auth::id();

            // Validate service ownership and permissions
            if (!self::canAddBillingItem($serviceType, $serviceId)) {
                throw new \Exception('You are not authorized to add billing items to this service');
            }

            if ($itemType === 'inventory_usage') {
                throw new \Exception('Record inventory usage through the service inventory usage form. Billing items should not deduct stock directly.');
            }

            // For all billing fee types (base_service, add_on_service, manual_charge, discount)
            $inventoryItemId = null;
            $batchId = null;

            // Create service billing item
            $billingItem = ServiceItemUsage::create([
                'service_type' => $serviceType,
                'service_id' => $serviceId,
                'pet_id' => $data['pet_id'] ?? null,
                'inventory_item_id' => $inventoryItemId,
                'batch_id' => $batchId,
                'quantity_used' => $quantity,
                'unit' => $data['unit'] ?? 'pcs',
                'used_by' => $addedBy,
                'notes' => $notes,
                // Billing fields
                'item_type' => $itemType,
                'description' => $description,
                'unit_price' => $unitPrice,
                'total_price' => $totalPrice,
                'is_billable' => $itemType !== ServiceItemUsage::ITEM_DISCOUNT,
                'is_paid' => false,
            ]);

            $summary = self::syncServicePaymentState($serviceType, $serviceId);

            return [
                'success' => true,
                'billing_item' => $billingItem,
                'billing' => $summary,
                'message' => 'Billing item added successfully'
            ];
        });
    }

    /**
     * Get itemized billing for a service
     */
    public static function getItemizedBilling(string $serviceType, int $serviceId): array
    {
        return self::syncServicePaymentState($serviceType, $serviceId);
    }

    /**
     * Mark billing items as paid
     */
    public static function markItemsAsPaid(array $itemIds, int $verifiedBy): array
    {
        return DB::transaction(function () use ($itemIds, $verifiedBy) {
            $items = ServiceItemUsage::whereIn('id', $itemIds)
                ->where('is_billable', true)
                ->where('is_paid', false)
                ->get();

            $updated = ServiceItemUsage::whereIn('id', $itemIds)
                ->where('is_billable', true)
                ->where('is_paid', false)
                ->update(['is_paid' => true]);

            $summaries = [];
            foreach ($items->groupBy(fn ($item) => $item->service_type . ':' . $item->service_id) as $groupedItems) {
                $first = $groupedItems->first();
                if ($first) {
                    $summaries[] = self::syncServicePaymentState($first->service_type, (int) $first->service_id, [
                        'verified_by' => $verifiedBy,
                    ]);
                }
            }

            return [
                'success' => true,
                'items_updated' => $updated,
                'services' => $summaries,
                'message' => "Marked {$updated} items as paid"
            ];
        });
    }

    public static function finalizeServiceBill(string $serviceType, int $serviceId): array
    {
        $billing = self::syncServicePaymentState($serviceType, $serviceId);
        $completion = self::canCompleteService($serviceType, $serviceId);

        return [
            'success' => true,
            'billing' => $billing,
            'completion_status' => $completion,
        ];
    }

    public static function syncServicePaymentState(string $serviceType, int $serviceId, array $metadata = []): array
    {
        $items = ServiceItemUsage::where('service_type', $serviceType)
            ->where('service_id', $serviceId)
            ->billable()
            ->with(['inventoryItem', 'user'])
            ->orderBy('created_at', 'asc')
            ->get();

        $baseAmount = (float) $items
            ->where('item_type', ServiceItemUsage::ITEM_BASE_SERVICE)
            ->sum('total_price');
        $totalBill = (float) $items->sum('total_price');
        $totalPaid = (float) $items->where('is_paid', true)->sum('total_price');
        $balanceDue = max(0, round($totalBill - $totalPaid, 2));
        $additionalCharges = max(0, round($totalBill - $baseAmount, 2));

        $serviceRecord = self::resolveServiceRecord($serviceType, $serviceId);
        $currentPaymentStatus = $serviceRecord?->payment_status;
        $nextPaymentStatus = self::determinePaymentStatus($currentPaymentStatus, $totalBill, $totalPaid, $balanceDue);

        if ($serviceRecord) {
            $updates = [];

            self::setColumnIfAvailable($serviceRecord, $updates, 'base_amount', $baseAmount);
            self::setColumnIfAvailable($serviceRecord, $updates, 'additional_charges', $additionalCharges);
            self::setColumnIfAvailable($serviceRecord, $updates, 'total_amount', $totalBill);
            self::setColumnIfAvailable($serviceRecord, $updates, 'amount_paid', $totalPaid);
            self::setColumnIfAvailable($serviceRecord, $updates, 'balance_due', $balanceDue);
            self::setColumnIfAvailable($serviceRecord, $updates, 'payment_status', $nextPaymentStatus);

            if ($serviceType === ServiceItemUsage::SERVICE_VETERINARY) {
                self::setColumnIfAvailable($serviceRecord, $updates, 'consultation_fee', $baseAmount);
                self::setColumnIfAvailable($serviceRecord, $updates, 'price', $totalBill > 0 ? $totalBill : ((float) ($serviceRecord->price ?? 0)));
            }

            if ($serviceType === ServiceItemUsage::SERVICE_GROOMING) {
                self::setColumnIfAvailable($serviceRecord, $updates, 'amount', $baseAmount > 0 ? $baseAmount : ((float) ($serviceRecord->amount ?? 0)));
            }

            if (!empty($metadata['receipt_number'])) {
                self::setColumnIfAvailable($serviceRecord, $updates, 'receipt_number', $metadata['receipt_number']);
            }

            if (!empty($metadata['verified_by'])) {
                self::setColumnIfAvailable($serviceRecord, $updates, 'verified_by', $metadata['verified_by']);
            }

            if ($nextPaymentStatus === 'paid' && $totalPaid > 0) {
                self::setColumnIfAvailable($serviceRecord, $updates, 'paid_at', now());
            }

            if (!empty($updates)) {
                $serviceRecord->forceFill($updates)->save();
            }
        }

        return [
            'items' => $items->values(),
            'total_bill' => $totalBill,
            'total_paid' => $totalPaid,
            'balance_due' => $balanceDue,
            'has_unpaid_balance' => $balanceDue > 0,
            'base_amount' => $baseAmount,
            'additional_charges' => $additionalCharges,
            'payment_status' => $nextPaymentStatus,
        ];
    }

    public static function markBaseServiceAsPaid(string $serviceType, int $serviceId, ?int $verifiedBy = null, ?string $receiptNumber = null): array
    {
        return DB::transaction(function () use ($serviceType, $serviceId, $verifiedBy, $receiptNumber) {
            $baseItems = ServiceItemUsage::where('service_type', $serviceType)
                ->where('service_id', $serviceId)
                ->where('item_type', ServiceItemUsage::ITEM_BASE_SERVICE)
                ->where('is_billable', true);

            if (!$baseItems->exists()) {
                return [
                    'items' => collect(),
                    'total_bill' => null,
                    'total_paid' => null,
                    'balance_due' => null,
                    'has_unpaid_balance' => null,
                    'base_amount' => null,
                    'additional_charges' => null,
                    'payment_status' => null,
                    'message' => 'No base service billing item exists; payment fields were verified without recalculating service totals.',
                ];
            }

            $baseItems->update([
                'is_paid' => true,
            ]);

            return self::syncServicePaymentState($serviceType, $serviceId, [
                'verified_by' => $verifiedBy,
                'receipt_number' => $receiptNumber,
            ]);
        });
    }

    /**
     * Check if user can add billing items to service
     */
    private static function canAddBillingItem(string $serviceType, int $serviceId): bool
    {
        $user = Auth::user();
        if (!$user) return false;

        // Admin can add to any service
        if ($user->role === 'admin') return true;

        // Check role-based permissions
        switch ($serviceType) {
            case ServiceItemUsage::SERVICE_VETERINARY:
                return in_array($user->role, ['veterinary', 'admin']);
            case ServiceItemUsage::SERVICE_GROOMING:
                return in_array($user->role, ['grooming', 'admin']);
            case ServiceItemUsage::SERVICE_BOARDING:
                return in_array($user->role, ['receptionist', 'admin']);
            default:
                return false;
        }
    }

    /**
     * Get inventory movement type for service
     */
    private static function getInventoryMovementType(string $serviceType): string
    {
        return match ($serviceType) {
            ServiceItemUsage::SERVICE_VETERINARY => 'vet_usage',
            ServiceItemUsage::SERVICE_GROOMING => 'grooming_usage',
            ServiceItemUsage::SERVICE_BOARDING => 'boarding_food_usage',
            default => 'service_usage'
        };
    }

    /**
     * Create base service billing item when service is created
     */
    public static function createBaseServiceItem(string $serviceType, int $serviceId, string $description, float $price, ?int $petId = null): ServiceItemUsage
    {
        $item = ServiceItemUsage::create([
            'service_type' => $serviceType,
            'service_id' => $serviceId,
            'pet_id' => $petId,
            'inventory_item_id' => null,
            'batch_id' => null,
            'quantity_used' => 1,
            'unit' => 'service',
            'used_by' => Auth::id() ?? null, // Use authenticated user ID or null
            'notes' => 'Base service charge',
            // Billing fields
            'item_type' => ServiceItemUsage::ITEM_BASE_SERVICE,
            'description' => $description,
            'unit_price' => $price,
            'total_price' => $price,
            'is_billable' => true,
            'is_paid' => false,
        ]);

        return $item;
    }

    /**
     * Check if service can be completed based on payment status
     */
    public static function canCompleteService(string $serviceType, int $serviceId): array
    {
        $balanceDue = ServiceItemUsage::calculateBalanceDue($serviceType, $serviceId);
        
        return [
            'can_complete' => $balanceDue <= 0,
            'balance_due' => $balanceDue,
            'message' => $balanceDue > 0 
                ? "Service cannot be completed. Balance due: ₱" . number_format($balanceDue, 2)
                : "Service can be completed. All payments settled."
        ];
    }

    /**
     * Get services with unpaid balances for cashier dashboard
     */
    public static function getServicesWithUnpaidBalances(): array
    {
        $unpaidItems = ServiceItemUsage::unpaid()
            ->with(['pet', 'user'])
            ->orderBy('created_at', 'desc')
            ->get()
            ->groupBy(fn ($item) => $item->service_type . ':' . $item->service_id);

        $services = [];
        foreach ($unpaidItems as $key => $items) {
            [$serviceType, $serviceId] = explode(':', $key);
            $serviceId = (int) $serviceId;
            
            $billing = self::syncServicePaymentState($serviceType, $serviceId);
            $service = self::getServiceDetails($serviceType, $serviceId);
            
            if ($service && $billing['balance_due'] > 0) {
                $services[] = [
                    'service_type' => $serviceType,
                    'service_id' => $serviceId,
                    'service' => $service,
                    'billing' => $billing,
                    'created_at' => $items->first()->created_at
                ];
            }
        }

        return $services;
    }

    /**
     * Get service details for display
     */
    private static function getServiceDetails(string $serviceType, int $serviceId): ?array
    {
        return match ($serviceType) {
            ServiceItemUsage::SERVICE_VETERINARY => self::getVetServiceDetails($serviceId),
            ServiceItemUsage::SERVICE_GROOMING => self::getGroomingServiceDetails($serviceId),
            ServiceItemUsage::SERVICE_BOARDING => self::getBoardingServiceDetails($serviceId),
            default => null
        };
    }

    /**
     * Get veterinary service details
     */
    private static function getVetServiceDetails(int $serviceId): ?array
    {
        $appointment = Appointment::find($serviceId);
        if (!$appointment) return null;

        return [
            'id' => $appointment->id,
            'type' => 'Veterinary Consultation',
            'pet_name' => $appointment->pet?->name,
            'customer_name' => $appointment->customer?->name,
            'scheduled_at' => $appointment->scheduled_at,
            'status' => $appointment->status
        ];
    }

    /**
     * Get grooming service details
     */
    private static function getGroomingServiceDetails(int $serviceId): ?array
    {
        $appointment = Grooming::find($serviceId);
        if (!$appointment) {
            $appointment = GroomingAppointment::find($serviceId);
        }
        if (!$appointment) return null;

        return [
            'id' => $appointment->id,
            'type' => 'Grooming Appointment',
            'pet_name' => $appointment->pet?->name ?? $appointment->pet_name,
            'customer_name' => $appointment->customer?->name,
            'service' => $appointment->service,
            'appointment_date' => $appointment->appointment_date,
            'status' => $appointment->status
        ];
    }

    /**
     * Get boarding service details
     */
    private static function getBoardingServiceDetails(int $serviceId): ?array
    {
        $boarding = Boarding::find($serviceId);
        if (!$boarding) return null;

        return [
            'id' => $boarding->id,
            'type' => 'Pet Hotel Boarding',
            'pet_name' => $boarding->pet_name,
            'customer_name' => $boarding->customer_name ?? $boarding->customer?->name,
            'stay_type' => $boarding->stay_type,
            'check_in' => $boarding->check_in,
            'check_out' => $boarding->check_out,
            'status' => $boarding->status
        ];
    }

    private static function resolveServiceRecord(string $serviceType, int $serviceId): Appointment|Grooming|Boarding|null
    {
        return match ($serviceType) {
            ServiceItemUsage::SERVICE_VETERINARY => Appointment::find($serviceId),
            ServiceItemUsage::SERVICE_GROOMING => Grooming::find($serviceId),
            ServiceItemUsage::SERVICE_BOARDING => Boarding::find($serviceId),
            default => null,
        };
    }

    private static function determinePaymentStatus(?string $currentStatus, float $totalBill, float $totalPaid, float $balanceDue): string
    {
        if ($totalBill > 0 && $balanceDue <= 0) {
            return 'paid';
        }

        if ($balanceDue > 0 && $totalPaid > 0) {
            return 'balance_due';
        }

        if (in_array($currentStatus, ['pending', 'rejected'], true) && $totalPaid <= 0) {
            return $currentStatus;
        }

        return $totalBill > 0 ? 'unpaid' : ($currentStatus ?: 'unpaid');
    }

    private static function setColumnIfAvailable(object $model, array &$updates, string $column, mixed $value): void
    {
        if (Schema::hasColumn($model->getTable(), $column)) {
            $updates[$column] = $value;
        }
    }
}
