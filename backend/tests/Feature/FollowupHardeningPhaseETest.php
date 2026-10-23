<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\MedicalConfinement;
use App\Models\MedicalRecord;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Models\Vaccination;
use App\Models\VisitInvoice;
use App\Models\VisitInvoiceAdjustment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Phase E: idempotency keys, recall scheduler, vaccine lot recall, and the
 * extended audit-log surface.
 */
class FollowupHardeningPhaseETest extends TestCase
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
            'status' => 'scheduled',
            'scheduled_at' => now()->addHour(),
        ], $overrides));
    }

    // ── Idempotency keys ───────────────────────────────────────────

    public function test_idempotency_key_replays_the_start_response(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $headers = $this->authHeader($vet) + ['Idempotency-Key' => 'start-abc-123'];

        $first = $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start")
            ->assertOk()
            ->assertHeaderMissing('Idempotent-Replayed');

        $second = $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start")
            ->assertOk()
            ->assertHeader('Idempotent-Replayed', 'true');

        $this->assertSame($first->getContent(), $second->getContent());
        $this->assertSame(1, DB::table('idempotency_keys')->count());
    }

    public function test_reused_key_with_different_payload_is_rejected(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $headers = $this->authHeader($vet) + ['Idempotency-Key' => 'key-xyz'];

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start", ['notes' => 'first'])
            ->assertOk();

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start", ['notes' => 'second'])
            ->assertStatus(409);
    }

    // ── Recall scheduler ───────────────────────────────────────────

    public function test_vaccine_due_recall_notifies_owner_once(): void
    {
        $ownerUser = $this->userWithToken('customer');
        $customer = Customer::factory()->create(['user_id' => $ownerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $vet = $this->userWithToken('veterinary');

        $vaccination = Vaccination::create([
            'pet_id' => $pet->id,
            'veterinarian_id' => $vet->id,
            'vaccine_name' => 'Rabies',
            'vaccine_type' => 'Core',
            'date_administered' => now()->subMonths(11),
            'next_due_date' => now()->addDays(15),
            'status' => 'given',
        ]);

        Artisan::call('recalls:send');

        $this->assertDatabaseHas('notifications', [
            'user_id' => $ownerUser->id,
            'related_type' => 'vaccination',
            'related_id' => $vaccination->id,
        ]);
        $this->assertDatabaseHas('recall_dispatches', [
            'kind' => 'vaccine_due',
            'ref_id' => $vaccination->id,
        ]);

        // Second run must not duplicate.
        Artisan::call('recalls:send');
        $this->assertSame(1, DB::table('recall_dispatches')
            ->where('kind', 'vaccine_due')->where('ref_id', $vaccination->id)->count());
    }

    public function test_post_discharge_check_fires_24_to_48_hours_after_release(): void
    {
        $ownerUser = $this->userWithToken('customer');
        $customer = Customer::factory()->create(['user_id' => $ownerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet, [
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
        ]);

        $confinement = MedicalConfinement::create([
            'consultation_id' => $appointment->id,
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'vet_id' => $vet->id,
            'diagnosis' => 'Post-op observation',
            'reason_for_confinement' => 'Recovery',
            'status' => 'discharged',
            'payment_status' => 'paid',
            'discharged_at' => now()->subHours(30),
        ]);

        Artisan::call('recalls:send');

        $this->assertDatabaseHas('recall_dispatches', [
            'kind' => 'post_discharge_check',
            'ref_id' => $confinement->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $ownerUser->id,
            'related_type' => 'medical_confinement',
            'related_id' => $confinement->id,
        ]);
    }

    // ── Vaccine lot recall ─────────────────────────────────────────

    public function test_lot_recall_lists_every_patient_who_received_the_lot(): void
    {
        $vet = $this->userWithToken('veterinary');
        $item = InventoryItem::factory()->create(['item_class' => 'vaccine', 'status' => 'active']);
        $batch = InventoryBatch::create([
            'inventory_item_id' => $item->id,
            'batch_no' => 'LOT-77',
            'received_date' => now()->subMonth(),
            'expiration_date' => now()->addMonths(6),
            'quantity' => 10,
            'remaining_quantity' => 8,
            'status' => 'active',
        ]);

        foreach (range(1, 2) as $i) {
            $customer = Customer::factory()->create();
            $pet = Pet::factory()->create(['customer_id' => $customer->id]);
            Vaccination::create([
                'pet_id' => $pet->id,
                'veterinarian_id' => $vet->id,
                'vaccine_name' => 'DHPP',
                'lot_number' => 'LOT-77',
                'inventory_batch_id' => $batch->id,
                'date_administered' => now()->subDays($i),
                'status' => 'given',
            ]);
        }
        // Different lot — must not appear.
        Vaccination::create([
            'pet_id' => Pet::factory()->create(['customer_id' => Customer::factory()->create()->id])->id,
            'veterinarian_id' => $vet->id,
            'vaccine_name' => 'DHPP',
            'lot_number' => 'LOT-99',
            'date_administered' => now()->subDay(),
            'status' => 'given',
        ]);

        $res = $this->withHeaders($this->authHeader($vet))
            ->getJson('/api/veterinary/vaccination-recall?lot_number=LOT-77')
            ->assertOk();

        $this->assertSame(2, $res->json('count'));
        $this->assertCount(2, $res->json('recipients'));
        $this->assertSame('LOT-77', $res->json('recipients.0.lot_number'));
        $this->assertNotNull($res->json('recipients.0.pet.name'));

        // Manager reaches the same list via their route.
        $manager = $this->userWithToken('manager');
        $this->withHeaders($this->authHeader($manager))
            ->getJson('/api/manager/vaccination-recall?inventory_batch_id=' . $batch->id)
            ->assertOk()
            ->assertJsonPath('count', 2);
    }

    // ── Extended audit log ─────────────────────────────────────────

    public function test_finalize_and_adjustment_rejection_are_audited(): void
    {
        $vet = $this->userWithToken('veterinary');
        $manager = $this->userWithToken('manager');
        $pet = Pet::factory()->create(['customer_id' => Customer::factory()->create()->id]);

        $record = MedicalRecord::create([
            'pet_id' => $pet->id,
            'veterinarian_id' => $vet->id,
            'visit_date' => now(),
            'status' => MedicalRecord::STATUS_DRAFT,
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/medical-records/{$record->id}/finalize")
            ->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'medical_record_finalized',
            'reference_id' => $record->id,
        ]);

        $adjustment = VisitInvoiceAdjustment::create([
            'visit_invoice_id' => VisitInvoice::create([
                'invoice_number' => 'INV-TEST-1',
                'invoiceable_type' => 'appointment',
                'invoiceable_id' => 1,
            ])->id,
            'type' => 'waiver',
            'amount' => 500,
            'reason_code' => 'hardship',
            'status' => 'pending',
            'requested_by' => $vet->id,
        ]);

        $this->withHeaders($this->authHeader($manager))
            ->postJson("/api/manager/visit-invoice-adjustments/{$adjustment->id}/reject", [
                'reason' => 'Outside policy',
            ])
            ->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'invoice_adjustment_rejected',
            'reference_id' => $adjustment->id,
        ]);
    }
}
