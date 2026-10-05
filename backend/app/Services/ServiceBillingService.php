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
            $serviceId = (int) $data['service_id'];
            $itemType = $data['item_type'];
            $description = $data['description'];
            $quantity = max(1, (int) ($data['quantity'] ?? 1));
            $unitPrice = (float) $data['unit_price'];
            // Authoritative total is computed server-side; a client-supplied
            // total_price is never trusted.
            $totalPrice = round($quantity * $unitPrice, 2);
            $notes = $data['notes'] ?? '';
            $addedBy = Auth::id();

            // Lock the service record so concurrent submissions serialize here
            // instead of racing on duplicate row creation.
            $serviceRecord = self::resolveServiceRecord($serviceType, $serviceId, true);
            if (!$serviceRecord) {
                throw new \Exception('Service record not found');
            }

            // Validate service ownership and permissions
            if (!self::canAddBillingItem($serviceType, $serviceId)) {
                throw new \Exception('You are not authorized to add billing items to this service');
            }

            if ($itemType === 'inventory_usage') {
                throw new \Exception('Record inventory usage through the service inventory usage form. Billing items should not deduct stock directly.');
            }

            // The base charge must exist before additional charges are added,
            // otherwise the derived total would collapse to the add-on only.
            self::ensureBaseServiceItem($serviceType, $serviceId);

            if ($itemType === ServiceItemUsage::ITEM_DISCOUNT) {
                $gross = (float) ServiceItemUsage::where('service_type', $serviceType)
                    ->where('service_id', $serviceId)
                    ->billable()
                    ->sum('total_price');
                $existingDiscounts = (float) ServiceItemUsage::where('service_type', $serviceType)
                    ->where('service_id', $serviceId)
                    ->where('item_type', ServiceItemUsage::ITEM_DISCOUNT)
                    ->sum('total_price');

                if ($totalPrice <= 0) {
                    throw new \Exception('Discount amount must be greater than zero');
                }
                if ($gross - $existingDiscounts - $totalPrice < 0) {
                    throw new \Exception('Discount exceeds the remaining billable amount');
                }
            }

            // Server-side duplicate protection: an identical unpaid charge
            // created moments ago is treated as a retry, not a new charge.
            $duplicate = ServiceItemUsage::where('service_type', $serviceType)
                ->where('service_id', $serviceId)
                ->where('item_type', $itemType)
                ->where('description', $description)
                ->where('quantity_used', $quantity)
                ->where('unit_price', $unitPrice)
                ->where('total_price', $totalPrice)
                ->where('is_paid', false)
                ->where('created_at', '>=', now()->subMinutes(2))
                ->orderBy('id', 'desc')
                ->first();

            if ($duplicate) {
                return [
                    'success' => true,
                    'billing_item' => $duplicate,
                    'billing' => self::syncServicePaymentState($serviceType, $serviceId),
                    'duplicate' => true,
                    'message' => 'Identical billing item already recorded'
                ];
            }

            // Create service billing item
            $billingItem = ServiceItemUsage::create([
                'service_type' => $serviceType,
                'service_id' => $serviceId,
                'pet_id' => $data['pet_id'] ?? ($serviceRecord->pet_id ?? null),
                'customer_id' => $serviceRecord->customer_id ?? null,
                'customer_email' => $serviceRecord->customer_email ?? null,
                'inventory_item_id' => null,
                'batch_id' => null,
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
    public static function markItemsAsPaid(array $itemIds, int $verifiedBy, ?string $paymentMethod = null, ?string $referenceNumber = null): array
    {
        return DB::transaction(function () use ($itemIds, $verifiedBy, $paymentMethod, $referenceNumber) {
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

                    $itemKey = sha1($first->service_type . ':' . $first->service_id . ':' . implode(',', $groupedItems->pluck('id')->sort()->values()->all()));
                    PaymentSettlementService::record([
                        'settleable_type' => $first->service_type,
                        'settleable_id' => (int) $first->service_id,
                        'customer_id' => $first->customer_id ?? null,
                        'amount' => (float) $groupedItems->sum('total_price'),
                        'payment_method' => $paymentMethod,
                        'reference_number' => $referenceNumber,
                        'verified_by' => $verifiedBy,
                        'verified_at' => now(),
                        'paid_at' => now(),
                        'idempotency_key' => "items-paid:{$itemKey}",
                    ], $groupedItems->map(fn ($item) => [
                        'service_item_usage_id' => $item->id,
                        'description' => $item->description ?: ($item->service_name_snapshot ?: ($item->item_name_snapshot ?: 'Service item')),
                        'quantity' => max(1, (int) ($item->quantity_used ?? 1)),
                        'unit_price' => (float) $item->unit_price,
                        'total_price' => (float) $item->total_price,
                    ])->all());
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
        // A service with a persisted amount must never have its derived total
        // collapse to zero just because the itemized base row is missing.
        // Materializing it here makes every read/write path converge on the
        // same state instead of erasing the recorded price.
        self::ensureBaseServiceItem($serviceType, $serviceId);

        $items = ServiceItemUsage::where('service_type', $serviceType)
            ->where('service_id', $serviceId)
            ->with(['inventoryItem', 'user'])
            ->orderBy('created_at', 'asc')
            ->get();

        $billableItems = $items->where('is_billable', true);
        $discountTotal = (float) $items
            ->where('item_type', ServiceItemUsage::ITEM_DISCOUNT)
            ->sum('total_price');

        $baseAmount = (float) $billableItems
            ->where('item_type', ServiceItemUsage::ITEM_BASE_SERVICE)
            ->sum('total_price');
        $grossBill = (float) $billableItems->sum('total_price');
        $totalBill = max(0, round($grossBill - $discountTotal, 2));
        $totalPaid = (float) $billableItems->where('is_paid', true)->sum('total_price');
        $balanceDue = max(0, round($totalBill - $totalPaid, 2));
        $additionalCharges = max(0, round($grossBill - $baseAmount - $discountTotal, 2));

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
            'gross_bill' => $grossBill,
            'discount_total' => $discountTotal,
            'total_paid' => $totalPaid,
            'balance_due' => $balanceDue,
            'has_unpaid_balance' => $balanceDue > 0,
            'base_amount' => $baseAmount,
            'additional_charges' => $additionalCharges,
            'payment_status' => $nextPaymentStatus,
        ];
    }

    /**
     * Guarantee the itemized bill contains exactly one base_service row for
     * the service, using the service record's own persisted amount as the
     * authoritative price. Safe to call repeatedly and from any path —
     * never creates duplicates and never fabricates an amount for a
     * service that has none.
     */
    public static function ensureBaseServiceItem(string $serviceType, int $serviceId): ?ServiceItemUsage
    {
        $existing = ServiceItemUsage::where('service_type', $serviceType)
            ->where('service_id', $serviceId)
            ->where('item_type', ServiceItemUsage::ITEM_BASE_SERVICE)
            ->orderBy('id')
            ->first();

        if ($existing) {
            return $existing;
        }

        // Serialize concurrent creators on the service row itself: the loser
        // waits for the winner's commit, re-checks, and returns the existing
        // item instead of creating a duplicate (no unique index exists yet).
        return DB::transaction(function () use ($serviceType, $serviceId) {
            $record = self::resolveServiceRecord($serviceType, $serviceId, true);
            if (!$record) {
                return null;
            }

            $existing = ServiceItemUsage::where('service_type', $serviceType)
                ->where('service_id', $serviceId)
                ->where('item_type', ServiceItemUsage::ITEM_BASE_SERVICE)
                ->orderBy('id')
                ->first();

            if ($existing) {
                return $existing;
            }

            $amount = self::authoritativeServiceAmount($record, $serviceType);
            if ($amount <= 0) {
                return null;
            }

            return ServiceItemUsage::create([
                'service_type' => $serviceType,
                'service_id' => $serviceId,
                'pet_id' => $record->pet_id ?? null,
                'customer_id' => $record->customer_id ?? null,
                'customer_email' => $record->customer_email ?? null,
                'quantity_used' => 1,
                'unit' => 'service',
                'used_by' => Auth::id() ?? null,
                'notes' => 'Base service charge',
                'item_type' => ServiceItemUsage::ITEM_BASE_SERVICE,
                'description' => self::baseServiceDescription($record, $serviceType),
                'unit_price' => $amount,
                'total_price' => $amount,
                'is_billable' => true,
                // A service already settled never owes its base charge again.
                'is_paid' => ($record->payment_status ?? null) === 'paid',
            ]);
        });
    }

    /**
     * Authoritative base price from the service record itself — never from
     * derived billing totals.
     */
    private static function authoritativeServiceAmount($record, string $serviceType): float
    {
        $candidates = match ($serviceType) {
            ServiceItemUsage::SERVICE_BOARDING => ['total_amount'],
            ServiceItemUsage::SERVICE_GROOMING => ['total_amount', 'amount'],
            ServiceItemUsage::SERVICE_VETERINARY => ['total_amount', 'price', 'consultation_fee'],
            default => ['total_amount', 'price', 'amount'],
        };

        foreach ($candidates as $column) {
            $value = $record->{$column} ?? null;
            if (is_numeric($value) && (float) $value > 0) {
                return (float) $value;
            }
        }

        return 0.0;
    }

    private static function baseServiceDescription($record, string $serviceType): string
    {
        return match ($serviceType) {
            ServiceItemUsage::SERVICE_BOARDING => trim(($record->hotelRoom->name ?? $record->room_name ?? 'Boarding') . ' stay'),
            ServiceItemUsage::SERVICE_GROOMING => $record->service_name ?? $record->service ?? 'Grooming service',
            ServiceItemUsage::SERVICE_VETERINARY => $record->service?->name ?? 'Veterinary consultation',
            default => 'Base service charge',
        };
    }

    public static function markBaseServiceAsPaid(string $serviceType, int $serviceId, ?int $verifiedBy = null, ?string $receiptNumber = null): array
    {
        return DB::transaction(function () use ($serviceType, $serviceId, $verifiedBy, $receiptNumber) {
            // Materialize the base item first: a verified payment must still
            // mark the itemized bill paid so amount_paid/balance_due stay
            // consistent instead of being silently skipped.
            self::ensureBaseServiceItem($serviceType, $serviceId);

            $baseItems = ServiceItemUsage::where('service_type', $serviceType)
                ->where('service_id', $serviceId)
                ->where('item_type', ServiceItemUsage::ITEM_BASE_SERVICE)
                ->where('is_billable', true)
                ->where('is_paid', false);

            $paidItemIds = $baseItems->pluck('id')->all();

            if (empty($paidItemIds)) {
                $summary = self::syncServicePaymentState($serviceType, $serviceId, [
                    'verified_by' => $verifiedBy,
                    'receipt_number' => $receiptNumber,
                ]);
                $summary['paid_item_ids'] = [];
                $summary['message'] = 'No unpaid base service billing item; payment fields were verified without recalculating service totals.';
                return $summary;
            }

            ServiceItemUsage::whereIn('id', $paidItemIds)->update(['is_paid' => true]);

            $summary = self::syncServicePaymentState($serviceType, $serviceId, [
                'verified_by' => $verifiedBy,
                'receipt_number' => $receiptNumber,
            ]);
            $summary['paid_item_ids'] = $paidItemIds;
            return $summary;
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
                // There is no 'grooming' staff role — receptionist runs
                // grooming operations; super_receptionist is its composite.
                return in_array($user->role, ['receptionist', 'super_receptionist', 'admin']);
            case ServiceItemUsage::SERVICE_BOARDING:
                return in_array($user->role, ['receptionist', 'super_receptionist', 'admin']);
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

    private static function resolveServiceRecord(string $serviceType, int $serviceId, bool $lockForUpdate = false): Appointment|Grooming|Boarding|null
    {
        $query = match ($serviceType) {
            ServiceItemUsage::SERVICE_VETERINARY => Appointment::query(),
            ServiceItemUsage::SERVICE_GROOMING => Grooming::query(),
            ServiceItemUsage::SERVICE_BOARDING => Boarding::query(),
            default => null,
        };

        if (!$query) {
            return null;
        }

        if ($lockForUpdate) {
            $query->lockForUpdate();
        }

        return $query->find($serviceId);
    }

    private static function determinePaymentStatus(?string $currentStatus, float $totalBill, float $totalPaid, float $balanceDue): string
    {
        if ($totalBill > 0 && $balanceDue <= 0) {
            return 'paid';
        }

        if ($balanceDue > 0 && $totalPaid > 0) {
            // 'partial' is the canonical value every payment_status column
            // accepts — boardings/service_requests are enums without
            // 'balance_due', so returning it there truncates and fails.
            return 'partial';
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
