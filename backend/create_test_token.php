<?php

require_once __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "=== CREATING FRESH TEST TOKENS ===\n\n";

try {
    // Get admin user
    $admin = DB::table('users')->where('role', 'admin')->first();
    if ($admin) {
        echo "Creating token for Admin User (ID: {$admin->id})...\n";
        
        // Use the User model to create a token
        $adminUser = \App\Models\User::find($admin->id);
        if ($adminUser) {
            $token = $adminUser->createToken('test-api-token')->plainTextToken;
            echo "✅ Admin Token: {$token}\n";
        }
    }
    
    echo "\n";
    
    // Get customer user
    $customer = DB::table('users')->where('role', 'customer')->first();
    if ($customer) {
        echo "Creating token for Customer User (ID: {$customer->id})...\n";
        
        // Use the User model to create a token
        $customerUser = \App\Models\User::find($customer->id);
        if ($customerUser) {
            $token = $customerUser->createToken('test-api-token')->plainTextToken;
            echo "✅ Customer Token: {$token}\n";
        }
    }
    
} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . "\n";
    echo "Line: " . $e->getLine() . "\n";
}
