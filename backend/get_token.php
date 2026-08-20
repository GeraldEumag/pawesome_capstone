<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;

// Find the manager and check their password
$manager = User::where('email', 'manager@example.com')->first();
echo "Manager found: " . ($manager ? 'yes' : 'no') . PHP_EOL;
if ($manager) {
    echo "ID: {$manager->id}" . PHP_EOL;
    echo "Role: {$manager->role}" . PHP_EOL;
    echo "Password hash starts with: " . substr($manager->password, 0, 4) . PHP_EOL;

    // Try common passwords
    foreach (['password', 'Password123', 'manager123', 'admin123', '12345678'] as $pwd) {
        echo "Testing '{$pwd}': " . (password_verify($pwd, $manager->password) ? 'MATCH' : 'no') . PHP_EOL;
    }

    // Generate a token directly
    $token = $manager->createToken('e2e-test');
    echo PHP_EOL . "Token: " . $token->plainTextToken . PHP_EOL;
}
