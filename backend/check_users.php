<?php

require_once __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "=== CHECKING USERS IN DATABASE ===\n\n";

try {
    $users = DB::table('users')->select('id', 'name', 'email', 'role')->get();
    
    if ($users->isEmpty()) {
        echo "No users found in database.\n";
    } else {
        echo "Found {$users->count()} user(s):\n\n";
        
        foreach ($users as $user) {
            echo "ID: {$user->id}\n";
            echo "Name: {$user->name}\n";
            echo "Email: {$user->email}\n";
            echo "Role: {$user->role}\n";
            echo "---\n";
        }
    }
    
} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

echo "\n=== CHECKING PERSONAL ACCESS TOKENS ===\n\n";

try {
    $tokens = DB::table('personal_access_tokens')->select('id', 'tokenable_id', 'tokenable_type', 'name')->get();
    
    if ($tokens->isEmpty()) {
        echo "No personal access tokens found.\n";
    } else {
        echo "Found {$tokens->count()} token(s):\n\n";
        
        foreach ($tokens as $token) {
            echo "ID: {$token->id}\n";
            echo "Tokenable ID: {$token->tokenable_id}\n";
            echo "Tokenable Type: {$token->tokenable_type}\n";
            echo "Name: {$token->name}\n";
            echo "---\n";
        }
    }
    
} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
