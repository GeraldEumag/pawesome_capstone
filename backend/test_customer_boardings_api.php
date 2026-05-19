<?php

require_once __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "=== CUSTOMER BOARDINGS API TESTING ===\n\n";

try {
    $request = Illuminate\Http\Request::create('/api/customer/boardings', 'GET');
    $response = $app->handle($request);
    $status = $response->status();
    $content = $response->content();
    
    echo "Status: HTTP {$status}\n";
    echo "Content: " . substr($content, 0, 200) . "...\n";
    
    if ($status === 200) {
        echo "✅ Endpoint accessible (returns 200)\n";
    } elseif ($status === 401) {
        echo "⚠️  Endpoint requires authentication (returns 401)\n";
    } else {
        echo "❌ Unexpected status code\n";
    }
    
} catch (\Exception $e) {
    echo "❌ EXCEPTION: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . "\n";
    echo "Line: " . $e->getLine() . "\n";
}
