<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Report/dashboard read-path indexes (revision FR-03, PERFORMANCE P3).
 *
 * Evidence (EXPLAIN on dev data, 2026-11-24):
 *  - payments:        ALL scan + filesort on `created_at BETWEEN … ORDER BY created_at DESC`
 *  - service_requests: ALL scan + filesort on the same payments-report merge query
 *  - sales:           already covered for date ranges by sales_created_at_index,
 *                     but cashier dashboard counts filter `status='completed'`
 *                     with no usable index.
 *
 * Every index is single-purpose, additive and reversible. Low-cardinality
 * status columns are indexed only where a hot poll path filters on them
 * (cashier payment queue / dashboard counters).
 */
return new class extends Migration
{
    /** @var array<string, list<string>> table => columns */
    private const INDEXES = [
        'payments' => ['created_at'],
        'service_requests' => ['created_at', 'payment_status'],
        'customer_orders' => ['created_at'],
        'boardings' => ['created_at'],
        'medical_confinements' => ['created_at'],
        'appointments' => ['created_at'],
        'sales' => ['status'],
    ];

    public function up(): void
    {
        foreach (self::INDEXES as $table => $columns) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            $existing = collect(Schema::getIndexes($table))->pluck('name')->all();
            foreach ($columns as $column) {
                $name = $this->indexName($table, $column);
                if (in_array($name, $existing, true) || in_array($column, $this->coveredByExistingIndex($table, $existing), true)) {
                    continue;
                }
                Schema::table($table, function (Blueprint $blueprint) use ($table, $column, $name) {
                    $blueprint->index($column, $name);
                });
            }
        }
    }

    public function down(): void
    {
        foreach (self::INDEXES as $table => $columns) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            $existing = collect(Schema::getIndexes($table))->pluck('name')->all();
            foreach ($columns as $column) {
                $name = $this->indexName($table, $column);
                if (!in_array($name, $existing, true)) {
                    continue;
                }
                Schema::table($table, function (Blueprint $blueprint) use ($name) {
                    $blueprint->dropIndex($name);
                });
            }
        }
    }

    private function indexName(string $table, string $column): string
    {
        return "{$table}_{$column}_idx";
    }

    /** Columns already leading an existing index (e.g. PK, FK, prior indexes). */
    private function coveredByExistingIndex(string $table, array $existingNames): array
    {
        $covered = [];
        foreach (Schema::getIndexes($table) as $index) {
            $first = $index['columns'][0] ?? null;
            if ($first !== null) {
                $covered[] = $first;
            }
        }

        return $covered;
    }
};
