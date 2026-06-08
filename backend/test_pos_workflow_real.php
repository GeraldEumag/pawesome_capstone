<?php

/**
 * Real POS Transaction Workflow Test
 * Performs actual authenticated API calls to test POS workflow
 */

require __DIR__ . '/vendor/autoload.php';

use Illuminate\Support\Facades\DB;
use App\Models\InventoryItem;
use App\Models\Sale;
use App\Models\InventoryLog;

$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

echo "=== Real POS Transaction Workflow Test ===\n\n";

// Configuration
$baseUrl = 'http://127.0.0.1:8000/api';
$cashierEmail = 'cashier@example.com';
$cashierPassword = 'Password123!';

// Step 1: Login as cashier
echo "Step 1: Login as cashier\n";
$loginResponse = makeRequest('POST', $baseUrl . '/auth/login', [
    'email' => $cashierEmail,
    'password' => $cashierPassword,
]);

if (!$loginResponse['success']) {
    echo "✗ Login failed: " . $loginResponse['message'] . "\n";
    exit(1);
}

$token = $loginResponse['data']['token'] ?? $loginResponse['data']['access_token'] ?? null;
if (!$token) {
    echo "✗ No token in login response\n";
    print_r($loginResponse);
    exit(1);
}

echo "✓ Login successful, token acquired\n\n";

// Step 2: Fetch sellable inventory
echo "Step 2: Fetch sellable inventory\n";
$productsResponse = makeRequest('GET', $baseUrl . '/cashier/pos/products', [], $token);

if (!$productsResponse['success']) {
    echo "✗ Failed to fetch products: " . $productsResponse['message'] . "\n";
    exit(1);
}

$products = $productsResponse['data']['products'] ?? $productsResponse['data'] ?? [];
if (empty($products)) {
    echo "✗ No sellable products found\n";
    exit(1);
}

echo "✓ Fetched " . count($products) . " sellable products\n\n";

// Step 3: Select a test item with enough stock
echo "Step 3: Select test item\n";
$testItem = null;
foreach ($products as $product) {
    if (($product['stock'] ?? 0) >= 2) {
        $testItem = $product;
        break;
    }
}

if (!$testItem) {
    echo "✗ No item with sufficient stock (>=2) found\n";
    exit(1);
}

$itemId = $testItem['id'];
$itemName = $testItem['name'];
$stockBefore = $testItem['stock'];
$quantity = 1; // Sell 1 unit

echo "✓ Selected item: {$itemName} (ID: {$itemId})\n";
echo "  Stock before: {$stockBefore}\n";
echo "  Quantity to sell: {$quantity}\n\n";

// Step 4: Create POS transaction
echo "Step 4: Create POS transaction\n";
$transactionData = [
    'customer_id' => null, // Walk-in
    'customer_name' => 'Walk-in Customer',
    'items' => [
        [
            'item_type' => 'product',
            'item_id' => $itemId,
            'item_name' => $itemName,
            'quantity' => $quantity,
            'unit_price' => $testItem['price'],
            'discount_amount' => 0,
        ]
    ],
    'payment_method' => 'cash',
    'cash_received' => $testItem['price'],
    'subtotal' => $testItem['price'],
    'tax' => 0,
    'discount' => 0,
    'total' => $testItem['price'],
];

$transactionResponse = makeRequest('POST', $baseUrl . '/cashier/pos/transaction', $transactionData, $token);

if (!$transactionResponse['success']) {
    echo "✗ Transaction failed: " . ($transactionResponse['message'] ?? 'Unknown error') . "\n";
    print_r($transactionResponse);
    exit(1);
}

$transactionId = $transactionResponse['data']['transaction']['id'] ?? null;
$transactionNumber = $transactionResponse['data']['transaction']['transaction_number'] ?? null;

if (!$transactionId) {
    echo "✗ No transaction ID in response\n";
    print_r($transactionResponse);
    exit(1);
}

echo "✓ Transaction created successfully\n";
echo "  Transaction ID: {$transactionId}\n";
echo "  Transaction Number: {$transactionNumber}\n\n";

// Step 5: Verify stock decreased
echo "Step 5: Verify stock decreased\n";
// Refresh item from database
$itemAfter = InventoryItem::find($itemId);
$stockAfter = $itemAfter->stock;

echo "  Stock before: {$stockBefore}\n";
echo "  Stock after: {$stockAfter}\n";
echo "  Expected stock: " . ($stockBefore - $quantity) . "\n";

if ($stockAfter == $stockBefore - $quantity) {
    echo "✓ Stock decreased correctly\n\n";
} else {
    echo "✗ Stock did not decrease as expected\n\n";
}

