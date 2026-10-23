<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Dispensation;
use App\Models\ControlledDrugEntry;
use App\Models\InventoryItem;
use App\Models\MedicalConfinement;
use App\Models\Prescription;
use App\Models\ServiceItemUsage;
use Illuminate\Support\Facades\DB;

/**
 * Take-home medication dispensing. Stock moves when the dispense is
 * confirmed — never at prescription-draft time. Controlled drugs append a
 * register entry in the same transaction; a linked appointment gets the
 * medication on its visit invoice.
 */
class DispensingService
{
    /**
     * Dispense medication. Caller holds role middleware; this enforces the
     * stock/batch/prescription rules transactionally.
     */
    public static function dispense(array $data, int $dispenserId): Dispensation
    {
        return DB::transaction(function () use ($data, $dispenserId) {
            $item = InventoryItem::where('id', $data['inventory_item_id'])->lockForUpdate()->firstOrFail();
            if ($item->status !== 'active') {
                throw new \RuntimeException("Item '{$item->name}' is not active");
            }

            $quantity = (int) $data['quantity'];
            if ($quantity <= 0) {
                throw new \RuntimeException('Quantity must be greater than zero');
            }

            $prescription = !empty($data['prescription_id'])
                ? Prescription::findOrFail($data['prescription_id'])
                : null;
            if ($prescription && !$prescription->isActive()) {
                throw new \RuntimeException('Prescription is no longer active');
            }

            $appointment = !empty($data['appointment_id'])
                ? Appointment::findOrFail($data['appointment_id'])
                : null;
            $confinement = !empty($data['medical_confinement_id'])
                ? MedicalConfinement::findOrFail($data['medical_confinement_id'])
                : null;

            // deductStock locks the item row, rejects expired batches and
            // applies FEFO — that is the single stock-mutation path.
            $deduction = (new InventoryService())->deductStock(
                (int) $item->id,
                $quantity,
                'Dispensed: ' . (($data['label_text'] ?? null) ?: $item->name),
                'dispensation',
                null,
                $data['inventory_batch_id'] ?? null
            );
            $batchId = $data['inventory_batch_id']
                ?? ($deduction['batch_deductions'][0]['batch_id'] ?? null);

            $dispensation = Dispensation::create([
                'prescription_id' => $prescription?->id,
                'inventory_item_id' => $item->id,
                'inventory_batch_id' => $batchId,
                'appointment_id' => $appointment?->id,
                'medical_confinement_id' => $confinement?->id,
                'pet_id' => $data['pet_id'] ?? $appointment?->pet_id ?? $confinement?->pet_id,
                'customer_id' => $data['customer_id'] ?? $appointment?->customer_id ?? $confinement?->customer_id,
                'quantity' => $quantity,
                'unit' => $data['unit'] ?? 'pcs',
                'label_text' => $data['label_text'] ?? null,
                'directions' => $data['directions'] ?? null,
                'dispensed_by' => $dispenserId,
                'status' => Dispensation::STATUS_DISPENSED,
            ]);

            if ($item->isControlledDrug()) {
                ControlledDrugService::record($item, [
                    'entry_type' => ControlledDrugEntry::TYPE_DISPENSED,
                    'quantity_delta' => -$quantity,
                    'inventory_batch_id' => $batchId,
                    'dispensation_id' => $dispensation->id,
                    'prescription_id' => $prescription?->id,
                    'appointment_id' => $appointment?->id,
                    'medical_confinement_id' => $confinement?->id,
                    'pet_id' => $dispensation->pet_id,
                    'customer_id' => $dispensation->customer_id,
                    'prescriber_id' => $prescription?->veterinarian_id,
                    'performed_by' => $dispenserId,
                    'witness_id' => $data['witness_id'] ?? null,
                    'notes' => $data['notes'] ?? null,
                ]);
            }

            if ($prescription) {
                $prescription->useRefill();
            }

            // Bill the dispensed medication to the visit when linked. Written
            // directly (like adjustment rows) because dispensing is its own
            // authorized workflow, not the staff billing endpoint — the
            // estimate gate was already satisfied upstream for clinical items.
            if ($appointment && (float) $item->price > 0) {
                ServiceItemUsage::create([
                    'service_type' => ServiceItemUsage::SERVICE_VETERINARY,
                    'service_id' => $appointment->id,
                    'appointment_id' => $appointment->id,
                    'pet_id' => $appointment->pet_id,
                    'customer_id' => $appointment->customer_id,
                    'customer_email' => $appointment->customer?->email,
                    'inventory_item_id' => $item->id,
                    'batch_id' => $batchId,
                    'batch_deductions' => $deduction['batch_deductions'] ?? null,
                    'quantity_used' => $quantity,
                    'unit' => $dispensation->unit,
                    'usage_type' => 'dispensed_medication',
                    'used_by' => $dispenserId,
                    'role' => \Illuminate\Support\Facades\Auth::user()?->role ?? 'veterinary',
                    'notes' => 'Dispensation #' . $dispensation->id,
                    'item_type' => ServiceItemUsage::ITEM_INVENTORY_USAGE,
                    'description' => $item->name . ' (dispensed)',
                    'unit_price' => (float) $item->price,
                    'total_price' => round($quantity * (float) $item->price, 2),
                    'charge_amount' => round($quantity * (float) $item->price, 2),
                    'is_billable' => true,
                    'is_paid' => false,
                    'item_name_snapshot' => $item->name,
                    'item_sku_snapshot' => $item->sku,
                    'pet_name_snapshot' => $appointment->pet?->name,
                    'service_name_snapshot' => $appointment->service?->name,
                ]);
                ServiceBillingService::syncServicePaymentState(ServiceItemUsage::SERVICE_VETERINARY, $appointment->id);
            }

            return $dispensation->fresh(['item', 'batch', 'prescription']);
        });
    }

    /** Record that the patient/owner was counselled on the medication. */
    public static function counsel(Dispensation $dispensation, int $userId): Dispensation
    {
        $locked = Dispensation::where('id', $dispensation->id)->lockForUpdate()->firstOrFail();
        if ($locked->status !== Dispensation::STATUS_DISPENSED) {
            throw new \RuntimeException('Only dispensed items can be marked counselled');
        }
        $locked->update(['counselled_at' => now(), 'counselled_by' => $userId]);
        return $locked->fresh();
    }
}
