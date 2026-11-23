<?php

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

$readyPath = $argv[1] ?? '';
$gatePath = $argv[2] ?? '';
$token = $argv[3] ?? '';
$idempotencyKey = $argv[4] ?? '';
$payload = base64_decode($argv[5] ?? '', true);

if (!$readyPath || !$gatePath || !$token || !$idempotencyKey || $payload === false) {
    fwrite(STDERR, "Invalid inventory return worker arguments.\n");
    exit(2);
}

file_put_contents($readyPath, 'ready');
$deadline = microtime(true) + 20;
while (!is_file($gatePath) && microtime(true) < $deadline) {
    usleep(10000);
}
if (!is_file($gatePath)) {
    fwrite(STDERR, "Timed out waiting for the parent test barrier.\n");
    exit(3);
}

$backendRoot = dirname(__DIR__, 3);
require $backendRoot . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
$app = require $backendRoot . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'app.php';
$request = Request::create(
    '/api/inventory/returns',
    'POST',
    [],
    [],
    [],
    [
        'HTTP_ACCEPT' => 'application/json',
        'CONTENT_TYPE' => 'application/json',
        'HTTP_AUTHORIZATION' => 'Bearer ' . $token,
        'HTTP_IDEMPOTENCY_KEY' => $idempotencyKey,
    ],
    $payload
);

$kernel = $app->make(Kernel::class);
$response = $kernel->handle($request);
echo json_encode([
    'status' => $response->getStatusCode(),
    'json' => json_decode($response->getContent(), true),
], JSON_THROW_ON_ERROR), PHP_EOL;
$kernel->terminate($request, $response);
