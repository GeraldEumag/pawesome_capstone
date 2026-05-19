<?php

require_once __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "=== FINDING ADMIN AND CUSTOMER USERS ===\n\n";

try {
    // Find admin user
    $admin = DB::table('users')->where('role', 'admin')->first();
    if ($admin) {
        echo "✅ Found Admin User:\n";
        echo "   ID: {$admin->id}\n";
        echo "   Name: {$admin->name}\n";
        echo "   Email: {$admin->email}\n";
        echo "   Role: {$admin->role}\n";
        
        // Get latest token for this admin
        $adminToken = DB::table('personal_access_tokens')
            ->where('tokenable_id', $admin->id)
            ->where('tokenable_type', 'App\\Models\\User')
            ->orderBy('created_at', 'desc')
            ->first();
        
        if ($adminToken) {
            echo "   Token ID: {$adminToken->id}\n";
            echo "   Token Name: {$adminToken->name}\n";
            echo "   Token (plain): {$adminToken->token}\n";
        } else {
            echo "   ⚠️  No token found for admin user\n";
        }
    } else {
        echo "❌ No admin user found\n";
    }
    
    echo "\n";
    
    // Find customer user
    $customer = DB::table('users')->where('role', 'customer')->first();
    if ($customer) {
        echo "✅ Found Customer User:\n";
        echo "   ID: {$customer->id}\n";
        echo "   Name: {$customer->name}\n";
        echo "   Email: {$customer->email}\n";
        echo "   Role: {$customer->role}\n";
        
        // Get latest token for this customer
        $customerToken = DB::table('personal_access_tokens')
            ->where('tokenable_id', $customer->id)
            ->where('tokenable_type', 'App\\Models\\User')
            ->orderBy('created_at', 'desc')
            ->first();
        
        if ($customerToken) {
            echo "   Token ID: {$customerToken->id}\n";
            echo "   Token Name: {$customerToken->name}\n";
            echo "   Token (plain): {$customerToken->token}\n";
        } else {
            echo "   ⚠️  No token found for customer user\n";
        }
    } else {
        echo "❌ No customer user found\n";
    }
    
} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . "\n";
    echo "Line: " . $e->getLine() . "\n";
}
