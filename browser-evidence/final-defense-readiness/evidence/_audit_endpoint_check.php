<?php
$routes = json_decode(file_get_contents(__DIR__.'/routes_audit_fresh.json'), true);
$be = [];
foreach ($routes as $r) {
    $u = $r['uri'];
    if (strpos($u, 'api/') === 0) $u = substr($u, 4);
    $u = '/' . trim($u, '/');
    if ($u === '/') continue;
    $u = preg_replace('#\{[^}]+\}#', '{}', $u);
    $be[$u][] = $r;
}
$fe = file(__DIR__.'/../fe_api_endpoints.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$missing = []; $checked = 0;
foreach ($fe as $p) {
    $p = trim($p);
    if (!preg_match('#^/#', $p)) continue;
    if (strpos($p, 'http') === 0) continue;
    if (strpos($p, '/api/') === 0) $p = substr($p, 4);
    $p = preg_replace('#\$\{[^}]+\}#', '{}', $p);
    $p = preg_replace('#\{[^}]+\}#', '{}', $p);
    $p = explode('?', $p)[0];
    if (strlen($p) < 3) continue;
    $checked++;
    if (!isset($be[$p])) $missing[] = $p;
}
echo "FE endpoint literals checked: $checked\n";
echo "Not matching a backend route (".count($missing)."):\n";
foreach ($missing as $m) echo "  $m\n";
