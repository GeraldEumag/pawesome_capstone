<?php

/**
 * Idempotent E2E fixture seeder for the confinement payment workflow spec
 * (frontend/e2e/phase4-payment-workflow.spec.js).
 *
 * Creates/resets two medical_confinements rows for customer@example.com so the
 * Playwright payment flow always starts from payment_status='unpaid'.
 * Intended for the local dev database only — never run against production.
 */

require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Customer;
use App\Models\MedicalConfinement;
use App\Models\Pet;
use App\Models\User;

$user = User::where('email', 'customer@example.com')->first();
if (!$user) {
    fwrite(STDERR, "Fixture user customer@example.com not found — run database seeders first.\n");
    exit(1);
}

$customer = Customer::where('user_id', $user->id)->orWhere('email', $user->email)->first();
if (!$customer) {
    fwrite(STDERR, "No customers row linked to customer@example.com.\n");
    exit(1);
}

$pet = Pet::where('customer_id', $customer->id)->orderBy('id')->first();
if (!$pet) {
    fwrite(STDERR, "Fixture customer has no pet to attach to the confinement.\n");
    exit(1);
}

$consultation = Illuminate\Support\Facades\DB::table('appointments')
    ->where('customer_id', $customer->id)
    ->orderBy('id')
    ->first();
if (!$consultation) {
    fwrite(STDERR, "Fixture customer has no appointment to satisfy consultation_id FK.\n");
    exit(1);
}

$vetId = $consultation->veterinarian_id
    ?? $consultation->vet_id
    ?? User::where('email', 'vet@example.com')->value('id');
if (!$vetId) {
    fwrite(STDERR, "No veterinarian user available to satisfy vet_id FK.\n");
    exit(1);
}

$markers = ['PW-E2E-VERIFY', 'PW-E2E-REJECT'];

foreach ($markers as $marker) {
    MedicalConfinement::updateOrCreate(
        ['diagnosis' => $marker],
        [
            'consultation_id' => $consultation->id,
            'vet_id' => $vetId,
            'customer_id' => $customer->id,
            'customer_email' => $customer->email ?? $user->email,
            'customer_name' => $customer->name ?? $user->name,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'reason_for_confinement' => 'E2E payment workflow fixture',
            'estimated_cost' => 1500,
            'status' => 'admitted',
            'payment_status' => 'unpaid',
            'payment_method' => null,
            'payment_reference' => null,
            'payment_proof' => null,
            'paid_at' => null,
            'verified_by' => null,
            'verified_at' => null,
            'cashier_remarks' => null,
            'receipt_number' => null,
            'reference_number' => null,
            'rejected_by' => null,
            'rejected_at' => null,
            'rejection_reason' => null,
        ]
    );
}

// Pending boarding fixture for the receptionist "approve without vaccination
// card" check — identified in the UI via the notes marker (search haystack).
$roomId = Illuminate\Support\Facades\DB::table('hotel_rooms')->orderBy('id')->value('id');

Illuminate\Support\Facades\DB::table('boardings')->updateOrInsert(
    ['notes' => 'PW-E2E-APPROVAL'],
    [
        'pet_id' => $pet->id,
        'pet_name' => $pet->name,
        'customer_id' => $customer->id,
        'customer_email' => $customer->email ?? $user->email,
        'customer_name' => $customer->name ?? $user->name,
        'stay_type' => 'hotel_boarding',
        'check_in' => now()->addDay()->toDateString(),
        'check_out' => now()->addDays(3)->toDateString(),
        'hotel_room_id' => $roomId,
        'status' => 'pending',
        'payment_status' => 'unpaid',
        'total_amount' => 1500,
        'vaccination_card' => null,
        'approved_by' => null,
        'approved_at' => null,
        'rejected_by' => null,
        'rejected_at' => null,
        'rejection_reason' => null,
        'updated_at' => now(),
        'created_at' => now(),
    ]
);

// Billing fixture for the boarding itemized-billing E2E (boarding-billing
// spec): an approved, unpaid ₱900 boarding with NO service_item_usages rows —
// exercising lazy base-item materialization — and no settlements. Reset all
// derived/payment state so reruns (including Playwright retries) start clean.
$billing = Illuminate\Support\Facades\DB::table('boardings')->where('notes', 'PW-E2E-BILLING')->first();

if ($billing) {
    Illuminate\Support\Facades\DB::table('payment_settlement_items')
        ->whereIn('payment_settlement_id',
            Illuminate\Support\Facades\DB::table('payment_settlements')
                ->where('settleable_type', 'boarding')->where('settleable_id', $billing->id)
                ->pluck('id'))
        ->delete();
    Illuminate\Support\Facades\DB::table('payment_settlements')
        ->where('settleable_type', 'boarding')->where('settleable_id', $billing->id)
        ->delete();
    Illuminate\Support\Facades\DB::table('service_item_usages')
        ->where('service_type', 'boarding')->where('service_id', $billing->id)
        ->delete();
}

Illuminate\Support\Facades\DB::table('boardings')->updateOrInsert(
    ['notes' => 'PW-E2E-BILLING'],
    [
        'pet_id' => $pet->id,
        'pet_name' => $pet->name,
        'customer_id' => $customer->id,
        'customer_email' => $customer->email ?? $user->email,
        'customer_name' => $customer->name ?? $user->name,
        'stay_type' => 'hotel_boarding',
        'check_in' => now()->addDay()->toDateString(),
        'check_out' => now()->addDays(3)->toDateString(),
        'hotel_room_id' => $roomId,
        'status' => 'approved',
        'payment_status' => 'unpaid',
        'total_amount' => 900,
        'amount_paid' => 0,
        'balance_due' => 900,
        'paid_at' => null,
        'verified_by' => null,
        'verified_at' => null,
        'receipt_number' => null,
        'reference_number' => null,
        'vaccination_card' => null,
        'updated_at' => now(),
        'created_at' => $billing->created_at ?? now(),
    ]
);

echo "E2E payment fixtures ready (markers: " . implode(', ', $markers) . ", boardings: PW-E2E-APPROVAL, PW-E2E-BILLING)\n";
