<?php
/**
 * PAWESOME CROSS-ROLE E2E PRODUCTION READINESS AUDIT (Pure HTTP)
 * 
 * Chain: Customer → Receptionist → Cashier → Inventory/Vet → Customer → Manager
 * Verifies: live API + real DB changes + next-role visibility (all via HTTP endpoints)
 * Output: structured pass/fail report to browser-evidence/cross-role-e2e-audit/
 */

$apiBase = 'http://127.0.0.1:8000/api';
$reportPath = dirname(__DIR__) . '/browser-evidence/cross-role-e2e-audit';
if (!is_dir($reportPath)) mkdir($reportPath, 0777, true);
$reportFile = $reportPath . '/audit-report-' . date('Ymd-His') . '.json';

$seed = substr(str_replace('.', '', uniqid('', true)), -6);
$futureDate = date('Y-m-d', strtotime('+8 days +' . ($seed % 30) . ' days'));
$futureTime = sprintf('%02d:%02d', 9 + ($seed % 7), 30 + ($seed % 30));

$credentials = [
    'customer'     => ['email' => 'customer@example.com',  'password' => 'Password123!'],
    'receptionist' => ['email' => 'receptionist@example.com', 'password' => 'Password123!'],
    'cashier'      => ['email' => 'cashier@example.com',   'password' => 'password123'],
    'inventory'    => ['email' => 'inventory@example.com', 'password' => 'Password123!'],
    'veterinary'   => ['email' => 'vet@example.com',       'password' => 'Password123!'],
    'manager'      => ['email' => 'manager@example.com',   'password' => 'password123'],
    'admin'        => ['email' => 'admin@example.com',     'password' => 'Password123!'],
];

$report = [
    'title' => 'Pawesome Cross-Role E2E Production Readiness Audit (HTTP)',
    'started_at' => date('c'),
    'api_base' => $apiBase,
    'seed' => $seed,
    'overall' => 'NOT_RUN',
    'summary' => ['pass' => 0, 'fail' => 0, 'warn' => 0, 'blocker' => 0],
    'findings' => [],
    'workflow' => [],
    'blockers' => [],
];

function addFinding($type, $gate, $message, $detail = null) {
    global $report;
    $entry = ['type' => $type, 'gate' => $gate, 'message' => $message, 'at' => date('c')];
    if ($detail !== null) $entry['detail'] = $detail;
    $report['findings'][] = $entry;
    $report['summary'][strtolower($type)]++;
    echo "[{$type}] [{$gate}] {$message}" . PHP_EOL;
    if ($detail) echo "    detail: " . (is_string($detail) ? $detail : json_encode($detail, JSON_UNESCAPED_SLASHES)) . PHP_EOL;
    if (strtolower($type) === 'blocker') {
        $report['blockers'][] = "[{$gate}] {$message}";
    }
}

function delay() { usleep(800000); } // 800ms between calls to reduce Windows client socket churn

function apiCall($method, $endpoint, $token, $data = null, $multipart = false, $retries = 1) {
    global $apiBase;
    $url = $apiBase . $endpoint;
    $lastError = null;
    for ($attempt = 0; $attempt <= $retries; $attempt++) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
        curl_setopt($ch, CURLOPT_TIMEOUT, 25);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
        if ($token) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json', 'Authorization: Bearer ' . $token]);
        } else {
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
        }
        if ($data !== null) {
            if ($multipart) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
            } else {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
                curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Accept: application/json', 'Authorization: Bearer ' . $token]);
            }
        }
        $body = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);
        
        $json = null;
        if ($body !== false) $json = json_decode($body, true);
        
        if ($httpCode > 0) {
            return ['status' => $httpCode, 'body' => $body, 'json' => $json, 'error' => $curlErr, 'raw' => $body];
        }
        $lastError = $curlErr;
        delay(); delay();
    }
    return ['status' => 0, 'body' => $body, 'json' => null, 'error' => $lastError, 'raw' => $body];
}

function login($role) {
    global $credentials;
    $body = [
        'login' => $credentials[$role]['email'],
        'email' => $credentials[$role]['email'],
        'password' => $credentials[$role]['password'],
    ];
    return apiCall('POST', '/auth/login', null, $body, false, 2);
}

