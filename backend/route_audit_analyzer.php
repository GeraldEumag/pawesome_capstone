<?php
$j = json_decode(file_get_contents(__DIR__ . '/routes_full_list.json'), true);
echo "Total routes: " . count($j) . PHP_EOL;

$noAuth = [];
$noRole = [];
$all = [];

foreach ($j as $r) {
    $mw = $r['middleware'] ?? [];
    $hasAuth = false;
    foreach ($mw as $m) {
        if (str_contains($m, 'auth.api') || str_contains($m, 'auth:sanctum')) {
            $hasAuth = true;
            break;
        }
    }
    $hasRole = false;
    foreach ($mw as $m) {
        if (str_contains($m, 'role:')) {
            $hasRole = true;
            break;
        }
    }
    $uri = $r['uri'] ?? '';
    $method = implode('|', (array)($r['method'] ?? []));
    $row = ['method' => $method, 'uri' => $uri, 'middleware' => implode(',', $mw), 'controller' => $r['action']['controller'] ?? ($r['action']['uses'] ?? '')];
    $all[] = $row;
    if (!$hasAuth) {
        $noAuth[] = $row;
    }
    if ($hasAuth && !$hasRole) {
        $noRole[] = $row;
    }
}

echo "No-auth routes: " . count($noAuth) . PHP_EOL;
foreach ($noAuth as $r) {
    echo "  " . $r['method'] . " " . $r['uri'] . "  [mw: " . $r['middleware'] . "]" . PHP_EOL;
}

echo PHP_EOL . "Auth but no role middleware: " . count($noRole) . PHP_EOL;
foreach ($noRole as $r) {
    echo "  " . $r['method'] . " " . $r['uri'] . "  [mw: " . $r['middleware'] . "]" . PHP_EOL;
}

file_put_contents(__DIR__ . '/routes_audit_summary.json', json_encode([
    'total' => count($j),
    'no_auth' => $noAuth,
    'auth_no_role' => $noRole,
    'all' => $all,
], JSON_PRETTY_PRINT));
