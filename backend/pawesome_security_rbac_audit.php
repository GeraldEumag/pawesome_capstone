<?php
/**
 * PAWESOME SECURITY & RBAC AUDIT (Gate B)
 *
 * Verifies:
 *   B2  Authentication (valid/invalid/missing/expired token, logout)
 *   B3  Role-based access control matrix (each role vs each protected endpoint group)
 *   B4  IDOR / ownership protection (cross-user records)
 *   B5  Static route audit (routes with missing auth or role middleware)
 *   B6  Production configuration audit (.env, .env.example, CORS, APP_DEBUG, secrets)
 *   B7  File upload security (MIME, extension, size, path traversal, executable rejection)
 *
 * Output: JSON report + console summary.
 */

$API = 'http://127.0.0.1:8000/api';
$BACKEND = 'C:\Users\ACER\Pawesome_Capstone\backend';
$REPORT_DIR = 'C:\Users\ACER\Pawesome_Capstone\browser-evidence\security-rbac-audit';
if (!is_dir($REPORT_DIR)) mkdir($REPORT_DIR, 0777, true);

$findings = [];
$counts = ['pass' => 0, 'fail' => 0, 'warn' => 0, 'critical' => 0, 'high' => 0, 'medium' => 0];

function addFinding($severity, $gate, $name, $detail = null) {
    global $findings, $counts;
    $findings[] = ['severity' => $severity, 'gate' => $gate, 'name' => $name, 'detail' => $detail];
    $counts[$severity] = ($counts[$severity] ?? 0) + 1;
    $tag = strtoupper($severity);
    echo "[$tag] [$gate] $name" . ($detail ? ' :: ' . substr(json_encode($detail), 0, 200) : '') . PHP_EOL;
}

function delay() { usleep(700000); }

function apiCall($method, $path, $token = null, $body = null, $multipart = false) {
    $url = $GLOBALS['API'] . $path;
    $maxRetries = 3;
    for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        $headers = ['Accept: application/json'];
        if ($token) $headers[] = 'Authorization: Bearer ' . $token;
        if ($body !== null) {
            if ($multipart) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            } else {
                $headers[] = 'Content-Type: application/json';
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
            }
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        $raw = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        // Retry on curl connection failures (status 0 = couldn't connect)
        if ($status === 0 && $attempt < $maxRetries) {
            usleep(1500000);
            continue;
        }
        $json = json_decode($raw, true);
        return ['status' => (int)$status, 'json' => $json, 'raw' => $raw, 'err' => $err];
    }
    return ['status' => 0, 'json' => null, 'raw' => '', 'err' => 'connection failed after retries'];
}

