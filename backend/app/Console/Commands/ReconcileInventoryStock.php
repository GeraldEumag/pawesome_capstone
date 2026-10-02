<?php

namespace App\Console\Commands;

use App\Models\InventoryItem;
use App\Models\InventoryLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Reconcile the flat inventory_items.stock counter against batch records.
 *
 * History lesson baked into this command: several write paths used to move
 * `stock` without touching `inventory_batches`, so POS showed stock it could
 * not sell ("Insufficient batch stock ... Available in batches: 0").
 *
 * Default is a dry-run report; pass --apply to write changes.
 */
class ReconcileInventoryStock extends Command
{
    protected $signature   = 'inventory:reconcile-stock {--apply : Apply the reconciliation (default is dry-run)}';
    protected $description = 'Align inventory_items.stock with usable inventory_batches quantities';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $this->info($apply ? 'Mode: APPLY (writing changes)' : 'Mode: DRY-RUN (pass --apply to write)');

        $actions = [];
        $reportOnly = [];

        foreach (InventoryItem::orderBy('id')->get() as $item) {
            $expiredActive = $item->batches()
                ->where('status', 'active')
                ->whereNotNull('expiration_date')
                ->where('expiration_date', '<=', now())
                ->get();

            $batchSum   = (int) $item->getBatchStock();
            $stock      = (int) $item->stock;
            $hasBatches = $item->hasRealBatches();

            // 1. Batches whose expiration date has passed but still carry the
            //    'active' status are unsellable — mark them expired and take
            //    their remaining quantity out of the flat counter.
            foreach ($expiredActive as $batch) {
                $actions[] = [
                    'item'   => "{$item->name} (#{$item->id})",
                    'action' => "expire batch {$batch->batch_no} ({$batch->remaining_quantity} units), stock {$stock} -> " . max(0, $stock - $batch->remaining_quantity),
                    'run'    => function () use ($item, $batch) {
                        $batch->update(['status' => 'expired']);
                        $item->update(['stock' => max(0, (int) $item->stock - (int) $batch->remaining_quantity)]);
                        InventoryLog::create([
                            'inventory_item_id' => $item->id,
                            'delta'             => -(int) $batch->remaining_quantity,
                            'quantity'          => (int) $batch->remaining_quantity,
                            'type'              => 'expiry_mark',
                            'movement_type'     => 'expiry_mark',
                            'reason'            => "Batch {$batch->batch_no} expired — removed from sellable stock",
                            'reference_type'    => 'reconciliation',
                            'performed_by'      => 'System (inventory:reconcile-stock)',
                        ]);
                    },
                ];
            }

            if ($expiredActive->isNotEmpty()) {
                $stock = max(0, $stock - (int) $expiredActive->sum('remaining_quantity'));
            }

            // 2. Flat stock exceeds usable batch quantities.
            if ($stock > $batchSum) {
                $diff = $stock - $batchSum;
                $actions[] = [
                    'item'   => "{$item->name} (#{$item->id})",
                    'action' => ($hasBatches ? "create RECON batch (+{$diff})" : "create RECON batch (+{$diff}, item was never batch-tracked)"),
                    'run'    => function () use ($item, $diff) {
                        $item->batches()->create([
                            'batch_no'           => 'RECON-' . strtoupper(uniqid()),
                            'received_date'      => now(),
                            'quantity'           => $diff,
                            'remaining_quantity' => $diff,
                            'status'             => 'active',
                            'notes'              => 'Reconciliation: untracked stock made sellable',
                        ]);
                        InventoryLog::create([
                            'inventory_item_id' => $item->id,
                            'delta'             => 0,
                            'quantity'          => $diff,
                            'type'              => 'reconciliation',
                            'movement_type'     => 'stock_reconciliation',
                            'reason'            => "Reconciled {$diff} untracked units into RECON batch",
                            'reference_type'    => 'reconciliation',
                            'stock_before'      => $item->stock,
                            'stock_after'       => $item->stock,
                            'previous_stock'    => $item->stock,
                            'new_stock'         => $item->stock,
                            'performed_by'      => 'System (inventory:reconcile-stock)',
                        ]);
                    },
                ];
            } elseif ($stock < $batchSum) {
                // Batches claim more than the counter — needs a human call.
                $reportOnly[] = "{$item->name} (#{$item->id}): stock={$stock} but batches total {$batchSum} — manual review needed";
            }
        }

        $this->table(['Item', 'Planned action'], array_map(
            fn ($a) => [$a['item'], $a['action']],
            $actions
        ));

        foreach ($reportOnly as $line) {
            $this->warn($line);
        }

        if (empty($actions) && empty($reportOnly)) {
            $this->info('All items already in sync.');
            return self::SUCCESS;
        }

        if (!$apply) {
            $this->info(count($actions) . ' action(s) planned. Re-run with --apply to write.');
            return self::SUCCESS;
        }

        foreach ($actions as $action) {
            DB::transaction($action['run']);
            $this->line("Applied: {$action['item']} — {$action['action']}");
        }

        $this->info('Reconciliation complete.');
        return self::SUCCESS;
    }
}
