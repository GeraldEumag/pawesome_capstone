<?php

namespace App\Services;

use App\Models\ControlledDrugEntry;
use App\Models\InventoryItem;
use App\Models\MedicationAdministrationRecord;
use App\Models\MedicalConfinement;
use App\Models\ServiceItemUsage;
use App\Support\ConfinementStatusMap;
use Illuminate\Support\Facades\DB;

/**
 * Medication administration records for confined patients. Scheduling a MAR
 * row costs nothing; stock only moves when administration is confirmed —
 * that is the single point where inventory, the controlled-drug register
 * and the visit invoice all update atomically.
 */
class MarService
{
    /** Schedule (or record as already ordered) a medication administration. */
    public static function schedule(MedicalConfinement $confinement, array $data): MedicationAdministrationRecord
    {
        if (!in_array($confinement->status, ['admitted', 'under_care'], true)) {
            throw new \RuntimeException('Medications can only be scheduled while the pet is in care');
        }

        $item = !empty($data['inventory_item_id'])
            ? InventoryItem::findOrFail($data['inventory_item_id'])
            : null;

        return MedicationAdministrationRecord::create([
            'medical_confinement_id' => $confinement->id,
            'prescription_id' => $data['prescription_id'] ?? null,
            'inventory_item_id' => $item?->id,
            'inventory_batch_id' => $data['inventory_batch_id'] ?? null,
            'medication_name' => $data['medication_name'] ?? $item?->name ?? 'Medication',
            'dose' => $data['dose'] ?? null,
            'route' => $data['route'] ?? null,
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'notes' => $data['notes'] ?? null,
            'status' => MedicationAdministrationRecord::STATUS_SCHEDULED,
        ]);
    }

    /**
     * Confirm administration: deduct stock, append the controlled-drug
     * register entry when the item is controlled, bill the visit, and stamp
     * the MAR — all in one transaction.
     */
    public static function administer(MedicationAdministrationRecord $mar, int $userId, ?int $batchId = null, ?int $quantity = null): MedicationAdministrationRecord
    {
        return DB::transaction(function () use ($mar, $userId, $batchId, $quantity) {
            $locked = MedicationAdministrationRecord::where('id', $mar->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === MedicationAdministrationRecord::STATUS_ADMINISTERED) {
                return $locked; // idempotent — double-submit is a no-op
            }
            if (!in_array($locked->status, [MedicationAdministrationRecord::STATUS_SCHEDULED, MedicationAdministrationRecord::STATUS_HELD], true)) {
                throw new \RuntimeException('Only scheduled or held administrations can be confirmed');
            }

            $confinement = MedicalConfinement::findOrFail($locked->medical_confinement_id);
            $qty = $quantity ?? 1;
            $deduction = null;
            $usedBatchId = $batchId ?? $locked->inventory_batch_id;

            if ($locked->inventory_item_id) {
                $item = InventoryItem::where('id', $locked->inventory_item_id)->lockForUpdate()->firstOrFail();

                $deduction = (new InventoryService())->deductStock(
                    (int) $item->id,
                    $qty,
                    "MAR #{$locked->id}: {$locked->medication_name} administered to {$confinement->pet_name}",
                    'vet_usage',
                    $confinement->consultation_id,
                    $usedBatchId
                );
                $usedBatchId = $usedBatchId ?? ($deduction['batch_deductions'][0]['batch_id'] ?? null);

                if ($item->isControlledDrug()) {
                    ControlledDrugService::record($item, [
                        'entry_type' => ControlledDrugEntry::TYPE_ADMINISTERED,
                        'quantity_delta' => -$qty,
                        'inventory_batch_id' => $usedBatchId,
                        'mar_id' => $locked->id,
                        'prescription_id' => $locked->prescription_id,
                        'appointment_id' => $confinement->consultation_id,
                        'medical_confinement_id' => $confinement->id,
                        'pet_id' => $confinement->pet_id,
                        'customer_id' => $confinement->customer_id,
                        'prescriber_id' => $confinement->vet_id,
                        'performed_by' => $userId,
                        'notes' => $locked->medication_name,
                    ]);
                }

                // Billable usage lands on the visit invoice — confinement
                // medication administration is covered by the signed
                // confinement consent, so it bypasses the estimate gate the
                // same way invoice adjustments bypass the billing gate.
                if ($confinement->consultation_id && (float) $item->price > 0) {
                    ServiceItemUsage::create([
                        'service_type' => ServiceItemUsage::SERVICE_VETERINARY,
                        'service_id' => $confinement->consultation_id,
                        'appointment_id' => $confinement->consultation_id,
                        'pet_id' => $confinement->pet_id,
                        'customer_id' => $confinement->customer_id,
                        'inventory_item_id' => $item->id,
                        'batch_id' => $usedBatchId,
                        'batch_deductions' => $deduction['batch_deductions'] ?? null,
                        'quantity_used' => $qty,
                        'unit' => 'dose',
                        'usage_type' => 'medication_administration',
                        'used_by' => $userId,
                        'role' => \Illuminate\Support\Facades\Auth::user()?->role ?? 'veterinary',
                        'notes' => "MAR #{$locked->id} (confinement #{$confinement->id})",
                        'item_type' => ServiceItemUsage::ITEM_INVENTORY_USAGE,
                        'description' => $item->name . ' (administered)',
                        'unit_price' => (float) $item->price,
                        'total_price' => round($qty * (float) $item->price, 2),
                        'charge_amount' => round($qty * (float) $item->price, 2),
                        'is_billable' => true,
                        'is_paid' => false,
                        'item_name_snapshot' => $item->name,
                        'item_sku_snapshot' => $item->sku,
                        'pet_name_snapshot' => $confinement->pet_name,
                    ]);
                    ServiceBillingService::syncServicePaymentState(ServiceItemUsage::SERVICE_VETERINARY, $confinement->consultation_id);
                }
            }

            $locked->update([
                'status' => MedicationAdministrationRecord::STATUS_ADMINISTERED,
                'administered_at' => now(),
                'administered_by' => $userId,
                'inventory_batch_id' => $usedBatchId,
            ]);

            return $locked->fresh(['item', 'batch', 'administeredBy']);
        });
    }

    /** Mark an administration skipped/held (no stock movement). */
    public static function setStatus(MedicationAdministrationRecord $mar, string $status, ?string $notes = null): MedicationAdministrationRecord
    {
        if (!in_array($status, [MedicationAdministrationRecord::STATUS_SKIPPED, MedicationAdministrationRecord::STATUS_HELD], true)) {
            throw new \RuntimeException('Invalid MAR status update');
        }
        $locked = MedicationAdministrationRecord::where('id', $mar->id)->lockForUpdate()->firstOrFail();
        if ($locked->status === MedicationAdministrationRecord::STATUS_ADMINISTERED) {
            throw new \RuntimeException('An administered record cannot be reverted — reverse the stock via an adjustment');
        }
        $locked->update([
            'status' => $status,
            'notes' => $notes ?? $locked->notes,
        ]);
        return $locked->fresh();
    }
}