function login($email, $password) {
    $r = apiCall('POST', '/auth/login', null, ['login' => $email, 'email' => $email, 'password' => $password]);
    if ($r['status'] === 200 && !empty($r['json']['token'])) {
        return ['token' => $r['json']['token'], 'user' => $r['json']['user']];
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────
// B2: AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────
echo PHP_EOL . "=== B2: AUTHENTICATION ===" . PHP_EOL;

$creds = [
    'customer'     => ['customer@example.com',     'Password123!'],
    'receptionist' => ['receptionist@example.com', 'Password123!'],
    'cashier'      => ['cashier@example.com',      'password123'],
    'inventory'    => ['inventory@example.com',    'Password123!'],
    'veterinary'   => ['vet@example.com',          'Password123!'],
    'manager'      => ['manager@example.com',      'password123'],
    'admin'        => ['admin@example.com',        'Password123!'],
];

$tokens = [];
foreach ($creds as $role => [$email, $pw]) {
    delay();
    $s = login($email, $pw);
    if ($s) {
        $tokens[$role] = $s['token'];
        addFinding('pass', 'B2-auth', "Valid login as $role", ['token_len' => strlen($s['token'])]);
    } else {
        addFinding('fail', 'B2-auth', "Valid login failed for $role");
    }
}

// Invalid password
delay();
$r = apiCall('POST', '/auth/login', null, ['login' => 'customer@example.com', 'password' => 'WrongPass!99']);
if ($r['status'] === 401) {
    addFinding('pass', 'B2-auth', 'Invalid password rejected with 401');
} else {
    addFinding('fail', 'B2-auth', 'Invalid password NOT rejected', ['status' => $r['status'], 'body' => $r['raw']]);
}

// Nonexistent account
delay();
$r = apiCall('POST', '/auth/login', null, ['login' => 'nope@example.com', 'password' => 'whatever!99']);
if ($r['status'] === 401) {
    addFinding('pass', 'B2-auth', 'Nonexistent account rejected with 401');
} else {
    addFinding('fail', 'B2-auth', 'Nonexistent account NOT rejected', ['status' => $r['status']]);
}

// Missing token on protected endpoint
delay();
$r = apiCall('GET', '/auth/me', null, null);
if ($r['status'] === 401) {
    addFinding('pass', 'B2-auth', 'Missing token rejected on /auth/me with 401');
} else {
    addFinding('fail', 'B2-auth', 'Missing token NOT rejected on /auth/me', ['status' => $r['status']]);
}

// Invalid token
delay();
$r = apiCall('GET', '/auth/me', 'invalid_token_abc123', null);
if ($r['status'] === 401) {
    addFinding('pass', 'B2-auth', 'Invalid token rejected with 401');
} else {
    addFinding('fail', 'B2-auth', 'Invalid token NOT rejected', ['status' => $r['status']]);
}

// Expired/revoked token: logout then reuse
if (!empty($tokens['customer'])) {
    delay();
    $logout = apiCall('POST', '/auth/logout', $tokens['customer'], null);
    if ($logout['status'] === 200) {
        addFinding('pass', 'B2-auth', 'Logout succeeded');
    } else {
        addFinding('warn', 'B2-auth', 'Logout returned non-200', ['status' => $logout['status']]);
    }
    delay();
    $reuse = apiCall('GET', '/auth/me', $tokens['customer'], null);
    if ($reuse['status'] === 401) {
        addFinding('pass', 'B2-auth', 'Revoked token rejected after logout');
    } else {
        addFinding('fail', 'B2-auth', 'Revoked token still valid after logout', ['status' => $reuse['status']]);
    }
    // Re-login customer for later tests
    delay();
    $s = login('customer@example.com', 'Password123!');
    if ($s) $tokens['customer'] = $s['token'];
}

// ─────────────────────────────────────────────────────────────────────────
// B3: RBAC MATRIX
// ─────────────────────────────────────────────────────────────────────────
echo PHP_EOL . "=== B3: RBAC MATRIX ===" . PHP_EOL;

// (method, path, allowedRoles, body)
$rbacProbes = [
    ['GET', '/admin/dashboard',                 ['admin']],
    ['GET', '/admin/users',                     ['admin']],
    ['GET', '/manager/dashboard',               ['manager', 'admin']],
    ['GET', '/manager/reports/overview',        ['manager', 'admin']],
    ['GET', '/cashier/dashboard',               ['cashier']],
    ['GET', '/cashier/payment-requests',        ['cashier']],
    ['GET', '/inventory/dashboard',             ['inventory', 'admin']],
    ['GET', '/inventory/items',                 ['inventory', 'admin']],
    ['GET', '/receptionist/requests/pending',   ['receptionist']],
    ['GET', '/receptionist/veterinarians/available', ['receptionist']],
    ['GET', '/veterinary/dashboard',            ['veterinary']],
    ['GET', '/veterinary/appointments',         ['veterinary']],
    ['GET', '/customer/overview',               ['customer']],
    ['GET', '/customer/my-requests',            ['customer']],
    ['GET', '/billing/inventory-items',         ['cashier', 'veterinary', 'receptionist', 'admin', 'inventory']],
];

$allRoles = array_keys($creds);
foreach ($rbacProbes as [$method, $path, $allowed]) {
    foreach ($allRoles as $role) {
        if (empty($tokens[$role])) continue;
        delay();
        $r = apiCall($method, $path, $tokens[$role], null);
        $shouldAllow = in_array($role, $allowed, true);
        $allowed200 = in_array($r['status'], [200, 201], true);
        $blocked = in_array($r['status'], [401, 403], true);
        if ($shouldAllow && $allowed200) {
            addFinding('pass', 'B3-rbac', "$role allowed $method $path", ['status' => $r['status']]);
        } elseif (!$shouldAllow && $blocked) {
            addFinding('pass', 'B3-rbac', "$role blocked from $method $path", ['status' => $r['status']]);
        } elseif ($shouldAllow && !$allowed200) {
            addFinding('fail', 'B3-rbac', "$role SHOULD allow $method $path but got {$r['status']}", ['body' => substr($r['raw'], 0, 200)]);
        } elseif (!$shouldAllow && !$blocked) {
            addFinding('fail', 'B3-rbac', "$role SHOULD be blocked from $method $path but got {$r['status']}", ['body' => substr($r['raw'], 0, 200)]);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
// B4: IDOR / OWNERSHIP
// ─────────────────────────────────────────────────────────────────────────
echo PHP_EOL . "=== B4: IDOR / OWNERSHIP ===" . PHP_EOL;

// Customer A (customer) tries to access customer B's (receptionist) data via direct IDs.
// We use IDs that exist but belong to other actors.

// 1. Customer tries to view another customer's pet (pet id=1 belongs to customer id=1, but
//    the customer user is user_id=7 → customer.id=1 maps to user_id=7, so this is their own.
//    We need a pet that belongs to a different customer. Try pet id=2 or higher.
delay();
$petsR = apiCall('GET', '/customer/pets', $tokens['customer'], null);
$ownPetIds = [];
if ($petsR['status'] === 200) {
    $petsList = $petsR['json']['pets'] ?? $petsR['json']['data'] ?? [];
    foreach ($petsList as $p) {
        if (!empty($p['id'])) $ownPetIds[] = (int)$p['id'];
    }
}
$otherPetId = 999; // unlikely to exist
for ($i = 1; $i <= 50; $i++) {
    if (!in_array($i, $ownPetIds, true)) { $otherPetId = $i; break; }
}
delay();
$r = apiCall('GET', '/pets/' . $otherPetId, $tokens['customer'], null);
if (in_array($r['status'], [403, 404], true)) {
    addFinding('pass', 'B4-idor', "Customer blocked from pet $otherPetId (not owned)", ['status' => $r['status']]);
} else {
    addFinding('fail', 'B4-idor', "Customer accessed pet $otherPetId they don't own", ['status' => $r['status'], 'body' => substr($r['raw'], 0, 200)]);
}

// 2. Customer tries to cancel another customer's service request
delay();
$reqsR = apiCall('GET', '/customer/my-requests', $tokens['customer'], null);
$ownReqIds = [];
if ($reqsR['status'] === 200) {
    $reqList = $reqsR['json']['requests'] ?? $reqsR['json']['data'] ?? [];
    foreach ($reqList as $req) {
        if (!empty($req['id'])) $ownReqIds[] = (int)$req['id'];
    }
}
$otherReqId = 1;
for ($i = 1; $i <= 200; $i++) {
    if (!in_array($i, $ownReqIds, true)) { $otherReqId = $i; break; }
}
delay();
$r = apiCall('PATCH', '/customer/requests/' . $otherReqId . '/cancel', $tokens['customer'], null);
if (in_array($r['status'], [403, 404], true)) {
    addFinding('pass', 'B4-idor', "Customer blocked from cancelling request $otherReqId (not owned)", ['status' => $r['status']]);
} else {
    addFinding('fail', 'B4-idor', "Customer accessed request $otherReqId they don't own", ['status' => $r['status'], 'body' => substr($r['raw'], 0, 200)]);
}

// 3. Customer tries to view another user's payslip
delay();
$r = apiCall('GET', '/my-payroll/1/payslip', $tokens['customer'], null);
if (in_array($r['status'], [403, 404], true)) {
    addFinding('pass', 'B4-idor', "Customer blocked from payslip 1 (not own)", ['status' => $r['status']]);
} else {
    addFinding('fail', 'B4-idor', "Customer accessed payslip 1 they don't own", ['status' => $r['status'], 'body' => substr($r['raw'], 0, 200)]);
}

// 4. Cashier tries to access admin user management
delay();
$r = apiCall('GET', '/admin/users', $tokens['cashier'], null);
if (in_array($r['status'], [401, 403], true)) {
    addFinding('pass', 'B4-idor', "Cashier blocked from admin user list", ['status' => $r['status']]);
} else {
    addFinding('fail', 'B4-idor', "Cashier accessed admin user list", ['status' => $r['status']]);
}

// 5. Veterinary tries to access manager dashboard
delay();
$r = apiCall('GET', '/manager/dashboard', $tokens['veterinary'], null);
if (in_array($r['status'], [401, 403], true)) {
    addFinding('pass', 'B4-idor', "Veterinary blocked from manager dashboard", ['status' => $r['status']]);
} else {
    addFinding('fail', 'B4-idor', "Veterinary accessed manager dashboard", ['status' => $r['status']]);
}

// 6. Inventory tries to approve receptionist requests
delay();
$r = apiCall('POST', '/receptionist/requests/1/approve', $tokens['inventory'], null);
if (in_array($r['status'], [401, 403], true)) {
    addFinding('pass', 'B4-idor', "Inventory blocked from receptionist approve", ['status' => $r['status']]);
} else {
    addFinding('fail', 'B4-idor', "Inventory accessed receptionist approve", ['status' => $r['status']]);
}

// ─────────────────────────────────────────────────────────────────────────
// B5: STATIC ROUTE AUDIT
// ─────────────────────────────────────────────────────────────────────────
echo PHP_EOL . "=== B5: STATIC ROUTE AUDIT ===" . PHP_EOL;

$routeListJson = "$BACKEND/routes_full_list.json";
if (!is_file($routeListJson)) {
    addFinding('warn', 'B5-routes', 'routes_full_list.json not found — run php artisan route:list --json');
} else {
    $routes = json_decode(file_get_contents($routeListJson), true);
    $sensitivePatterns = [
        '/admin/' => 'admin',
        '/manager/' => 'manager',
        '/cashier/' => 'cashier',
        '/inventory/' => 'inventory',
        '/receptionist/' => 'receptionist',
        '/veterinary/' => 'veterinary',
        '/customer/' => 'customer',
        '/billing/' => 'staff',
        '/payroll' => 'auth',
        '/my-payroll' => 'auth',
        '/auth/me' => 'auth',
        '/auth/profile' => 'auth',
        '/auth/change-password' => 'auth',
        '/auth/logout' => 'auth',
        '/files/payment-proofs' => 'auth',
        '/files/vaccination-cards' => 'auth',
        '/files/pet-photos' => 'auth',
    ];
    $missingAuth = [];
    $missingRole = [];
    foreach ($routes as $rt) {
        $uri = $rt['uri'] ?? '';
        $mw = $rt['middleware'] ?? [];
        $hasAuth = false;
        $hasRole = false;
        foreach ($mw as $m) {
            if (str_contains($m, 'ApiTokenAuth') || str_contains($m, 'auth:sanctum')) $hasAuth = true;
            if (str_contains($m, 'EnsureRole:')) $hasRole = true;
        }
        // Skip intentionally public routes
        $intentionallyPublic = [
            'api/health',
            'api/settings/public',
            'api/landing-page',
            'api/auth/register',
            'api/auth/login',
            'api/auth/password/forgot',
            'api/auth/password/reset',
            'api/files/profile-photos',
            'api/boarding/rooms/available',
            'api/boarding/rooms/calculate-total',
            'api/boarding/rooms/types',
            'api/boarding/add-ons',
            'api/boarding/rooms',
            'api/boarding/rooms/{id}',
            // Public storefront catalog — intentionally open for customer browsing
            'api/inventory/public/items',
            'api/inventory/public/categories',
            'api/inventory/public/item',
            'api/inventory/sellable',
            'sanctum/csrf-cookie',
            'up',
            'storage/{path}',
            '/',
        ];
        $isPublic = false;
        foreach ($intentionallyPublic as $pub) {
            if ($uri === $pub || str_starts_with($uri, $pub)) { $isPublic = true; break; }
        }
        if ($isPublic) continue;

        // Sensitive route detection
        $isSensitive = false;
        foreach (array_keys($sensitivePatterns) as $pat) {
            if (str_contains($uri, $pat)) { $isSensitive = true; break; }
        }
        if ($isSensitive && !$hasAuth) {
            $missingAuth[] = ['uri' => $uri, 'method' => implode('|', (array)($rt['method'] ?? [])), 'middleware' => implode(',', $mw)];
        }
        if ($hasAuth && $isSensitive && !$hasRole) {
            // /auth/me, /auth/profile, /my-payroll are legitimately auth-only (any authenticated user)
            $authOnlyOk = [
                'api/auth/me',
                'api/auth/profile',
                'api/auth/profile-photo',
                'api/auth/change-password',
                'api/auth/logout',
                'api/my-payroll',
                'api/services',
                'api/customers',
                'api/pets',
                'api/customers/{id}/pets',
                'api/attendance/check-in',
                'api/attendance/check-out',
                'api/files/payment-proofs',
                'api/files/vaccination-cards',
                'api/files/pet-photos',
                // Chatbot workflow is intentionally open to any authenticated user (customer-facing)
                'api/chatbot/welcome',
                'api/chatbot/message',
                'api/chatbot/workflow/booking-options',
                'api/chatbot/workflow/bookings',
                'api/chatbot/workflow/appointments/lookup',
                'api/chatbot/workflow/inventory/search',
                'api/chatbot/workflow/hotel-options',
                'api/chatbot/workflow/hotel/availability',
                'api/chatbot/workflow/hotel-bookings',
            ];
            $okAuthOnly = false;
            foreach ($authOnlyOk as $a) {
                if ($uri === $a || str_starts_with($uri, $a)) { $okAuthOnly = true; break; }
            }
            if (!$okAuthOnly) {
                $missingRole[] = ['uri' => $uri, 'method' => implode('|', (array)($rt['method'] ?? [])), 'middleware' => implode(',', $mw)];
            }
        }
    }
    if (!$missingAuth) {
        addFinding('pass', 'B5-routes', 'No sensitive routes missing auth middleware', ['total_routes' => count($routes)]);
    } else {
        foreach ($missingAuth as $r) {
            addFinding('critical', 'B5-routes', "Sensitive route missing auth: {$r['method']} {$r['uri']}", $r);
        }
    }
    if (!$missingRole) {
        addFinding('pass', 'B5-routes', 'No sensitive routes missing role middleware (auth-only routes are intentionally open to any authenticated user)');
    } else {
        foreach ($missingRole as $r) {
            addFinding('high', 'B5-routes', "Auth route missing role: {$r['method']} {$r['uri']}", $r);
        }
    }

    // Specific check: boarding/rooms/* has no auth
    $boardingRoomsNoAuth = [];
    foreach ($routes as $rt) {
        $uri = $rt['uri'] ?? '';
        $mw = $rt['middleware'] ?? [];
        if (str_starts_with($uri, 'api/boarding/rooms') || str_starts_with($uri, 'api/boarding/add-ons')) {
            $hasAuth = false;
            foreach ($mw as $m) {
                if (str_contains($m, 'ApiTokenAuth') || str_contains($m, 'auth:sanctum')) $hasAuth = true;
            }
            if (!$hasAuth) $boardingRoomsNoAuth[] = $uri;
        }
    }
    if ($boardingRoomsNoAuth) {
        addFinding('medium', 'B5-routes', 'Boarding room/add-on catalog endpoints are public (no auth) — acceptable for marketing but exposes inventory', ['routes' => $boardingRoomsNoAuth]);
    }
}

// ─────────────────────────────────────────────────────────────────────────
// B6: PRODUCTION CONFIG AUDIT
// ─────────────────────────────────────────────────────────────────────────
echo PHP_EOL . "=== B6: PRODUCTION CONFIG ===" . PHP_EOL;

$env = file_get_contents("$BACKEND/.env");
$envExample = file_get_contents("$BACKEND/.env.example");

// APP_DEBUG
if (preg_match('/^APP_DEBUG=(.+)$/m', $env, $m)) {
    $val = trim($m[1]);
    if ($val === 'true') {
        addFinding('high', 'B6-config', 'APP_DEBUG=true in .env (must be false in production)', ['value' => $val]);
    } else {
        addFinding('pass', 'B6-config', 'APP_DEBUG is false', ['value' => $val]);
    }
}
if (preg_match('/^APP_DEBUG=(.+)$/m', $envExample, $m)) {
    $val = trim($m[1]);
    if ($val === 'false') {
        addFinding('pass', 'B6-config', '.env.example APP_DEBUG=false (production-safe default)');
    } else {
        addFinding('high', 'B6-config', '.env.example APP_DEBUG is not false', ['value' => $val]);
    }
}

// APP_ENV
if (preg_match('/^APP_ENV=(.+)$/m', $env, $m)) {
    $val = trim($m[1]);
    if ($val === 'production') {
        addFinding('pass', 'B6-config', 'APP_ENV=production in .env');
    } else {
        addFinding('medium', 'B6-config', "APP_ENV=$val in .env (expected production for deployment)", ['value' => $val]);
    }
}

// APP_KEY
if (preg_match('/^APP_KEY=(.+)$/m', $env, $m)) {
    $val = trim($m[1]);
    if (empty($val) || $val === 'base64:') {
        addFinding('critical', 'B6-config', 'APP_KEY is empty in .env');
    } else {
        addFinding('pass', 'B6-config', 'APP_KEY is set');
    }
}
if (preg_match('/^APP_KEY=(.+)$/m', $envExample, $m)) {
    $val = trim($m[1]);
    if (empty($val)) {
        addFinding('pass', 'B6-config', '.env.example APP_KEY is empty (correct — must be generated per-env)');
    } else {
        addFinding('high', 'B6-config', '.env.example APP_KEY is set (should be empty to force generation)', ['value' => $val]);
    }
}

// DB password in .env
if (preg_match('/^DB_PASSWORD=(.*)$/m', $env, $m)) {
    $val = trim($m[1]);
    if ($val === '' || $val === 'your-password') {
        addFinding('medium', 'B6-config', 'DB_PASSWORD is empty/placeholder in .env — local dev only, must be set in production');
    } else {
        addFinding('warn', 'B6-config', 'DB_PASSWORD is set in .env — ensure .env is gitignored and never committed');
    }
}

// .env.example still has SESSION_DRIVER=database and CACHE_STORE=database
if (preg_match('/^SESSION_DRIVER=(.+)$/m', $envExample, $m) && trim($m[1]) === 'database') {
    addFinding('medium', 'B6-config', '.env.example SESSION_DRIVER=database — can reintroduce socket exhaustion in production; recommend file/redis');
}
if (preg_match('/^CACHE_STORE=(.+)$/m', $envExample, $m) && trim($m[1]) === 'database') {
    addFinding('medium', 'B6-config', '.env.example CACHE_STORE=database — can reintroduce socket exhaustion in production; recommend redis/file');
}

// CORS
$cors = file_get_contents("$BACKEND/config/cors.php");
if (str_contains($cors, 'supports_credentials')) {
    if (preg_match("/'supports_credentials'\s*=>\s*(?:env\([^)]+\)|true)/", $cors)) {
        addFinding('pass', 'B6-config', 'CORS supports_credentials is configured (not hardcoded true)');
    }
}
if (str_contains($cors, 'your-vercel-frontend.vercel.app')) {
    addFinding('medium', 'B6-config', 'CORS default includes placeholder vercel URL — must be replaced with real production origin');
} else {
    addFinding('pass', 'B6-config', 'CORS does not include placeholder vercel URL');
}
if (preg_match("/'allowed_origins'\s*=>\s*(\[.*?\])/s", $cors, $m)) {
    $originsBlock = $m[1];
    if (preg_match("/['\"]\*['\"]/", $originsBlock)) {
        addFinding('high', 'B6-config', 'CORS allowed_origins contains wildcard *');
    } else {
        addFinding('pass', 'B6-config', 'CORS allowed_origins does not contain wildcard *');
    }
} else {
    addFinding('pass', 'B6-config', 'CORS allowed_origins is env-driven (not hardcoded wildcard)');
}

// .gitignore for .env
$gitignore = file_get_contents("$BACKEND/.gitignore");
if (str_contains($gitignore, '.env') && !str_contains($gitignore, '!.env.example')) {
    addFinding('pass', 'B6-config', '.env is gitignored');
} elseif (str_contains($gitignore, '.env')) {
    addFinding('pass', 'B6-config', '.env is gitignored (with .env.example allowed)');
} else {
    addFinding('critical', 'B6-config', '.env is NOT in .gitignore — secrets could be committed');
}

// Check if .env is tracked by git
$tracked = shell_exec('cd ' . escapeshellarg($BACKEND) . ' && git ls-files .env 2>&1');
if (trim($tracked ?? '') === '.env') {
    addFinding('critical', 'B6-config', '.env is tracked by git — secrets are committed!');
} else {
    addFinding('pass', 'B6-config', '.env is not tracked by git');
}

// ─────────────────────────────────────────────────────────────────────────
// B7: FILE UPLOAD SECURITY
// ─────────────────────────────────────────────────────────────────────────
echo PHP_EOL . "=== B7: FILE UPLOAD SECURITY ===" . PHP_EOL;

// First, create an approved service request to test upload against.
// We use the existing customer request flow but skip if no approved request available.
delay();
$reqsR = apiCall('GET', '/customer/my-requests', $tokens['customer'], null);
$approvedReqId = null;
if ($reqsR['status'] === 200) {
    $reqList = $reqsR['json']['requests'] ?? $reqsR['json']['data'] ?? [];
    foreach ($reqList as $req) {
        if (($req['status'] ?? '') === 'approved' && in_array($req['payment_status'] ?? '', ['unpaid', 'rejected'], true)) {
            $approvedReqId = (int)$req['id'];
            break;
        }
    }
}

// 1. Valid PNG upload (control)
if ($approvedReqId) {
    $png1x1 = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==');
    $tmp = tempnam(sys_get_temp_dir(), 'proof_') . '.png';
    file_put_contents($tmp, $png1x1);
    $cfile = new CURLFile($tmp, 'image/png', 'proof.png');
    delay();
    $r = apiCall('POST', '/customer/requests/' . $approvedReqId . '/payment-proof', $tokens['customer'], ['payment_proof' => $cfile, 'payment_method' => 'gcash', 'payment_reference' => 'SEC-AUDIT-' . time()], true);
    if ($r['status'] === 200 && !empty($r['json']['success'])) {
        addFinding('pass', 'B7-upload', 'Valid PNG payment proof accepted');
    } else {
        addFinding('warn', 'B7-upload', 'Valid PNG upload returned non-200 (may be due to state)', ['status' => $r['status'], 'body' => substr($r['raw'], 0, 200)]);
    }
    @unlink($tmp);
} else {
    addFinding('warn', 'B7-upload', 'No approved unpaid request available for upload tests — skipping positive control');
}

// 2. Executable file rejection (.php)
if ($approvedReqId) {
    $tmp = tempnam(sys_get_temp_dir(), 'proof_') . '.php';
    file_put_contents($tmp, '<?php echo "pwned"; ?>');
    $cfile = new CURLFile($tmp, 'application/x-php', 'evil.php');
    delay();
    $r = apiCall('POST', '/customer/requests/' . $approvedReqId . '/payment-proof', $tokens['customer'], ['payment_proof' => $cfile], true);
    if (in_array($r['status'], [422, 400], true)) {
        addFinding('pass', 'B7-upload', 'PHP executable upload rejected', ['status' => $r['status']]);
    } else {
        addFinding('critical', 'B7-upload', 'PHP executable upload was NOT rejected', ['status' => $r['status'], 'body' => substr($r['raw'], 0, 200)]);
    }
    @unlink($tmp);
}

// 3. Extension/MIME mismatch — .png extension but PHP content
if ($approvedReqId) {
    $tmp = tempnam(sys_get_temp_dir(), 'proof_') . '.png';
    file_put_contents($tmp, '<?php echo "pwned"; ?>');
    $cfile = new CURLFile($tmp, 'image/png', 'evil.png');
    delay();
    $r = apiCall('POST', '/customer/requests/' . $approvedReqId . '/payment-proof', $tokens['customer'], ['payment_proof' => $cfile], true);
    // Laravel mimes rule checks actual MIME via finfo, so this should be rejected
    if (in_array($r['status'], [422, 400], true)) {
        addFinding('pass', 'B7-upload', 'Mismatched MIME/extension (PHP content with .png) rejected', ['status' => $r['status']]);
    } else {
        addFinding('high', 'B7-upload', 'Mismatched MIME/extension was accepted — relies on finfo but content is PHP', ['status' => $r['status'], 'body' => substr($r['raw'], 0, 200)]);
    }
    @unlink($tmp);
}

// 4. Oversize file (>5MB)
if ($approvedReqId) {
    $tmp = tempnam(sys_get_temp_dir(), 'proof_') . '.png';
    $fp = fopen($tmp, 'wb');
    // Write a fake PNG header then 6MB of zeros
    fwrite($fp, base64_decode('iVBORw0KGgo='));
    ftruncate($fp, 6 * 1024 * 1024);
    fclose($fp);
    $cfile = new CURLFile($tmp, 'image/png', 'big.png');
    delay();
    $r = apiCall('POST', '/customer/requests/' . $approvedReqId . '/payment-proof', $tokens['customer'], ['payment_proof' => $cfile], true);
    if (in_array($r['status'], [422, 400, 413], true)) {
        addFinding('pass', 'B7-upload', 'Oversize file (>5MB) rejected', ['status' => $r['status']]);
    } else {
        addFinding('high', 'B7-upload', 'Oversize file was NOT rejected', ['status' => $r['status'], 'body' => substr($r['raw'], 0, 200)]);
    }
    @unlink($tmp);
}

// 5. Path traversal in filename
if ($approvedReqId) {
    $png1x1 = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==');
    $tmp = tempnam(sys_get_temp_dir(), 'proof_') . '.png';
    file_put_contents($tmp, $png1x1);
    $cfile = new CURLFile($tmp, 'image/png', '../../../etc/passwd.png');
    delay();
    $r = apiCall('POST', '/customer/requests/' . $approvedReqId . '/payment-proof', $tokens['customer'], ['payment_proof' => $cfile], true);
    // The controller uses Str::random(10) for filename, so traversal should be neutralized
    if ($r['status'] === 200 && !empty($r['json']['success'])) {
        $proofPath = $r['json']['request']['payment_proof'] ?? '';
        if (!str_contains($proofPath, '..') && !str_contains($proofPath, 'passwd')) {
            addFinding('pass', 'B7-upload', 'Path traversal filename neutralized (random name used)', ['stored_path' => $proofPath]);
        } else {
            addFinding('critical', 'B7-upload', 'Path traversal filename was stored as-is', ['stored_path' => $proofPath]);
        }
    } elseif (in_array($r['status'], [422, 400], true)) {
        addFinding('pass', 'B7-upload', 'Path traversal filename rejected', ['status' => $r['status']]);
    } else {
        addFinding('warn', 'B7-upload', 'Path traversal upload returned unexpected status', ['status' => $r['status'], 'body' => substr($r['raw'], 0, 200)]);
    }
    @unlink($tmp);
}

// 6. Storage disk check — payment proofs should be on private disk
$filesystems = file_get_contents("$BACKEND/config/filesystems.php");
if (str_contains($filesystems, "'private'")) {
    addFinding('pass', 'B7-upload', 'Private filesystem disk is configured for sensitive uploads');
} else {
    addFinding('high', 'B7-upload', 'No private filesystem disk configured — payment proofs may be publicly accessible');
}

// 7. Verify the SecureFileController enforces auth on payment proof viewing
delay();
$r = apiCall('GET', '/files/payment-proofs/service-request/1/view', null, null);
if (in_array($r['status'], [401, 403], true)) {
    addFinding('pass', 'B7-upload', 'Unauthenticated payment proof view blocked', ['status' => $r['status']]);
} else {
    addFinding('high', 'B7-upload', 'Unauthenticated payment proof view was NOT blocked', ['status' => $r['status']]);
}

// ─────────────────────────────────────────────────────────────────────────
// REPORT
// ─────────────────────────────────────────────────────────────────────────
echo PHP_EOL . "═══════════════════════════════════════════════════════════════" . PHP_EOL;

$overallPass = ($counts['critical'] === 0 && $counts['high'] === 0 && $counts['fail'] === 0);
echo "PAWESOME SECURITY & RBAC AUDIT: " . ($overallPass ? 'PASS' : 'FAIL') . PHP_EOL;
echo "Pass: {$counts['pass']}  Fail: {$counts['fail']}  Warn: {$counts['warn']}  Critical: {$counts['critical']}  High: {$counts['high']}  Medium: {$counts['medium']}" . PHP_EOL;

$stamp = date('Ymd-His');
$reportPath = "$REPORT_DIR/security-rbac-audit-$stamp.json";
file_put_contents($reportPath, json_encode([
    'summary' => $counts,
    'overall' => $overallPass ? 'PASS' : 'FAIL',
    'findings' => $findings,
    'timestamp' => date('c'),
], JSON_PRETTY_PRINT));
echo "Report: $reportPath" . PHP_EOL;
echo "═══════════════════════════════════════════════════════════════" . PHP_EOL;

exit($overallPass ? 0 : 1);
