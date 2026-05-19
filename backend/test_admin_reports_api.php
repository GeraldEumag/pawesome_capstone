<?php

require_once __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "=== ADMIN REPORTS API TESTING ===\n\n";

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
        
        try {
            $response = $app->handle($request);
            $status = $response->status();
            $content = $response->content();
            
            // Check if response is valid JSON
            $json = json_decode($content, true);
            $isJson = $json !== null;
            
            $results[$name] = [
                'endpoint' => $endpoint,
                'status' => $status,
                'is_json' => $isJson,
                'success' => $status === 200,
                'error' => null
            ];
            
            echo "✅ {$name}: HTTP {$status}" . ($isJson ? " (JSON)" : " (Not JSON)") . "\n";
            
        } catch (\Exception $e) {
            $results[$name] = [
                'endpoint' => $endpoint,
                'status' => 500,
                'is_json' => false,
                'success' => false,
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
            echo "❌ {$name}: " . ($result['error'] ?? "HTTP {$result['status']}") . "\n";
        }
    }
}