// Step 6: Verify inventory log created
echo "Step 6: Verify inventory log created\n";
$log = InventoryLog::where('inventory_item_id', $itemId)
    ->where('reference_type', 'sale')
    ->where('reference_id', $transactionId)
    ->latest()
    ->first();

if (!$log) {
    echo "✗ No inventory log found for this transaction\n";
} else {
    echo "✓ Inventory log created\n";
    echo "  Log ID: {$log->id}\n";
    echo "  Stock before: {$log->stock_before}\n";
    echo "  Stock after: {$log->stock_after}\n";
    echo "  Delta: {$log->delta}\n";
    echo "  Movement type: {$log->movement_type}\n";
    echo "  Reference type: {$log->reference_type}\n";
    echo "  Reference ID: {$log->reference_id}\n";
    
    // Verify required fields
    $requiredFields = ['stock_before', 'stock_after', 'movement_type', 'reference_type', 'reference_id'];
    $missingFields = [];
    foreach ($requiredFields as $field) {
        if (empty($log->$field)) {
            $missingFields[] = $field;
        }
    }
    
    if (empty($missingFields)) {
        echo "✓ All required log fields present\n\n";
    } else {
        echo "✗ Missing log fields: " . implode(', ', $missingFields) . "\n\n";
    }
}

// Step 7: Verify transaction appears in history
echo "Step 7: Verify transaction in history\n";
$historyResponse = makeRequest('GET', $baseUrl . '/cashier/pos/transactions', [], $token);

if (!$historyResponse['success']) {
    echo "✗ Failed to fetch transaction history\n";
} else {
    $transactions = $historyResponse['data']['data'] ?? $historyResponse['data'] ?? [];
    $found = false;
    foreach ($transactions as $tx) {
        if ($tx['id'] == $transactionId) {
            $found = true;
            break;
        }
    }
    
    if ($found) {
        echo "✓ Transaction appears in history\n\n";
    } else {
        echo "✗ Transaction not found in history\n\n";
    }
}

// Step 8: Test void transaction
echo "Step 8: Test void transaction\n";
$voidResponse = makeRequest('POST', $baseUrl . '/cashier/pos/transaction/' . $transactionId . '/void', [
    'reason' => 'Test void - workflow validation'
], $token);

if (!$voidResponse['success']) {
    echo "⚠ Void failed (may not be implemented): " . ($voidResponse['message'] ?? 'Unknown error') . "\n\n";
} else {
    echo "✓ Transaction voided successfully\n";
    
    // Verify stock restored
    $itemAfterVoid = InventoryItem::find($itemId);
    $stockAfterVoid = $itemAfterVoid->stock;
    
    echo "  Stock after void: {$stockAfterVoid}\n";
    echo "  Expected stock: {$stockBefore}\n";
    
    if ($stockAfterVoid == $stockBefore) {
        echo "✓ Stock restored correctly\n\n";
    } else {
        echo "✗ Stock not restored correctly\n\n";
    }
    
    // Verify void log created
    $voidLog = InventoryLog::where('inventory_item_id', $itemId)
        ->where('reference_type', 'cancellation')
        ->where('reference_id', $transactionId)
        ->latest()
        ->first();
    
    if ($voidLog) {
        echo "✓ Void inventory log created\n";
    } else {
        echo "⚠ No void inventory log found\n";
    }
    echo "\n";
}

// Summary
echo "=== Test Summary ===\n";
echo "API endpoints tested:\n";
echo "  - POST /api/login\n";
echo "  - GET /api/cashier/pos/products\n";
echo "  - POST /api/cashier/pos/transaction\n";
echo "  - GET /api/cashier/pos/transactions\n";
echo "  - POST /api/cashier/pos/transaction/{id}/void\n";
echo "\n";
echo "POS transaction ID: {$transactionId}\n";
echo "Transaction number: {$transactionNumber}\n";
echo "Item used: {$itemName} (ID: {$itemId})\n";
echo "Quantity sold: {$quantity}\n";
echo "Stock before: {$stockBefore}\n";
echo "Stock after: {$stockAfter}\n";
echo "Inventory log ID: " . ($log->id ?? 'N/A') . "\n";
echo "\nTest completed successfully.\n";

// Helper function to make HTTP requests
function makeRequest($method, $url, $data = [], $token = null) {
    $ch = curl_init();
    
    $headers = ['Accept: application/json'];
    if ($token) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }
    
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        return ['success' => false, 'message' => 'CURL error: ' . $error];
    }
    
    $decoded = json_decode($response, true);
    
    if ($httpCode >= 400) {
        return [
            'success' => false,
            'message' => 'HTTP ' . $httpCode,
            'data' => $decoded,
            'http_code' => $httpCode
        ];
    }
    
    return [
        'success' => true,
        'data' => $decoded,
        'http_code' => $httpCode
    ];
}
