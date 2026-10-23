<?php

namespace App\Services;

use App\Models\InventoryBatch;
use App\Models\Vaccination;
use Illuminate\Support\Facades\DB;

/**
 * Vaccination administration. When an inventory batch is linked, one dose is
 * deducted from that batch (FEFO-validated, expired batches blocked) and the
 * batch's lot number + expiry are snapshotted onto the vaccination so the
 * certificate and recall lists stay correct even after the batch depletes.
 */
class VaccinationService
{
    /**
     * Record a vaccination. If `inventory_batch_id` is given, deduct one
     * dose and snapshot lot/expiry from the batch — inside one transaction.
     */
    public static function administer(array $data): Vaccination
    {
        return DB::transaction(function () use ($data) {
            $batch = !empty($data['inventory_batch_id'])
                ? InventoryBatch::where('id', $data['inventory_batch_id'])->lockForUpdate()->firstOrFail()
                : null;

            if ($batch) {
                if ($batch->isExpired()) {
                    throw new \RuntimeException("Batch {$batch->batch_no} is expired — expired vaccine cannot be administered");
                }
                if ($batch->remaining_quantity < 1) {
                    throw new \RuntimeException("Batch {$batch->batch_no} has no doses remaining");
                }

                (new InventoryService())->deductStock(
                    (int) $batch->inventory_item_id,
                    1,
                    "Vaccination dose administered ({$data['vaccine_name']})",
                    'vaccination',
                    null,
                    (int) $batch->id
                );

                $data['lot_number'] = $data['lot_number'] ?? $batch->batch_no;
                $data['vaccine_expiry_date'] = $batch->expiration_date;
            }

            return Vaccination::create($data);
        });
    }

    /**
     * Certificate payload — the acceptance criterion requires lot + expiry.
     */
    public static function certificate(Vaccination $vaccination): array
    {
        $vaccination->loadMissing(['pet.customer.user', 'veterinarian', 'inventoryBatch']);

        return [
            'certificate_number' => 'VAC-' . str_pad((string) $vaccination->id, 6, '0', STR_PAD_LEFT),
            'issued_at' => now()->toIso8601String(),
            'pet' => [
                'name' => $vaccination->pet?->name,
                'species' => $vaccination->pet?->species,
                'breed' => $vaccination->pet?->breed,
            ],
            'owner' => [
                'name' => $vaccination->pet?->customer?->name,
            ],
            'vaccine' => [
                'name' => $vaccination->vaccine_name,
                'type' => $vaccination->vaccine_type,
                'manufacturer' => $vaccination->manufacturer,
                'lot_number' => $vaccination->lot_number ?? $vaccination->inventoryBatch?->batch_no,
                'expiry_date' => optional($vaccination->vaccine_expiry_date ?? $vaccination->inventoryBatch?->expiration_date)->toDateString(),
                'dosage' => $vaccination->dosage !== null ? trim("{$vaccination->dosage} {$vaccination->dosage_unit}") : null,
                'route' => $vaccination->route_of_administration,
                'site' => $vaccination->site_of_administration,
            ],
            'date_administered' => optional($vaccination->date_administered)->toDateString(),
            'next_due_date' => optional($vaccination->next_due_date)->toDateString(),
            'administered_by' => $vaccination->veterinarian?->name,
        ];
    }
}
