<?php
// E2E helper: plant a known (hashed) token row for a test account so the
// verify/reset *completion* endpoints can be exercised. Issuance itself is
// proven by the email_deliveries outbox intent + provider acceptance.
// Usage: php plant-token.php <table> <email> <raw-token>
require __DIR__ . '/../../backend/vendor/autoload.php';
$app = require __DIR__ . '/../../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
[$table, $email, $token] = [$argv[1], $argv[2], $argv[3]];
Illuminate\Support\Facades\DB::table($table)->where('email', $email)->delete();
Illuminate\Support\Facades\DB::table($table)->insert([
    'email' => $email,
    'token' => Illuminate\Support\Facades\Hash::make($token),
    'created_at' => now(),
]);
echo "planted\n";