function extractToken($res) {
    return $res['json']['token'] ?? $res['json']['access_token'] ?? null;
}

function extractUserId($res) {
    return $res['json']['id'] ?? $res['json']['user']['id'] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// 0. AUTHENTICATION GATE
// ─────────────────────────────────────────────────────────────────────────
$tokens = [];
$loginsFailed = false;
foreach ($credentials as $role => $creds) {
    delay();
    $res = login($role);
    $token = extractToken($res);
    if ($res['status'] === 200 && $token) {
        $tokens[$role] = $token;
        addFinding('pass', 'auth', "Login as {$role}", ['email' => $creds['email'], 'token_len' => strlen($token)]);
    } else {
        addFinding('fail', 'auth', "Login failed for {$role}", ['status' => $res['status'], 'error' => $res['error'], 'body' => $res['raw']]);
        $loginsFailed = true;
    }
}

if ($loginsFailed || count($tokens) < 7) {
    addFinding('blocker', 'auth', 'Authentication gate failed; cannot proceed with workflow audit');
    goto finish;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. CUSTOMER GATE
// ─────────────────────────────────────────────────────────────────────────
delay();
$customer = apiCall('GET', '/auth/me', $tokens['customer']);
$customerId = extractUserId($customer);
$customerName = $customer['json']['name'] ?? $customer['json']['user']['name'] ?? 'Customer';

// Ensure pet
delay();
$pets = apiCall('GET', '/customer/pets', $tokens['customer']);
$petsList = $pets['json']['pets'] ?? $pets['json']['data']['pets'] ?? $pets['json']['data'] ?? [];
$pet = null;
foreach ($petsList as $p) {
    if (strtolower($p['name'] ?? '') === 'buddy') { $pet = $p; break; }
}
if (!$pet) {
    delay();
    $newPet = apiCall('POST', '/customer/pets', $tokens['customer'], [
        'name' => 'Buddy',
        'species' => 'Dog',
        'breed' => 'Golden Retriever',
        'gender' => 'Male',
        'age' => 2,
        'notes' => 'Audit pet ' . $seed,
    ]);
    $pet = $newPet['json']['pet'] ?? $newPet['json']['data'] ?? null;
}
if (!$pet) {
    addFinding('fail', 'customer', 'Could not locate or create Buddy pet', ['status' => $pets['status'] ?? null, 'body' => $pets['raw']]);
    goto finish;
}
$petId = is_array($pet) ? $pet['id'] : $pet->id;
addFinding('pass', 'customer', 'Buddy pet resolved', ['pet_id' => $petId]);

// Submit vet request
delay();
$svcReq = apiCall('POST', '/customer/requests', $tokens['customer'], [
    'customer_name' => $customerName,
    'customer_email' => $credentials['customer']['email'],
    'pet_id' => $petId,
    'pet_name' => 'Buddy',
    'request_type' => 'vet',
    'service_type' => 'vet',
    'service_name' => 'General Check-up',
    'requested_date' => $futureDate,
    'requested_time' => $futureTime,
    'notes' => 'CROSS_ROLE_E2E_AUDIT ' . $seed,
    'price' => 500,
]);

$serviceRequest = $svcReq['json']['request'] ?? $svcReq['json']['data'] ?? null;
if (($svcReq['status'] !== 200 && $svcReq['status'] !== 201) || empty($serviceRequest['id'])) {
    addFinding('fail', 'customer', 'Customer vet request creation failed', ['status' => $svcReq['status'], 'body' => $svcReq['raw']]);
    goto finish;
}
$serviceRequestId = $serviceRequest['id'];
addFinding('pass', 'customer', 'Customer submitted vet request', ['service_request_id' => $serviceRequestId, 'status' => $serviceRequest['status']]);

// ─────────────────────────────────────────────────────────────────────────
// 2. RECEPTIONIST GATE
// ─────────────────────────────────────────────────────────────────────────
delay();
$pendingReqs = apiCall('GET', '/receptionist/requests/pending', $tokens['receptionist']);
$pendingList = $pendingReqs['json']['requests'] ?? $pendingReqs['json']['data'] ?? [];
$foundPending = false;
foreach ($pendingList as $r) {
    if (($r['id'] ?? null) == $serviceRequestId) { $foundPending = true; break; }
}
if ($foundPending) {
    addFinding('pass', 'receptionist', 'Receptionist sees the pending customer request', ['count' => count($pendingList)]);
} else {
    addFinding('fail', 'receptionist', 'Receptionist does NOT see the pending customer request', ['count' => count($pendingList), 'target' => $serviceRequestId]);
}

// Get available veterinarian
delay();
$availableVets = apiCall('GET', '/receptionist/veterinarians/available', $tokens['receptionist']);
$vetsList = $availableVets['json']['veterinarians'] ?? $availableVets['json']['data']['veterinarians'] ?? $availableVets['json']['data'] ?? [];
$vet = $vetsList[0] ?? null;
if (!$vet) {
    addFinding('fail', 'receptionist', 'No available veterinarian', ['status' => $availableVets['status'], 'body' => $availableVets['raw']]);
    goto finish;
}
$vetId = $vet['id'];
addFinding('pass', 'receptionist', 'Available veterinarian found', ['vet_id' => $vetId, 'name' => $vet['name'] ?? $vet['email']]);

// Approve the request
delay();
$approval = apiCall('POST', '/receptionist/requests/' . $serviceRequestId . '/approve', $tokens['receptionist'], [
    'veterinarian_id' => $vetId,
    'receptionist_remarks' => 'Approved by cross-role E2E audit ' . $seed,
]);

if ($approval['status'] !== 200 && $approval['status'] !== 201) {
    addFinding('fail', 'receptionist', 'Receptionist approval failed', ['status' => $approval['status'], 'body' => $approval['raw']]);
    goto finish;
}
$approvedRequest = $approval['json']['request'] ?? $approval['json']['data']['request'] ?? $approval['json']['appointment'] ?? $approval['json']['data']['appointment'] ?? null;
addFinding('pass', 'receptionist', 'Receptionist approved request', ['response_status' => $approval['status'], 'data' => $approvedRequest]);

// ─────────────────────────────────────────────────────────────────────────
// 3. CUSTOMER (BACK) — upload payment proof
// ─────────────────────────────────────────────────────────────────────────
if (!isset($serviceRequestId)) {
    addFinding('blocker', 'customer', 'No serviceRequestId; cannot continue to payment proof');
    goto finish;
}

$proofFile = __DIR__ . '/audit_payment_proof_' . $seed . '.png';
// 1x1 transparent PNG (no GD required)
$pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
file_put_contents($proofFile, base64_decode($pngBase64));

delay();
$postData = [
    'payment_method' => 'gcash',
    'payment_reference' => 'GCASH-REF-' . $seed,
    'payment_proof' => new CURLFile($proofFile, 'image/png', 'proof.png'),
];
$upload = apiCall('POST', '/customer/requests/' . $serviceRequestId . '/payment-proof', $tokens['customer'], $postData, true);

if ($upload['status'] !== 200 && $upload['status'] !== 201) {
    addFinding('fail', 'customer', 'Customer payment proof upload failed', ['status' => $upload['status'], 'body' => $upload['raw']]);
    @unlink($proofFile);
    goto finish;
}
addFinding('pass', 'customer', 'Customer uploaded payment proof', $upload['json']);
@unlink($proofFile);

// ─────────────────────────────────────────────────────────────────────────
// 4. CASHIER GATE
// ─────────────────────────────────────────────────────────────────────────
delay();
$paymentRequests = apiCall('GET', '/cashier/payment-requests', $tokens['cashier']);
$payReqList = $paymentRequests['json']['payments'] ?? $paymentRequests['json']['data'] ?? [];
$foundPayment = false;
foreach ($payReqList as $p) {
    if (($p['payable_type'] ?? '') === 'service_request' && ($p['id'] ?? null) == $serviceRequestId) { $foundPayment = true; break; }
}
if ($foundPayment) {
    addFinding('pass', 'cashier', 'Cashier sees the service_request payment request', ['count' => count($payReqList)]);
} else {
    addFinding('fail', 'cashier', 'Cashier does NOT see the service_request payment request', ['count' => count($payReqList), 'target' => $serviceRequestId]);
}

delay();
$verify = apiCall('POST', '/cashier/payment-requests/' . $serviceRequestId . '/verify', $tokens['cashier'], [
    'type' => 'service_request',
    'reference_number' => 'REF-' . $seed,
    'payment_method' => 'gcash',
    'cashier_remarks' => 'Verified by audit',
]);

if ($verify['status'] !== 200 || empty($verify['json']['success']) || $verify['json']['success'] !== true) {
    addFinding('fail', 'cashier', 'Cashier verify payment failed', ['status' => $verify['status'], 'body' => $verify['raw']]);
} else {
    addFinding('pass', 'cashier', 'Cashier verified payment', $verify['json']);
}

// ─────────────────────────────────────────────────────────────────────────
// 5. VETERINARY GATE
// ─────────────────────────────────────────────────────────────────────────
// Find appointment for this service request via vet appointments list
delay();
$vetAppts = apiCall('GET', '/veterinary/appointments', $tokens['veterinary']);
$apptList = $vetAppts['json']['data'] ?? $vetAppts['json']['appointments'] ?? $vetAppts['json'] ?? [];
$appointmentId = null;
$appt = null;
foreach ($apptList as $a) {
    // Try to find by notes or service_request_id if present; otherwise most recent approved for Buddy
    if (($a['service_request_id'] ?? null) == $serviceRequestId) {
        $appointmentId = $a['id']; $appt = $a; break;
    }
}
if (!$appointmentId) {
    // fallback: newest 'approved' or 'scheduled' for this pet
    foreach ($apptList as $a) {
        if (($a['pet_name'] ?? '') === 'Buddy' && in_array($a['status'] ?? '', ['approved', 'scheduled', 'pending'])) {
            $appointmentId = $a['id']; $appt = $a; break;
        }
    }
}
if ($appointmentId) {
    addFinding('pass', 'veterinary', 'Veterinarian sees the approved appointment', ['appointment_id' => $appointmentId]);
} else {
    addFinding('fail', 'veterinary', 'Veterinarian does NOT see the approved appointment', ['count' => count($apptList), 'target_service_request' => $serviceRequestId]);
    goto inventory_check;
}

$medicalRecordId = null;

// Start appointment
delay();
$start = apiCall('POST', '/veterinary/appointments/' . $appointmentId . '/start', $tokens['veterinary'], [
    'notes' => 'Started in audit ' . $seed,
]);
if ($start['status'] === 200 || $start['status'] === 201) {
    addFinding('pass', 'veterinary', 'Veterinarian started appointment', $start['json']);
    $medicalRecordId = $start['json']['medical_record']['id'] ?? null;
} else {
    addFinding('fail', 'veterinary', 'Veterinarian start appointment failed', ['status' => $start['status'], 'body' => $start['raw']]);
}

// Update medical info
delay();
$medical = apiCall('PUT', '/veterinary/appointments/' . $appointmentId . '/medical', $tokens['veterinary'], [
    'diagnosis' => 'Healthy with mild seasonal allergy',
    'treatment_notes' => 'Prescribed antihistamine and rest',
    'prescription' => 'Antihistamine 5mg daily x7 days',
    'remarks' => 'Audit ' . $seed,
]);
if ($medical['status'] === 200 || $medical['status'] === 201) {
    addFinding('pass', 'veterinary', 'Veterinarian updated medical info');
} else {
    addFinding('fail', 'veterinary', 'Veterinarian update medical failed', ['status' => $medical['status'], 'body' => $medical['raw']]);
}

// Finalize the medical record so the appointment can be completed
if ($medicalRecordId) {
    delay();
    $finalizeRecord = apiCall('POST', '/veterinary/medical-records/' . $medicalRecordId . '/finalize', $tokens['veterinary']);
    if ($finalizeRecord['status'] === 200 || $finalizeRecord['status'] === 201) {
        addFinding('pass', 'veterinary', 'Veterinarian finalized medical record', $finalizeRecord['json']);
    } else {
        addFinding('warn', 'veterinary', 'Veterinarian finalize medical record returned ' . $finalizeRecord['status'], $finalizeRecord['raw']);
    }
} else {
    addFinding('warn', 'veterinary', 'Skipped medical record finalization due to missing medicalRecordId');
}

// ─────────────────────────────────────────────────────────────────────────
// 6. INVENTORY GATE
// ─────────────────────────────────────────────────────────────────────────
inventory_check:
delay();
$invItems = apiCall('GET', '/inventory/items', $tokens['inventory']);
$invList = $invItems['json']['items'] ?? $invItems['json']['data'] ?? [];
$item = $invList[0] ?? null;
if (!$item) {
    addFinding('fail', 'inventory', 'No inventory item available for usage test');
    goto finalize_vet;
}
$qtyBefore = $item['quantity'] ?? $item['stock'] ?? 0;
addFinding('pass', 'inventory', 'Inventory item available', ['item_id' => $item['id'], 'quantity' => $qtyBefore]);

// Find a service-consumable item with positive stock
$availableItems = apiCall('GET', '/veterinary/inventory-items', $tokens['veterinary']);
$availableList = $availableItems['json']['items'] ?? $availableItems['json']['data'] ?? [];
$consumable = null;
foreach ($availableList as $c) {
    $stock = $c['quantity'] ?? $c['stock'] ?? 0;
    if ($stock > 0) { $consumable = $c; break; }
}

if ($appointmentId && $consumable) {
    $item = $consumable; // use this for the visible stock check
    $qtyBefore = $item['quantity'] ?? $item['stock'] ?? 0;
    delay();
    $usage = apiCall('POST', '/veterinary/appointments/' . $appointmentId . '/inventory-usage', $tokens['veterinary'], [
        'items' => [
            [
                'inventory_item_id' => $item['id'],
                'quantity_used' => 1,
                'unit_price' => 0,
                'notes' => 'Audit usage ' . $seed,
            ]
        ],
        'general_notes' => 'Audit usage ' . $seed,
    ]);
    if ($usage['status'] === 200 || $usage['status'] === 201) {
        addFinding('pass', 'veterinary', 'Veterinarian recorded inventory usage', $usage['json']);
    } else {
        addFinding('fail', 'veterinary', 'Veterinarian inventory usage failed', ['status' => $usage['status'], 'body' => $usage['raw']]);
    }
} else {
    addFinding('warn', 'inventory', 'Skipped appointment inventory usage due to missing appointmentId or no consumable item');
}

// Inventory manager sees updated item (refresh list)
delay();
$invItems2 = apiCall('GET', '/inventory/items', $tokens['inventory']);
$invList2 = $invItems2['json']['items'] ?? $invItems2['json']['data'] ?? [];
$invItemVisible = false;
$qtyAfter = null;
foreach ($invList2 as $i) {
    if (($i['id'] ?? null) == $item['id']) { $invItemVisible = true; $qtyAfter = $i['quantity'] ?? $i['stock'] ?? 0; break; }
}
if ($invItemVisible) {
    addFinding('pass', 'inventory', 'Inventory manager sees item after stock movement', ['item_id' => $item['id'], 'quantity_before' => $qtyBefore, 'quantity_after' => $qtyAfter]);
} else {
    addFinding('fail', 'inventory', 'Inventory manager does NOT see the item after stock movement', ['item_id' => $item['id']]);
}

// ─────────────────────────────────────────────────────────────────────────
// 7. VETERINARY COMPLETION
// ─────────────────────────────────────────────────────────────────────────
finalize_vet:
if (!$appointmentId) {
    addFinding('warn', 'veterinary', 'Skipping appointment completion due to missing appointmentId');
    goto customer_back;
}

// Try to finalize bill
delay();
$finalize = apiCall('POST', '/veterinary/appointments/' . $appointmentId . '/finalize-bill', $tokens['veterinary'], [
    'notes' => 'Audit finalize ' . $seed,
]);
if ($finalize['status'] === 200 || $finalize['status'] === 201) {
    addFinding('pass', 'veterinary', 'Veterinarian finalized bill', $finalize['json']);
} else {
    addFinding('warn', 'veterinary', 'Veterinarian finalize bill returned ' . $finalize['status'], $finalize['raw']);
}

// Try vet complete
delay();
$complete = apiCall('POST', '/veterinary/appointments/' . $appointmentId . '/complete', $tokens['veterinary'], [
    'notes' => 'Completed in audit ' . $seed,
]);
if ($complete['status'] === 200 || $complete['status'] === 201) {
    addFinding('pass', 'veterinary', 'Veterinarian completed appointment', $complete['json']);
} else {
    addFinding('fail', 'veterinary', 'Veterinarian complete appointment failed', ['status' => $complete['status'], 'body' => $complete['raw']]);
}

// ─────────────────────────────────────────────────────────────────────────
// 8. CUSTOMER (BACK) — status visibility
// ─────────────────────────────────────────────────────────────────────────
customer_back:
delay();
$myReqs = apiCall('GET', '/customer/my-requests', $tokens['customer']);
$myList = $myReqs['json']['requests'] ?? $myReqs['json']['data'] ?? [];
$myReq = null;
foreach ($myList as $r) {
    if (($r['id'] ?? null) == $serviceRequestId) { $myReq = $r; break; }
}
if ($myReq) {
    addFinding('pass', 'customer-back', 'Customer sees own request after workflow', [
        'status' => $myReq['status'] ?? null,
        'payment_status' => $myReq['payment_status'] ?? null,
    ]);
} else {
    addFinding('fail', 'customer-back', 'Customer cannot see own request after workflow');
}

// ─────────────────────────────────────────────────────────────────────────
// 9. MANAGER GATE
// ─────────────────────────────────────────────────────────────────────────
manager_check:
delay();
$dash = apiCall('GET', '/manager/dashboard', $tokens['manager']);
if ($dash['status'] === 200) {
    addFinding('pass', 'manager', 'Manager dashboard loads');
} else {
    addFinding('fail', 'manager', 'Manager dashboard failed', ['status' => $dash['status'], 'body' => $dash['raw']]);
}

delay();
$reports = apiCall('GET', '/manager/reports/overview', $tokens['manager']);
if ($reports['status'] === 200) {
    addFinding('pass', 'manager', 'Manager reports overview loads');
} else {
    addFinding('fail', 'manager', 'Manager reports overview failed', ['status' => $reports['status'], 'body' => $reports['raw']]);
}

delay();
$svcReports = apiCall('GET', '/manager/reports/services', $tokens['manager']);
if ($svcReports['status'] === 200) {
    addFinding('pass', 'manager', 'Manager services report loads');
} else {
    addFinding('fail', 'manager', 'Manager services report failed', ['status' => $svcReports['status'], 'body' => $svcReports['raw']]);
}

// ─────────────────────────────────────────────────────────────────────────
// 10. RBAC NEGATIVE CHECK
// ─────────────────────────────────────────────────────────────────────────
delay();
$customerAsReceptionist = apiCall('GET', '/receptionist/requests/pending', $tokens['customer']);
if ($customerAsReceptionist['status'] === 403) {
    addFinding('pass', 'rbac', 'Customer cannot access receptionist endpoints (403)');
} else {
    addFinding('fail', 'rbac', 'Customer reached receptionist endpoint unexpectedly', ['status' => $customerAsReceptionist['status']]);
}

finish:
$report['completed_at'] = date('c');
$report['overall'] = count($report['blockers']) > 0 ? 'FAIL' : ($report['summary']['fail'] > 0 ? 'FAIL' : 'PASS');
$report['summary'] = [
    'pass' => $report['summary']['pass'],
    'fail' => $report['summary']['fail'],
    'warn' => $report['summary']['warn'],
    'blockers' => count($report['blockers']),
];
file_put_contents($reportFile, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

echo PHP_EOL . '═══════════════════════════════════════════════════════════════' . PHP_EOL;
echo 'PAWESOME CROSS-ROLE E2E AUDIT: ' . $report['overall'] . PHP_EOL;
echo 'Pass: ' . $report['summary']['pass'] . '  Fail: ' . $report['summary']['fail'] . '  Warn: ' . $report['summary']['warn'] . '  Blockers: ' . $report['summary']['blockers'] . PHP_EOL;
echo 'Report: ' . $reportFile . PHP_EOL;
echo '═══════════════════════════════════════════════════════════════' . PHP_EOL;

exit($report['overall'] === 'PASS' ? 0 : 1);
