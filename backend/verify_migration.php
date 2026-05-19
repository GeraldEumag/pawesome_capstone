<?php

require_once __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "=== MIGRATION VERIFICATION ===\n\n";

echo "=== BOARDING_ROOM_RESERVATIONS COLUMNS ===\n";
if (Schema::hasTable('boarding_room_reservations')) {
    $columns = Schema::getColumnListing('boarding_room_reservations');
    foreach ($columns as $column) {
        $exists = Schema::hasColumn('boarding_room_reservations', $column);
        echo "- {$column}: " . ($exists ? 'EXISTS' : 'MISSING') . "\n";
    }
    
    echo "\n=== CRITICAL COLUMNS ===\n";
    echo "source_type: " . (Schema::hasColumn('boarding_room_reservations', 'source_type') ? 'EXISTS ✅' : 'MISSING ❌') . "\n";
    echo "source_id: " . (Schema::hasColumn('boarding_room_reservations', 'source_id') ? 'EXISTS ✅' : 'MISSING ❌') . "\n";
} else {
    echo "Table does not exist\n";
}
