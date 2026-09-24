<?php

namespace App\Http\Controllers\Concerns;

use App\Services\FileStorageService;
use Illuminate\Http\Request;

trait HandlesInventoryUploads
{
    /**
     * Validates and stores inventory photo / batch proof uploads on the public disk,
     * then runs $save($data). Stored files are removed if $save throws.
     */
    private function saveWithInventoryUploads(Request $request, array $data, callable $save, ?string $oldPhoto = null, bool $withBatchProof = false): array
    {
        $imageRule = 'image|mimes:jpg,jpeg,png,webp|max:5120';
        $request->validate(array_filter([
            'photo' => $request->hasFile('photo') ? $imageRule : null,
            'batch_proof' => $withBatchProof && $request->hasFile('batch_proof') ? $imageRule : null,
        ]));

        $saveWithBatch = fn (array $data) => $withBatchProof && $request->hasFile('batch_proof')
            ? FileStorageService::storeAndPersist(
                $request->file('batch_proof'), 'inventory/batches', 'public',
                function (string $path) use ($data, $save) {
                    $data['batchData'] = array_merge((array) ($data['batchData'] ?? []), ['proof_photo' => $path]);
                    return $save($data);
                },
                prefix: 'batch',
            )
            : $save($data);

        // Legacy photos live under public/uploads (outside the disk) or as absolute URLs; leave those untouched.
        $deletableOldPhoto = $oldPhoto && !str_starts_with($oldPhoto, 'uploads/') && !str_starts_with($oldPhoto, 'http') ? $oldPhoto : null;

        return $request->hasFile('photo')
            ? FileStorageService::storeAndPersist(
                $request->file('photo'), 'inventory', 'public',
                fn (string $path) => $saveWithBatch(['photo' => $path] + $data),
                oldPath: $deletableOldPhoto,
                prefix: 'inv',
            )
            : $saveWithBatch($data);
    }
}
