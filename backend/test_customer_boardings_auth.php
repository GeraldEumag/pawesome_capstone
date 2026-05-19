<?php

require_once __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "=== AUTHENTICATED CUSTOMER BOARDINGS API TESTING ===\n\n";

$customerToken = '255|G1K5fNa4mqkdVD4afIKGNvdbw6jVjQ6E9vISOpUt07a5dc6a';

try {
    $request = Illuminate\Http\Request::create('/api/customer/boardings', 'GET');
    $request->headers->set('Authorization', 'Bearer ' . $customerToken);
    
    $response = $app->handle($request);
    $status = $response->status();
    $content = $response->content();
    
    echo "Status: HTTP {$status}\n";
    
    // Check if response is valid JSON
    $json = json_decode($content, true);
    $isJson = $json !== null;
    
    echo "Is JSON: " . ($isJson ? 'Yes' : 'No') . "\n";
    
    // Check for SQL errors
    $hasSqlError = strpos($content, 'SQLSTATE') !== false || strpos($content, 'SQL error') !== false;
    $hasUnknownColumn = strpos($content, 'Unknown column') !== false;
    $hasMissingTable = strpos($content, "doesn't exist") !== false;
    $hasLoadError = strpos($content, 'Failed to load customer boardings') !== false;
    
    echo "Has SQL Error: " . ($hasSqlError ? 'Yes' : 'No') . "\n";
    echo "Has Unknown Column: " . ($hasUnknownColumn ? 'Yes' : 'No') . "\n";
    echo "Has Missing Table: " . ($hasMissingTable ? 'Yes' : 'No') . "\n";
    echo "Has Load Error: " . ($hasLoadError ? 'Yes' : 'No') . "\n";
    
    if ($isJson && $json) {
        echo "\nResponse shape keys: " . implode(', ', array_keys($json)) . "\n";
        
        if (isset($json['success'])) {
            echo "Success: " . ($json['success'] ? 'Yes' : 'No') . "\n";
        }
        
        if (isset($json['data']) || isset($json['boardings'])) {
            $data = $json['data'] ?? $json['boardings'] ?? [];
            echo "Data count: " . (is_array($data) ? count($data) : 'N/A') . "\n";
            
            if (is_array($data) && count($data) > 0) {
                echo "\nFirst boarding keys: " . implode(', ', array_keys($data[0])) . "\n";
            }
        }
    }
    
    echo "\n";
    
    if ($status === 200 && !$hasSqlError && !$hasUnknownColumn && !$hasMissingTable && !$hasLoadError) {
        echo "✅ PASSED: Customer boardings API is working correctly\n";
    } else {
        echo "❌ FAILED: Customer boardings API has issues\n";
        if ($status !== 200) echo "   - Status code is {$status}\n";
        if ($hasSqlError) echo "   - SQL error detected\n";
        if ($hasUnknownColumn) echo "   - Unknown column error\n";
        if ($hasMissingTable) echo "   - Missing table error\n";
        if ($hasLoadError) echo "   - Failed to load error\n";
    }
    
} catch (\Exception $e) {
    echo "❌ EXCEPTION: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . "\n";
    echo "Line: " . $e->getLine() . "\n";
}
