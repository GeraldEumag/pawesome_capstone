<?php

require_once 'backend/vendor/autoload.php';

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

// Bootstrap Laravel
$app = require_once 'backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "=== VETERINARY E2E TEST SYSTEM PREPARATION ===\n";

// Check veterinarian users
echo "\n1. Checking Veterinarian Users:\n";
$vetUsers = DB::table('users')->where('role', 'veterinarian')->get(['id', 'email', 'name']);
foreach ($vetUsers as $user) {
    echo "ID: {$user->id}, Email: {$user->email}, Name: {$user->name}\n";
}

// Check existing veterinary appointments
echo "\n2. Checking Veterinary Appointments:\n";
$vetAppointments = DB::table('appointments')
    ->orderBy('created_at', 'desc')
    ->limit(5)
    ->get(['id', 'pet_id', 'scheduled_at', 'status', 'created_at']);

foreach ($vetAppointments as $appointment) {
    echo "ID: {$appointment->id}, Pet: {$appointment->pet_id}, Date: {$appointment->scheduled_at}, Status: {$appointment->status}, Created: {$appointment->created_at}\n";
}

// Check medical records
echo "\n3. Checking Medical Records:\n";
$medicalRecords = DB::table('medical_records')
    ->orderBy('created_at', 'desc')
    ->limit(5)
    ->get(['id', 'pet_id', 'appointment_id', 'veterinarian_id', 'diagnosis', 'treatment_plan', 'created_at']);

foreach ($medicalRecords as $record) {
    echo "ID: {$record->id}, Pet: {$record->pet_id}, Appointment: {$record->appointment_id}, Vet: {$record->veterinarian_id}, Diagnosis: " . substr($record->diagnosis, 0, 50) . "..., Created: {$record->created_at}\n";
}

// Create E2E Vaccine item for testing
echo "\n4. Creating E2E Vaccine Test Item:\n";
$e2eVaccine = DB::table('inventory_items')->where('name', 'E2E Vaccine')->first();
if (!$e2eVaccine) {
    $e2eVaccineId = DB::table('inventory_items')->insertGetId([
        'name' => 'E2E Vaccine',
        'sku' => 'E2E-VACCINE',
        'category' => 'Health',
        'stock' => 15,
        'price' => 50.00,
        'is_sellable' => 0,
        'created_at' => now(),
        'updated_at' => now()
    ]);
    echo "Created E2E Vaccine with ID: $e2eVaccineId\n";
} else {
    echo "E2E Vaccine already exists with ID: {$e2eVaccine->id}, Stock: {$e2eVaccine->stock}\n";
}

// Check existing veterinary inventory usage
echo "\n5. Recent Veterinary Inventory Usage:\n";
$vetUsage = DB::table('service_item_usages')
    ->where('service_type', 'veterinary')
    ->orderBy('created_at', 'desc')
    ->limit(5)
    ->get(['id', 'service_id', 'inventory_item_id', 'quantity_used', 'notes', 'created_at']);

foreach ($vetUsage as $usage) {
    echo "ID: {$usage->id}, Service ID: {$usage->service_id}, Item ID: {$usage->inventory_item_id}, Quantity: {$usage->quantity_used}, Notes: {$usage->notes}, Created: {$usage->created_at}\n";
}

// Check veterinary inventory logs
echo "\n6. Recent Veterinary Inventory Logs:\n";
$vetLogs = DB::table('inventory_logs')
    ->where('movement_type', 'vet_usage')
    ->orderBy('created_at', 'desc')
    ->limit(5)
    ->get(['id', 'inventory_item_id', 'quantity', 'stock_after', 'reference_id', 'reference_type', 'created_at']);

foreach ($vetLogs as $log) {
    $movementType = $log->movement_type ?? 'unknown';
    echo "ID: {$log->id}, Item ID: {$log->inventory_item_id}, Movement: {$movementType}, Quantity: {$log->quantity}, Stock After: {$log->stock_after}, Ref: {$log->reference_type}:{$log->reference_id}, Created: {$log->created_at}\n";
}

echo "\n=== VETERINARY SYSTEM READY FOR E2E TESTING ===\n";
