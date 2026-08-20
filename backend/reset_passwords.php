<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;

// Set known passwords for manager and cashier
$manager = User::where('email', 'manager@example.com')->first();
$manager->password = bcrypt('password123');
$manager->save();
echo "Manager password set to 'password123'" . PHP_EOL;

$cashier = User::where('email', 'cashier@example.com')->first();
$cashier->password = bcrypt('password123');
$cashier->save();
echo "Cashier password set to 'password123'" . PHP_EOL;

// Verify
echo PHP_EOL . "Verification:" . PHP_EOL;
echo "Manager login: " . (password_verify('password123', $manager->password) ? 'OK' : 'FAIL') . PHP_EOL;
echo "Cashier login: " . (password_verify('password123', $cashier->password) ? 'OK' : 'FAIL') . PHP_EOL;
