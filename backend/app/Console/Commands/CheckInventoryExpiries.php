<?php

namespace App\Console\Commands;

use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/**
 * Daily expiry sweep (Phase D): notify inventory/admin/manager when batches
 * are 90 and 30 days from expiry, and flag past-due batches 'expired' so
 * they stay physically counted but can never be issued.
 */
class CheckInventoryExpiries extends Command
{
    protected $signature = 'inventory:check-expiries';
    protected $description = 'Notify on 90/30-day batch expiries and flag expired batches';

    public function handle(): int
    {
        $staff = User::whereIn('role', ['admin', 'inventory', 'manager'])->pluck('id');
        $now = now()->startOfDay();

        // 1) Flag newly-expired batches (physical quantity kept for counts).
        $expired = InventoryBatch::where('status', 'active')
            ->whereNotNull('expiration_date')
            ->where('expiration_date', '<', $now)
            ->get();
        foreach ($expired as $batch) {
            $batch->update(['status' => 'expired']);
            $this->notify($staff, 'Batch expired — write-off required',
                "Batch {$batch->batch_no} of {$batch->inventoryItem?->name} expired on {$batch->expiration_date->toDateString()} with {$batch->remaining_quantity} units. Dispose with a reason to write it off.",
                'danger', 'inventory_batch', $batch->id);
        }

        // 2) 30-day and 90-day alerts (deduped per batch per threshold per day).
        foreach ([30 => '30-day', 90 => '90-day'] as $days => $label) {
            $batches = InventoryBatch::where('status', 'active')
                ->where('remaining_quantity', '>', 0)
                ->whereNotNull('expiration_date')
                ->whereBetween('expiration_date', [$now, $now->copy()->addDays($days)])
                ->get();

            foreach ($batches as $batch) {
                $daysLeft = (int) $now->diffInDays($batch->expiration_date);
                // Only fire when the batch crosses into the window — the
                // narrower alerts still catch it on the tighter threshold.
                $alreadyTighter = $days === 90 && $daysLeft <= 30;
                if ($alreadyTighter) {
                    continue;
                }
                $this->notify($staff, "Batch expiring within {$days} days",
                    "Batch {$batch->batch_no} of {$batch->inventoryItem?->name} expires {$batch->expiration_date->toDateString()} ({$daysLeft} days, {$batch->remaining_quantity} units).",
                    'warning', 'inventory_batch', $batch->id);
            }
        }

        $this->info("Expiry sweep complete: {$expired->count()} batches flagged expired.");
        return self::SUCCESS;
    }

    private function notify($staffIds, string $title, string $message, string $level, string $type, int $id): void
    {
        foreach ($staffIds as $userId) {
            NotificationService::createNotification(
                $userId, $title, $message, $level, $type, $id,
                ['dedupe_key' => "{$type}:{$id}:" . now()->toDateString() . ':' . $title]
            );
        }
    }
}
