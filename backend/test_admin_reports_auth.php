<?php

require_once __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "=== AUTHENTICATED ADMIN REPORTS API TESTING ===\n\n";

$adminToken = '254|oVfC1wJX9oxQGwNkvE6Tm6ThCbTqEyFn7OMPqmS50f508001';

$endpoints = [
    'overview' => '/api/admin/reports/overview',
    'orders' => '/api/admin/reports/orders',
    'payments' => '/api/admin/reports/payments',
    'services' => '/api/admin/reports/services',
    'inventory' => '/api/admin/reports/inventory',
    'customers' => '/api/admin/reports/customers',
    'veterinary' => '/api/admin/reports/veterinary',
    'cashier' => '/api/admin/reports/cashier',
    'payroll' => '/api/admin/reports/payroll',
    'system-health' => '/api/admin/reports/system-health',
];

$results = [];

foreach ($endpoints as $name => $endpoint) {
    try {
        $request = Illuminate\Http\Request::create($endpoint, 'GET');
        $request->headers->set('Authorization', 'Bearer ' . $adminToken);
        
        try {
            $response = $app->handle($request);
            $status = $response->status();
            $content = $response->content();
            
            // Check if response is valid JSON
            $json = json_decode($content, true);
            $isJson = $json !== null;
            
            // Check for SQL errors in content
            $hasSqlError = strpos($content, 'SQLSTATE') !== false || strpos($content, 'SQL error') !== false;
            $hasUnknownColumn = strpos($content, 'Unknown column') !== false;
            $hasMissingTable = strpos($content, "doesn't exist") !== false;
            
            $results[$name] = [
                'endpoint' => $endpoint,
                'status' => $status,
                'is_json' => $isJson,
                'success' => $status === 200 && !$hasSqlError && !$hasUnknownColumn && !$hasMissingTable,
                'has_sql_error' => $hasSqlError,
                'has_unknown_column' => $hasUnknownColumn,
                'has_missing_table' => $hasMissingTable,
                'error' => null
            ];
            
            $icon = $status === 200 ? '✅' : '❌';
            $jsonStatus = $isJson ? '(JSON)' : '(Not JSON)';
            $errorStatus = '';
            if ($hasSqlError) $errorStatus .= ' [SQL ERROR]';
            if ($hasUnknownColumn) $errorStatus .= ' [UNKNOWN COLUMN]';
            if ($hasMissingTable) $errorStatus .= ' [MISSING TABLE]';
            
            echo "{$icon} {$name}: HTTP {$status} {$jsonStatus}{$errorStatus}\n";
            
            if ($status === 200 && $isJson && isset($json)) {
                echo "   Response shape keys: " . implode(', ', array_keys($json)) . "\n";
            }
            
        } catch (\Exception $e) {
            $results[$name] = [
                'endpoint' => $endpoint,
                'status' => 500,
                'is_json' => false,
                'success' => false,
                'has_sql_error' => false,
                'has_unknown_column' => false,
                'has_missing_table' => false,
                'error' => $e->getMessage()
            ];
            echo "❌ {$name}: EXCEPTION - " . $e->getMessage() . "\n";
        }
        
    } catch (\Exception $e) {
        $results[$name] = [
            'endpoint' => $endpoint,
            'status' => 500,
            'is_json' => false,
            'success' => false,
            'has_sql_error' => false,
            'has_unknown_column' => false,
            'has_missing_table' => false,
            'error' => $e->getMessage()
        ];
        echo "❌ {$name}: FATAL - " . $e->getMessage() . "\n";
    }
}

echo "\n=== SUMMARY ===\n";
$successCount = count(array_filter($results, fn($r) => $r['success']));
echo "Successful: {$successCount}/" . count($results) . "\n";

if ($successCount < count($results)) {
    echo "\n=== FAILED ENDPOINTS ===\n";
    foreach ($results as $name => $result) {
        if (!$result['success']) {
            $error = $result['error'] ?? "HTTP {$result['status']}";
            if ($result['has_sql_error']) $error .= " (SQL Error)";
            if ($result['has_unknown_column']) $error .= " (Unknown Column)";
            if ($result['has_missing_table']) $error .= " (Missing Table)";
            echo "❌ {$name}: {$error}\n";
        }
    }
}
