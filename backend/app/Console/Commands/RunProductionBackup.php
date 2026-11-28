<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use ZipArchive;

/**
 * Scheduled production backup: full MySQL dump (SQL, gzipped) + storage/app
 * archive (zip) + JSON manifest, all written to the persistent
 * storage/app/backups directory on the Railway volume.
 *
 * Off-site replication is a separate concern (requires object-storage
 * credentials); this command produces the verified local artifact set that
 * an off-site sync step can pick up.
 */
class RunProductionBackup extends Command
{
    protected $signature = 'ops:backup
                            {--keep-days=30 : Days to retain daily backups}
                            {--skip-storage : Skip the storage/app archive}';

    protected $description = 'Create a timestamped database + storage backup on the persistent volume';

    public function handle(): int
    {
        $stamp = now()->format('Ymd-His');
        $base = storage_path('app/backups');
        foreach (['db', 'storage', 'manifests'] as $dir) {
            if (!is_dir("{$base}/{$dir}")) {
                mkdir("{$base}/{$dir}", 0750, true);
            }
        }

        $manifest = [
            'created_at' => now()->toIso8601String(),
            'app_env' => config('app.env'),
            'database' => config('database.connections.mysql.database'),
            'status' => 'running',
        ];

        try {
            $dbFile = $this->dumpDatabase("{$base}/db/{$stamp}.sql");
            $manifest['database'] = [
                'file' => basename($dbFile),
                'bytes' => filesize($dbFile),
                'sha256' => hash_file('sha256', $dbFile),
                'tables' => $this->tableCount,
            ];
            $this->info("DB backup: {$manifest['database']['bytes']} bytes, {$this->tableCount} tables");
        } catch (\Throwable $e) {
            $manifest['status'] = 'failed';
            $manifest['error'] = 'database: '.$e->getMessage();
            $this->saveManifest($base, $stamp, $manifest);
            $this->error($manifest['error']);
            return self::FAILURE;
        }

        if (!$this->option('skip-storage')) {
            try {
                $zipFile = $this->archiveStorage("{$base}/storage/{$stamp}.zip");
                $manifest['storage'] = [
                    'file' => basename($zipFile),
                    'bytes' => filesize($zipFile),
                    'sha256' => hash_file('sha256', $zipFile),
                ];
                $this->info("Storage backup: {$manifest['storage']['bytes']} bytes");
            } catch (\Throwable $e) {
                $manifest['status'] = 'partial';
                $manifest['error'] = 'storage: '.$e->getMessage();
                $this->error($manifest['error']);
            }
        }

        $manifest['status'] = $manifest['status'] === 'running' ? 'ok' : $manifest['status'];
        $this->prune($base, (int) $this->option('keep-days'));
        $this->saveManifest($base, $stamp, $manifest);
        $this->info("Backup manifest saved. Status: {$manifest['status']}");

        return $manifest['status'] === 'ok' ? self::SUCCESS : self::FAILURE;
    }

    private int $tableCount = 0;

    private function dumpDatabase(string $path): string
    {
        $gz = gzopen($path.'.gz', 'wb9');
        if ($gz === false) {
            throw new \RuntimeException("Cannot open {$path}.gz");
        }

        $pdo = DB::connection()->getPdo();
        $database = config('database.connections.mysql.database');
        $tables = array_map(
            fn ($row) => array_values((array) $row)[0],
            DB::select('SHOW TABLES')
        );
        $this->tableCount = count($tables);

        gzwrite($gz, "-- Pawesome production backup {$this->now()}\n");
        gzwrite($gz, "-- Database: {$database}\nSET FOREIGN_KEY_CHECKS=0;\nSET NAMES utf8mb4;\n\n");

        foreach ($tables as $table) {
            $create = DB::select("SHOW CREATE TABLE `{$table}`");
            $row = (array) $create[0];
            $ddl = $row['Create Table'] ?? end($row);
            gzwrite($gz, "DROP TABLE IF EXISTS `{$table}`;\n{$ddl};\n\n");

            $offset = 0;
            $chunk = 500;
            do {
                $rows = DB::table($table)->offset($offset)->limit($chunk)->get();
                if ($rows->isEmpty()) {
                    break;
                }
                $columns = array_keys((array) $rows->first());
                $colList = '`'.implode('`,`', $columns).'`';
                foreach ($rows->chunk(100) as $batch) {
                    $values = $batch->map(function ($r) use ($pdo, $columns) {
                        $vals = array_map(function ($c) use ($pdo, $r) {
                            $v = $r->{$c};
                            return $v === null ? 'NULL' : $pdo->quote((string) $v);
                        }, $columns);
                        return '('.implode(',', $vals).')';
                    })->implode(",\n");
                    gzwrite($gz, "INSERT INTO `{$table}` ({$colList}) VALUES\n{$values};\n");
                }
                $offset += $chunk;
            } while (true);
            gzwrite($gz, "\n");
        }

        gzwrite($gz, "SET FOREIGN_KEY_CHECKS=1;\n");
        gzclose($gz);

        return $path.'.gz';
    }

    private function archiveStorage(string $path): string
    {
        $zip = new ZipArchive();
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException("Cannot create {$path}");
        }

        $root = storage_path('app');
        $backupsDir = realpath($root.'/backups');
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveCallbackFilterIterator(
                new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS),
                function ($current) use ($backupsDir) {
                    return !($current->isDir() && realpath($current->getPathname()) === $backupsDir);
                }
            )
        );

        $count = 0;
        foreach ($iterator as $file) {
            if (!$file->isFile()) {
                continue;
            }
            $local = 'app/'.ltrim(str_replace('\\', '/', substr($file->getPathname(), strlen($root))), '/');
            $zip->addFile($file->getPathname(), $local);
            $count++;
        }
        $zip->close();
        $this->info("Storage archive: {$count} files");

        return $path;
    }

    private function prune(string $base, int $keepDays): void
    {
        $cutoff = now()->subDays($keepDays)->getTimestamp();
        foreach (['db/*.sql.gz', 'storage/*.zip'] as $pattern) {
            foreach (glob("{$base}/".str_replace('*', '*', $pattern)) ?: [] as $file) {
                if (filemtime($file) < $cutoff) {
                    unlink($file);
                }
            }
        }
        foreach (glob("{$base}/manifests/*.json") ?: [] as $file) {
            if (filemtime($file) < $cutoff) {
                unlink($file);
            }
        }
    }

    private function saveManifest(string $base, string $stamp, array $manifest): void
    {
        file_put_contents(
            "{$base}/manifests/{$stamp}.json",
            json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    private function now(): string
    {
        return now()->toIso8601String();
    }
}
