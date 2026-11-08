<?php

require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

$identity = DB::selectOne('SELECT DATABASE() AS db, VERSION() AS version');
$host = DB::connection()->getConfig('host');
if (!in_array($identity->db, ['pawesome_test', 'pawesome_e2e_audit'], true)
    || !in_array($host, ['127.0.0.1', 'localhost', '::1'], true)) {
    throw new RuntimeException('Schema snapshot requires an explicitly approved local disposable database.');
}

$output = $argv[1] ?? dirname(__DIR__) . '/browser-evidence/schema-integrity/' . date('Ymd-His') . '/snapshot.json';
if (file_exists($output)) {
    throw new RuntimeException('Refusing to overwrite existing schema evidence.');
}

$tables = DB::select('SELECT TABLE_NAME AS name, ENGINE AS engine FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME', [$identity->db, 'BASE TABLE']);
$columns = DB::select('SELECT TABLE_NAME AS table_name, COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_KEY AS key_type, EXTRA AS extra FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION', [$identity->db]);
$indexes = DB::select('SELECT TABLE_NAME AS table_name, INDEX_NAME AS name, NON_UNIQUE AS non_unique, SEQ_IN_INDEX AS sequence, COLUMN_NAME AS column_name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX', [$identity->db]);
$keys = DB::select('SELECT k.TABLE_NAME AS table_name, k.CONSTRAINT_NAME AS name, k.COLUMN_NAME AS column_name, k.REFERENCED_TABLE_SCHEMA AS parent_schema, k.REFERENCED_TABLE_NAME AS parent_table, k.REFERENCED_COLUMN_NAME AS parent_column, r.UPDATE_RULE AS update_rule, r.DELETE_RULE AS delete_rule FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION', [$identity->db]);
$groups = [];
$constrained = [];
foreach ($keys as $key) {
    $groups[$key->table_name . ':' . $key->name][] = $key;
    $constrained[$key->table_name . ':' . $key->column_name] = true;
}

$quote = fn (string $name): string => '`' . str_replace('`', '``', $name) . '`';
$checks = [];
foreach ($groups as $name => $parts) {
    $first = $parts[0];
    if ($first->parent_schema !== $identity->db) {
        $checks[] = ['constraint' => $name, 'status' => 'BLOCKED', 'reason' => 'Parent is outside the approved database.'];
        continue;
    }
    $joins = [];
    $present = [];
    foreach ($parts as $part) {
        $joins[] = 'c.' . $quote($part->column_name) . ' = p.' . $quote($part->parent_column);
        $present[] = 'c.' . $quote($part->column_name) . ' IS NOT NULL';
    }
    $sql = 'SELECT COUNT(*) AS aggregate FROM ' . $quote($first->table_name) . ' c LEFT JOIN '
        . $quote($first->parent_table) . ' p ON ' . implode(' AND ', $joins)
        . ' WHERE ' . implode(' AND ', $present) . ' AND p.' . $quote($first->parent_column) . ' IS NULL';
    $orphans = (int) DB::selectOne($sql)->aggregate;
    $checks[] = ['constraint' => $name, 'status' => $orphans === 0 ? 'PASS' : 'FAIL', 'orphan_count' => $orphans];
}

$unconstrained = array_values(array_filter($columns, fn ($column) => str_ends_with($column->name, '_id')
    && !isset($constrained[$column->table_name . ':' . $column->name])));

$logicalReferences = [
    ['add_ons', 'inventory_item_id', 'inventory_items'],
    ['appointments', 'service_request_id', 'service_requests'],
    ['appointment_status_rollback_map', 'appointment_id', 'appointments'],
    ['boardings', 'service_request_id', 'service_requests'],
    ['boarding_room_reservations', 'room_id', 'boarding_rooms'],
    ['boarding_room_reservations', 'pet_id', 'pets'],
    ['boarding_room_reservations', 'customer_id', 'customers'],
    ['booking_addons', 'booking_id', 'boardings'],
    ['booking_addons', 'add_on_id', 'add_ons'],
    ['booking_addons', 'inventory_item_id', 'inventory_items'],
    ['confinement_status_rollback_map', 'confinement_id', 'medical_confinements'],
    ['email_deliveries', 'user_id', 'users'],
    ['email_deliveries', 'customer_id', 'customers'],
    ['groomings', 'service_request_id', 'service_requests'],
    ['service_item_usages', 'service_id', 'services'],
    ['service_item_usages', 'customer_id', 'customers'],
    ['service_requests', 'boarding_room_id', 'boarding_rooms'],
    ['sessions', 'user_id', 'users'],
    ['payment_settlements', 'visit_invoice_id', 'visit_invoices'],
    ['payment_settlements', 'customer_id', 'customers'],
    ['payment_settlements', 'user_id', 'users'],
    ['visit_consents', 'signed_by_user_id', 'users'],
    ['visit_invoices', 'customer_id', 'customers'],
    ['visit_invoice_adjustments', 'service_item_usage_id', 'service_item_usages'],
    ['visit_invoice_lines', 'service_item_usage_id', 'service_item_usages'],
];
$logicalChecks = [];
foreach ($logicalReferences as [$table, $column, $parent]) {
    $orphans = (int) DB::selectOne('SELECT COUNT(*) AS aggregate FROM ' . $quote($table) . ' c LEFT JOIN ' . $quote($parent) . ' p ON p.id = c.' . $quote($column) . ' WHERE c.' . $quote($column) . ' IS NOT NULL AND p.id IS NULL')->aggregate;
    $logicalChecks[] = ['reference' => "$table.$column->$parent.id", 'status' => $orphans === 0 ? 'PASS' : 'FAIL', 'orphan_count' => $orphans];
}
$report = [
    'generated_at' => now()->toIso8601String(),
    'database' => $identity->db,
    'engine_version' => $identity->version,
    'scope' => 'Read-only metadata and declared-FK orphan counts on disposable data; not logical-reference or financial reconciliation.',
    'tables' => $tables,
    'columns' => $columns,
    'index_columns' => $indexes,
    'foreign_key_columns' => $keys,
    'foreign_key_orphan_checks' => $checks,
    'logical_reference_checks' => $logicalChecks,
    'unconstrained_id_columns_for_manual_review' => $unconstrained,
];
if (!is_dir(dirname($output)) && !mkdir(dirname($output), 0777, true) && !is_dir(dirname($output))) {
    throw new RuntimeException('Cannot create schema evidence directory.');
}
if (file_put_contents($output, json_encode($report, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR)) === false) {
    throw new RuntimeException('Cannot write schema evidence.');
}

echo json_encode([
    'database' => $identity->db,
    'tables' => count($tables),
    'foreign_key_columns' => count($keys),
    'constraints_checked' => count($checks),
    'passed' => count(array_filter($checks, fn ($check) => $check['status'] === 'PASS')),
    'failed' => count(array_filter($checks, fn ($check) => $check['status'] === 'FAIL')),
    'blocked' => count(array_filter($checks, fn ($check) => $check['status'] === 'BLOCKED')),
    'logical_checks' => count($logicalChecks),
    'logical_failed' => count(array_filter($logicalChecks, fn ($check) => $check['status'] === 'FAIL')),
    'unconstrained_id_columns' => count($unconstrained),
    'evidence' => $output,
], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
