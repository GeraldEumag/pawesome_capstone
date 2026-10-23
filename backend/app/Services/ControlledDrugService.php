<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\ControlledDrugCount;
use App\Models\ControlledDrugEntry;
use App\Models\InventoryItem;
use Illuminate\Support\Facades\DB;

/**
 * Controlled-drug register. Every stock-affecting movement of a
 * controlled_drug-classed item appends a row with a running balance computed
 * under the item's row lock — the register and `inventory_items.stock` can
 * never disagree. Entries are append-only; corrections are new rows.
 */
class ControlledDrugService
{
    /**
     * Append a register entry and return the new balance. MUST be called
     * inside a transaction that already holds (or will hold) the item's row
     * lock — DispensingService/MarService lock before calling.
     */
    public static function record(InventoryItem $item, array $data): ControlledDrugEntry
    {
        $locked = InventoryItem::where('id', $item->id)->lockForUpdate()->firstOrFail();
        if (!$locked->isControlledDrug()) {
            throw new \RuntimeException("Item '{$locked->name}' is not a controlled drug");
        }

        $balance = self::balance((int) $locked->id) + (int) $data['quantity_delta'];

        $entry = ControlledDrugEntry::create([
            'inventory_item_id' => $locked->id,
            'inventory_batch_id' => $data['inventory_batch_id'] ?? null,
            'dispensation_id' => $data['dispensation_id'] ?? null,
            'mar_id' => $data['mar_id'] ?? null,
            'prescription_id' => $data['prescription_id'] ?? null,
            'appointment_id' => $data['appointment_id'] ?? null,
            'medical_confinement_id' => $data['medical_confinement_id'] ?? null,
            'pet_id' => $data['pet_id'] ?? null,
            'customer_id' => $data['customer_id'] ?? null,
            'prescriber_id' => $data['prescriber_id'] ?? null,
            'performed_by' => $data['performed_by'],
            'witness_id' => $data['witness_id'] ?? null,
            'entry_type' => $data['entry_type'],
            'quantity_delta' => (int) $data['quantity_delta'],
            'balance_after' => $balance,
            'notes' => $data['notes'] ?? null,
        ]);

        ActivityLog::log($data['performed_by'], 'controlled_drug_movement',
            "{$data['entry_type']} {$data['quantity_delta']} x {$locked->name} (balance {$balance})", [
                'category' => 'inventory',
                'reference_type' => 'controlled_drug_entry',
                'reference_id' => $entry->id,
                'metadata' => [
                    'inventory_item_id' => $locked->id,
                    'entry_type' => $data['entry_type'],
                    'balance_after' => $balance,
                ],
            ]);

        return $entry;
    }

    /** Current register balance for an item (sum of all deltas). */
    public static function balance(int $itemId): int
    {
        return (int) ControlledDrugEntry::where('inventory_item_id', $itemId)
            ->sum('quantity_delta');
    }

    /**
     * Weekly physical count, step one: the counter records the shelf count.
     * A second person must verify before it takes effect.
     */
    public static function submitCount(InventoryItem $item, int $countedBalance, ?string $reason, int $counterId, string $weekOf): ControlledDrugCount
    {
        if (!$item->isControlledDrug()) {
            throw new \RuntimeException("Item '{$item->name}' is not a controlled drug");
        }

        $expected = self::balance((int) $item->id);
        $variance = $countedBalance - $expected;

        return ControlledDrugCount::create([
            'inventory_item_id' => $item->id,
            'expected_balance' => $expected,
            'counted_balance' => $countedBalance,
            'variance' => $variance,
            'reason' => $reason,
            'counted_by' => $counterId,
            'status' => ControlledDrugCount::STATUS_PENDING_WITNESS,
            'week_of' => $weekOf,
        ]);
    }

    /**
     * Step two: a different staff member witnesses/verifies the count.
     * A verified variance posts a count_correction register entry and
     * reconciles physical stock in the same transaction.
     */
    public static function verifyCount(ControlledDrugCount $count, int $witnessId, ?string $reason = null): ControlledDrugCount
    {
        return DB::transaction(function () use ($count, $witnessId, $reason) {
            $locked = ControlledDrugCount::where('id', $count->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== ControlledDrugCount::STATUS_PENDING_WITNESS) {
                throw new \RuntimeException('This count has already been verified');
            }
            if ((int) $locked->counted_by === (int) $witnessId) {
                throw new \RuntimeException('A second person must witness the count');
            }

            $item = InventoryItem::where('id', $locked->inventory_item_id)->lockForUpdate()->firstOrFail();
            $variance = (int) $locked->variance;

            if ($variance !== 0) {
                $note = $reason ?: $locked->reason;
                if (!trim((string) $note)) {
                    throw new \RuntimeException('A reason is required when the count does not match the register');
                }

                self::record($item, [
                    'entry_type' => ControlledDrugEntry::TYPE_COUNT_CORRECTION,
                    'quantity_delta' => $variance,
                    'performed_by' => $locked->counted_by,
                    'witness_id' => $witnessId,
                    'notes' => "Weekly count correction ({$locked->week_of}): {$note}",
                ]);

                // Physical stock follows the verified count — for a
                // controlled drug the register balance and on-shelf stock
                // must be the same number.
                (new InventoryService())->reconcileToStock(
                    $item->fresh(),
                    (int) $locked->counted_balance,
                    "Controlled drug count correction: {$note}",
                    'controlled_count',
                    'controlled_drug_count',
                    $locked->id,
                    'CDAUDIT',
                    ['count_id' => $locked->id, 'variance' => $variance]
                );
            }

            $locked->update([
                'status' => ControlledDrugCount::STATUS_VERIFIED,
                'witnessed_by' => $witnessId,
                'verified_at' => now(),
            ]);

            return $locked->fresh();
        });
    }
}
