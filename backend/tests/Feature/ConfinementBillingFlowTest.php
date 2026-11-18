<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\MedicalConfinement;
use App\Models\MedicalRecord;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceItemUsage;
use App\Models\User;
use App\Models\WardBed;
use App\Services\ConfinementAccrualService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * End-to-end veterinary confinement billing: recommendation estimate,
 * ward-bed daily rate, inpatient accrual onto the visit invoice,
 * cashier proof verification, release gating, and visit completion.
 */
class ConfinementBillingFlowTest extends TestCase
{
    use RefreshDatabase;

    private function userWithToken(string $role): User
    {
        $user = User::factory()->create(['role' => $role, 'is_active' => true]);
        $user->plain_text_token = $user->createToken('test-token')->plainTextToken;
        return $user;
    }

    private function authHeader(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->plain_text_token];
    }

    private function pngUpload(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            'proof.png',
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')
        );
    }

    public function test_confinement_bill_lifecycle_accrual_payment_and_release(): void
    {
        Storage::fake('private');

        $vet = $this->userWithToken('veterinary');
        $receptionist = $this->userWithToken('receptionist');
        $cashier = $this->userWithToken('cashier');
        $manager = $this->userWithToken('manager');

        $customerUser = $this->userWithToken('customer');
        $customer = Customer::factory()->create([
            'user_id' => $customerUser->id,
            'email' => $customerUser->email,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create(['price' => 500]);

        // Emergency visit bypasses the signed-consent admission gate.
        $appointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => now()->addHour(),
            'price' => 500,
            'emergency' => true,
        ]);

        // ── 1. Consult → recommend confinement with an estimated bill ──
        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointment->id}/start")
            ->assertOk();

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/consultations/{$appointment->id}/recommend-confinement", [
                'diagnosis' => 'Severe dehydration',
                'reason_for_confinement' => 'Needs IV fluids and monitoring',
                'urgency_level' => 'urgent',
                'expected_stay_days' => 3,
                'estimated_cost' => 2500,
            ])
            ->assertCreated();

        $confinement = MedicalConfinement::where('consultation_id', $appointment->id)->firstOrFail();
        $this->assertSame('recommended', $confinement->status);
        $this->assertSame('unpaid', $confinement->payment_status);
        $this->assertSame('2500.00', $confinement->estimated_cost);

        // ── 2. Assign ward bed → server-authoritative daily rate ──
        $bed = WardBed::create(['name' => 'GEN-1', 'ward' => 'general', 'daily_rate' => 800]);

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/medical-confinements/{$confinement->id}/assign-bed", [
                'ward_bed_id' => $bed->id,
                // A client-supplied rate must never seed the accrual billing.
                'daily_rate' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('medical_confinement.status', 'bed_assigned')
            ->assertJsonPath('medical_confinement.daily_rate', '800.00');

        $this->assertSame('800.00', $confinement->fresh()->daily_rate);

        // ── 3. Admit → accrual anchor starts now ──
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/medical-confinements/{$confinement->id}/admit")
            ->assertOk()
            ->assertJsonPath('medical_confinement.status', 'admitted');

        // ── 4. Three elapsed days accrue onto the visit bill once ──
        $confinement->update([
            'admitted_at' => now()->subDays(3),
            'last_accrual_at' => now()->subDays(3),
        ]);

        $accrual = ConfinementAccrualService::accrue($confinement->fresh());
        $this->assertSame(3, $accrual['accrued_days']);
        $this->assertSame(2400.0, $accrual['amount']);

        $accrualRows = ServiceItemUsage::where('service_type', 'veterinary')
            ->where('service_id', $appointment->id)
            ->where('usage_type', 'inpatient_accrual')
            ->get();
        $this->assertCount(3, $accrualRows);
        $this->assertTrue($accrualRows->every(fn ($r) => (float) $r->total_price === 800.0 && $r->is_billable && !$r->is_paid));

        // Idempotent — same-day rerun adds nothing.
        $rerun = ConfinementAccrualService::accrue($confinement->fresh());
        $this->assertSame(0, $rerun['accrued_days']);
        $this->assertSame(3, ServiceItemUsage::where('usage_type', 'inpatient_accrual')->count());

        // The visit invoice now carries consultation base + 3 bed days.
        $billing = \App\Services\ServiceBillingService::getItemizedBilling('veterinary', $appointment->id);
        $this->assertEquals(2900.0, (float) $billing['total_bill']); // 500 + 2400
        $this->assertEquals(2900.0, (float) $billing['balance_due']);

        // ── 5. Finalize record + consultation → clinical_complete ──
        $record = MedicalRecord::where('appointment_id', $appointment->id)->firstOrFail();
        $this->withHeaders($this->authHeader($vet))
            ->putJson("/api/veterinary/medical-records/{$record->id}", [
                'appointment_id' => $appointment->id,
                'pet_id' => $pet->id,
                'visit_date' => now()->toISOString(),
                'diagnosis' => 'Severe dehydration',
                'status' => 'finalized',
            ])
            ->assertOk();

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/consultations/{$appointment->id}/complete", [
                'diagnosis' => 'Severe dehydration',
            ])
            ->assertOk()
            ->assertJsonPath('consultation.status', 'clinical_complete');

        // ── 6. Vet clears discharge → release is payment-gated ──
        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/medical-confinements/{$confinement->id}/clear-for-discharge")
            ->assertOk()
            ->assertJsonPath('medical_confinement.status', 'ready_for_discharge');

        // Unpaid → blocked for staff.
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/medical-confinements/{$confinement->id}/release")
            ->assertStatus(422);

        // Manager override needs a real reason.
        $this->withHeaders($this->authHeader($manager))
            ->postJson("/api/manager/medical-confinements/{$confinement->id}/release", [
                'override_reason' => 'short',
            ])
            ->assertStatus(422);

        // ── 7. Customer submits e-wallet proof → cashier queue ──
        $this->withHeaders($this->authHeader($customerUser))
            ->postJson("/api/customer/medical-confinements/{$confinement->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'GCASH-CONF-9001',
                'payment_proof' => $this->pngUpload(),
            ])
            ->assertOk()
            ->assertJsonPath('medical_confinement.payment_status', 'pending');

        $queue = $this->withHeaders($this->authHeader($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->json('payments');

        $row = collect($queue)->firstWhere('payable_type', 'medical_confinement');
        $this->assertNotNull($row, 'Confinement payment missing from cashier queue');
        $this->assertSame($confinement->id, $row['id']);
        $this->assertEquals(2500.0, (float) $row['amount']); // estimated_cost surfaces as amount due

        // ── 8. Cashier verifies the proof ──
        $this->withHeaders($this->authHeader($cashier))
            ->postJson("/api/cashier/confinement-payments/{$confinement->id}/verify", [
                'payment_method' => 'gcash',
                'reference_number' => 'GCASH-CONF-9001',
            ])
            ->assertOk()
            ->assertJsonPath('payment_status', 'paid');

        $confinement->refresh();
        $this->assertSame('paid', $confinement->payment_status);
        $this->assertNotEmpty($confinement->receipt_number);

        // The settlement ledger must record the real amount collected.
        $settlement = \App\Models\PaymentSettlement::where('settleable_type', 'medical_confinement')
            ->where('settleable_id', $confinement->id)
            ->first();
        $this->assertNotNull($settlement, 'No payment settlement recorded for confinement');
        $this->assertEquals(2500.0, (float) $settlement->amount, 'Confinement settlement amount is wrong');

        // ── 9. Paid release frees the bed and discharges ──
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/medical-confinements/{$confinement->id}/release")
            ->assertOk()
            ->assertJsonPath('medical_confinement.status', 'discharged');

        $this->assertSame('available', $bed->fresh()->status);
        $this->assertSame('discharged', $confinement->fresh()->status);
    }
}
