<?php

require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$output = $argv[1] ?? dirname(__DIR__) . '/browser-evidence/route-inventory/' . date('Ymd-His') . '/routes.json';
if (file_exists($output)) {
    throw new RuntimeException('Refusing to overwrite existing route evidence: ' . $output);
}

$all = [];
$noAuth = [];
$noRole = [];
$noThrottle = [];

foreach (Illuminate\Support\Facades\Route::getRoutes() as $route) {
    if (!str_starts_with($route->uri(), 'api/')) {
        continue;
    }

    $middleware = $app['router']->gatherRouteMiddleware($route);
    $hasAuth = false;
    $hasRole = false;
    $hasThrottle = false;

    foreach ($middleware as $name) {
        $hasAuth = $hasAuth || $name === App\Http\Middleware\ApiTokenAuth::class
            || str_starts_with($name, Illuminate\Auth\Middleware\Authenticate::class . ':');
        $hasRole = $hasRole || str_starts_with($name, App\Http\Middleware\EnsureRole::class . ':');
        $hasThrottle = $hasThrottle || str_starts_with($name, Illuminate\Routing\Middleware\ThrottleRequests::class . ':');
    }

    $row = [
        'method' => implode('|', $route->methods()),
        'uri' => $route->uri(),
        'middleware' => $middleware,
        'controller' => $route->getActionName(),
    ];
    $all[] = $row;
    if (!$hasAuth) {
        $noAuth[] = $row;
    }
    if ($hasAuth && !$hasRole) {
        $noRole[] = $row;
    }
    if (!$hasThrottle) {
        $noThrottle[] = $row;
    }
}

$report = [
    'generated_at' => now()->toIso8601String(),
    'scope' => 'Effective API route definitions; middleware presence does not prove resource authorization.',
    'total' => count($all),
    'no_auth' => $noAuth,
    'auth_no_role' => $noRole,
    'no_throttle' => $noThrottle,
    'all' => $all,
];

if (!is_dir(dirname($output)) && !mkdir(dirname($output), 0777, true) && !is_dir(dirname($output))) {
    throw new RuntimeException('Cannot create route evidence directory.');
}
if (file_put_contents($output, json_encode($report, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR)) === false) {
    throw new RuntimeException('Cannot write route evidence.');
}

echo json_encode([
    'total' => count($all),
    'no_auth' => count($noAuth),
    'auth_no_role' => count($noRole),
    'no_throttle' => count($noThrottle),
    'evidence' => $output,
], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
