<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use League\Flysystem\UnableToWriteFile;
use Throwable;

/**
 * Handles only the storage lifecycle of an upload:
 * store new file -> run the caller's DB write -> on failure remove the new file
 * -> on success optionally remove the replaced file.
 * Validation and business rules stay in the controllers.
 */
class FileStorageService
{
    /**
     * @param  callable(string $path): mixed  $persist  DB write that references the new path
     * @param  string|null  $oldPath  Previously stored path to remove after a successful commit
     * @param  string|null  $prefix  When set, the file is stored as "{prefix}_{time}_{random}.{ext}"
     * @return mixed Result of $persist
     */
    public static function storeAndPersist(
        UploadedFile $file,
        string $directory,
        string $disk,
        callable $persist,
        ?string $oldPath = null,
        bool $deleteOld = true,
        ?string $prefix = null,
        ?string $oldDisk = null,
    ): mixed {
        $path = $prefix
            ? $file->storeAs($directory, $prefix . '_' . time() . '_' . Str::random(10) . '.' . $file->extension(), $disk)
            : $file->store($directory, $disk);

        // Disks are configured with throw => true; this guards drivers that still return false.
        if (!is_string($path) || $path === '') {
            throw UnableToWriteFile::atLocation($directory, "Upload to [{$disk}] disk returned no path.");
        }

        try {
            $result = DB::transaction(fn () => $persist($path));
        } catch (Throwable $e) {
            self::deleteQuietly($disk, $path);
            throw $e;
        }

        if ($deleteOld && $oldPath && $oldPath !== $path) {
            self::deleteQuietly($oldDisk ?? $disk, $oldPath);
        }

        return $result;
    }

    public static function deleteQuietly(string $disk, ?string $path): void
    {
        if (!$path) {
            return;
        }

        try {
            Storage::disk($disk)->delete($path);
        } catch (Throwable $e) {
            Log::warning('File cleanup failed', ['disk' => $disk, 'path' => $path, 'error' => $e->getMessage()]);
        }
    }
}
