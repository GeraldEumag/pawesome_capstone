<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\DiagnosticOrder;
use App\Models\HotelRoom;
use App\Models\MedicalConfinement;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceItemUsage;
use App\Models\User;
use App\Models\VisitInvoice;
use App\Models\VisitInvoiceAdjustment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Phase C: estimates with threshold re-approval, consents, diagnostic order
 * lifecycle, the unified visit invoice and invoice adjustments.
 */
class VisitBillingPhaseCTest extends TestCase
{
    use RefreshDatabase;

    private function userWithToken(string $role): User
    {
        $user = User::factory()->create([
            'role' => $role,
            'is_active' => true,
        ]);
        $user->plain_text_token = $user->createToken('test-token')->plainTextToken;

        return $user;
    }

    private function authHeader(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->plain_text_token];
    }

    private function makeAppointment(User $vet, array $overrides = []): Appointment
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create();

        return Appointment::factory()->create(array_merge([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'in_consultation',
            'price' => 500,
            'scheduled_at' => now(),
        ], $overrides));
    }


    private function addCharge(User $vet, Appointment $appt, float $price, string $description = 'Charge'): array
    {
        return $this->postJson('/api/billing/items', [
            'service_type' => 'veterinary',
            'service_id' => $appt->id,
            'item_type' => 'add_on_service',
            'description' => $description,
            'quantity' => 1,
            'unit_price' => $price,
        ], $this->authHeader($vet))->json() ?? [];
    }

    // ── Estimate gating ──────────────────────────────────────────

    public function test_treatment_charges_allowed_without_estimate(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appt = $this->makeAppointment($vet);

        $response = $this->postJson('/api/billing/items', [
            'service_type' => 'veterinary',
            'service_id' => $appt->id,
            'item_type' => 'add_on_service',
            'description' => 'X-ray',
            'quantity' => 1,
            'unit_price' => 800,
        ], $this->authHeader($vet));

        $response->assertStatus(201);
    }






    // ── Diagnostics ──────────────────────────────────────────────

    public function test_diagnostic_order_lifecycle_and_appointment_parking(): void
    {
        $vet = $this->userWithToken('veterinary');
        $tech = $this->userWithToken('vet_tech');
        $appt = $this->makeAppointment($vet, ['emergency' => true]);

        $create = $this->postJson("/api/veterinary/appointments/{$appt->id}/diagnostics", [
            'name' => 'CBC Panel',
            'order_type' => 'lab',
            'priority' => 'urgent',
        ], $this->authHeader($vet));
        $create->assertStatus(201);
        $orderId = $create->json('order.id');

        $this->assertSame('awaiting_results', $appt->fresh()->status);

        $this->postJson("/api/veterinary/diagnostics/{$orderId}/collect", [], $this->authHeader($tech))
            ->assertOk();
        $this->postJson("/api/veterinary/diagnostics/{$orderId}/result", [
            'findings' => 'Elevated WBC',
            'is_abnormal' => true,
        ], $this->authHeader($tech))->assertOk();
        $this->postJson("/api/veterinary/diagnostics/{$orderId}/review", [], $this->authHeader($vet))
            ->assertOk();

        $order = DiagnosticOrder::findOrFail($orderId);
        $this->assertSame('reviewed', $order->status);
        $this->assertSame('in_consultation', $appt->fresh()->status);
        $this->assertSame(1, $order->results()->count());
    }

    public function test_vet_tech_cannot_order_or_review_diagnostics(): void
    {
        $vet = $this->userWithToken('veterinary');
        $tech = $this->userWithToken('vet_tech');
        $appt = $this->makeAppointment($vet, ['emergency' => true]);

        $this->postJson("/api/veterinary/appointments/{$appt->id}/diagnostics", [
            'name' => 'CBC',
        ], $this->authHeader($tech))->assertStatus(403);

        $order = DiagnosticOrder::create([
            'appointment_id' => $appt->id,
            'code' => 'DX-T-1',
            'name' => 'CBC',
            'status' => 'resulted',
            'ordered_by' => $vet->id,
            'ordered_at' => now(),
        ]);
        $this->postJson("/api/veterinary/diagnostics/{$order->id}/review", [], $this->authHeader($tech))
            ->assertStatus(403);
    }

    public function test_diagnostic_order_allowed_without_estimate(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appt = $this->makeAppointment($vet);

        $this->postJson("/api/veterinary/appointments/{$appt->id}/diagnostics", [
            'name' => 'CBC',
        ], $this->authHeader($vet))->assertStatus(201);
    }

    // ── Visit invoice ────────────────────────────────────────────

    public function test_invoice_materializes_and_reconciles_to_lines(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appt = $this->makeAppointment($vet, ['emergency' => true]);

        $this->addCharge($vet, $appt, 800, 'X-ray');
        $this->addCharge($vet, $appt, 200, 'Bandage');

        $invoice = VisitInvoice::where('invoiceable_id', $appt->id)->firstOrFail();
        $this->assertStringStartsWith('VINV-', $invoice->invoice_number);

        $lineSum = (float) $invoice->lines()->where('is_billable', true)->sum('line_total')
            - (float) $invoice->lines()->where('item_type', 'discount')->sum('line_total');
        $this->assertEquals(round($lineSum, 2), (float) $invoice->total);
        $this->assertEquals(1500.0, (float) $invoice->total); // 500 base + 800 + 200
        $this->assertNotEmpty($invoice->version_hash);
    }

    public function test_discount_below_limit_applies_immediately(): void
    {
        $vet = $this->userWithToken('veterinary');
        $cashier = $this->userWithToken('cashier');
        $appt = $this->makeAppointment($vet, ['emergency' => true]);
        $this->addCharge($vet, $appt, 500, 'X-ray');

        $response = $this->postJson("/api/cashier/visit-invoices/{$appt->id}/adjustments", [
            'type' => 'discount',
            'amount' => 100,
            'reason_code' => 'promo',
        ], $this->authHeader($cashier));
        $response->assertStatus(201);
        $this->assertFalse($response->json('requires_approval'));

        $invoice = VisitInvoice::where('invoiceable_id', $appt->id)->firstOrFail();
        $this->assertEquals(900.0, (float) $invoice->total); // 1000 - 100
        $this->assertSame(
            VisitInvoiceAdjustment::STATUS_APPLIED,
            $invoice->adjustments()->first()->status
        );
    }

    public function test_waiver_requires_manager_approval(): void
    {
        $vet = $this->userWithToken('veterinary');
        $cashier = $this->userWithToken('cashier');
        $manager = $this->userWithToken('manager');
        $appt = $this->makeAppointment($vet, ['emergency' => true]);
        $this->addCharge($vet, $appt, 500, 'X-ray');

        $response = $this->postJson("/api/cashier/visit-invoices/{$appt->id}/adjustments", [
            'type' => 'waiver',
            'amount' => 200,
            'reason_code' => 'goodwill',
        ], $this->authHeader($cashier));
        $response->assertStatus(201);
        $this->assertTrue($response->json('requires_approval'));

        $adjustmentId = $response->json('adjustment.id');
        $invoice = VisitInvoice::where('invoiceable_id', $appt->id)->firstOrFail();
        $this->assertEquals(1000.0, (float) $invoice->total); // not applied yet

        // Pending queue shows it
        $pending = $this->getJson('/api/manager/visit-invoice-adjustments/pending', $this->authHeader($manager));
        $pending->assertOk();
        $this->assertNotEmpty($pending->json('adjustments'));

        // Cashier cannot approve
        $this->postJson("/api/manager/visit-invoice-adjustments/{$adjustmentId}/approve", [], $this->authHeader($cashier))
            ->assertStatus(403);

        // Manager approves → applied, invoice total drops
        $this->postJson("/api/manager/visit-invoice-adjustments/{$adjustmentId}/approve", [], $this->authHeader($manager))
            ->assertOk();

        $invoice->refresh();
        $this->assertEquals(800.0, (float) $invoice->total); // 1000 - 200
    }

    public function test_invoice_endpoint_exposes_lines_and_settlements(): void
    {
        $vet = $this->userWithToken('veterinary');
        $cashier = $this->userWithToken('cashier');
        $appt = $this->makeAppointment($vet, ['emergency' => true]);
        $this->addCharge($vet, $appt, 500, 'X-ray');

        $response = $this->getJson("/api/cashier/visit-invoices/{$appt->id}", $this->authHeader($cashier));
        $response->assertOk();
        $invoice = $response->json('invoice');
        $this->assertEquals(1000.0, $invoice['total']);
        $this->assertCount(2, $invoice['lines']);
        $this->assertNotEmpty($invoice['version_hash']);
    }

    // ── Consents & confinement admission ─────────────────────────

    public function test_confinement_admission_requires_signed_consent(): void
    {
        $vet = $this->userWithToken('veterinary');
        $receptionist = $this->userWithToken('receptionist');
        $appt = $this->makeAppointment($vet);
        $room = HotelRoom::factory()->create(['status' => 'available']);

        $confinement = MedicalConfinement::create([
            'consultation_id' => $appt->id,
            'pet_id' => $appt->pet_id,
            'customer_id' => $appt->customer_id,
            'vet_id' => $vet->id,
            'room_id' => $room->id,
            'status' => 'approved_for_admission',
            'diagnosis' => 'Test diagnosis',
            'reason_for_confinement' => 'Observation',
            'urgency_level' => 'normal',
        ]);

        $this->postJson("/api/receptionist/medical-confinements/{$confinement->id}/admit", [], $this->authHeader($receptionist))
            ->assertStatus(422);

        $this->postJson('/api/veterinary/consents', [
            'consentable_type' => 'appointment',
            'consentable_id' => $appt->id,
            'type' => 'confinement',
            'title' => 'Consent to confinement',
            'signer_name' => 'Pet Owner',
        ], $this->authHeader($vet))->assertStatus(201);

        $this->postJson("/api/receptionist/medical-confinements/{$confinement->id}/admit", [], $this->authHeader($receptionist))
            ->assertOk();
        $this->assertSame('admitted', $confinement->fresh()->status);
    }

    public function test_emergency_confinement_admission_bypasses_consent(): void
    {
        $vet = $this->userWithToken('veterinary');
        $receptionist = $this->userWithToken('receptionist');
        $appt = $this->makeAppointment($vet, ['emergency' => true]);
        $room = HotelRoom::factory()->create(['status' => 'available']);

        $confinement = MedicalConfinement::create([
            'consultation_id' => $appt->id,
            'pet_id' => $appt->pet_id,
            'customer_id' => $appt->customer_id,
            'vet_id' => $vet->id,
            'room_id' => $room->id,
            'status' => 'approved_for_admission',
            'diagnosis' => 'Emergency',
            'reason_for_confinement' => 'Emergency observation',
            'urgency_level' => 'critical',
        ]);

        $this->postJson("/api/receptionist/medical-confinements/{$confinement->id}/admit", [], $this->authHeader($receptionist))
            ->assertOk();
    }

    public function test_paying_all_items_settles_invoice(): void
    {
        $vet = $this->userWithToken('veterinary');
        $cashier = $this->userWithToken('cashier');
        $appt = $this->makeAppointment($vet, ['emergency' => true]);
        $this->addCharge($vet, $appt, 500, 'X-ray');

        $itemIds = ServiceItemUsage::where('service_type', 'veterinary')
            ->where('service_id', $appt->id)
            ->where('is_billable', true)
            ->pluck('id')
            ->all();

        $this->patchJson('/api/billing/items/mark-paid', [
            'item_ids' => $itemIds,
        ], $this->authHeader($cashier))->assertOk();

        $invoice = VisitInvoice::where('invoiceable_id', $appt->id)->firstOrFail();
        $this->assertSame('settled', $invoice->status);
        $this->assertEquals(0.0, (float) $invoice->balance_due);
        $this->assertEquals(1000.0, (float) $invoice->amount_paid);
    }
}
