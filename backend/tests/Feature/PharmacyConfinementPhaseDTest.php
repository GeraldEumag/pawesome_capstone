<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Dispensation;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\InventoryMonthlyAudit;
use App\Models\MedicalConfinement;
use App\Models\MedicationAdministrationRecord;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceItemUsage;
use App\Models\User;
use App\Models\Vaccination;
use App\Models\VisitConsent;
use App\Models\WardBed;
use App\Services\ConfinementAccrualService;
use App\Services\MarService;
use App\Services\VaccinationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Phase D: pharmacy/dispensing, controlled drugs, vaccination batch/expiry,
 * ward beds, MAR, and the redesigned confinement lifecycle.
 */
class PharmacyConfinementPhaseDTest extends TestCase
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

    private function makeItem(array $overrides = []): InventoryItem
    {
        return InventoryItem::factory()->create(array_merge([
            'status' => 'active',
            'stock' => 50,
            'price' => 100,
            'item_class' => 'medicine',
        ], $overrides));
    }

    private function makeBatch(InventoryItem $item, array $overrides = []): InventoryBatch
    {
        return InventoryBatch::create(array_merge([
            'inventory_item_id' => $item->id,
            'batch_no' => 'B-' . strtoupper(uniqid()),
            'received_date' => now()->subWeek(),
            'expiration_date' => now()->addMonths(6),
            'quantity' => 20,
            'remaining_quantity' => 20,
            'unit_cost' => 50,
            'status' => 'active',
        ], $overrides));
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
            'scheduled_at' => now(),
        ], $overrides));
    }

    private function makeConfinement(Appointment $appointment, array $overrides = []): MedicalConfinement
    {
        return MedicalConfinement::create(array_merge([
            'consultation_id' => $appointment->id,
            'customer_id' => $appointment->customer_id,
            'customer_email' => $appointment->customer?->email,
            'customer_name' => $appointment->customer?->name,
            'pet_id' => $appointment->pet_id,
            'pet_name' => $appointment->pet?->name,
            'vet_id' => $appointment->veterinarian_id,
            'diagnosis' => 'Test diagnosis',
            'reason_for_confinement' => 'Observation',
            'status' => 'admitted',
            'payment_status' => 'unpaid',
            'admitted_at' => now(),
        ], $overrides));
    }

    // ── Dispensing ─────────────────────────────────────────────────

    public function test_dispense_moves_stock_and_bills_the_visit(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $item = $this->makeItem(['price' => 150]);
        $this->makeBatch($item);

        $this->withHeaders($this->authHeader($vet))
            ->postJson('/api/veterinary/dispensations', [
                'inventory_item_id' => $item->id,
                'appointment_id' => $appointment->id,
                'quantity' => 3,
                'label_text' => 'Give one tablet twice daily',
            ])
            ->assertCreated()
            ->assertJsonPath('dispensation.status', 'dispensed');

        $this->assertSame(47, (int) $item->fresh()->stock);
        $this->assertDatabaseHas('service_item_usages', [
            'appointment_id' => $appointment->id,
            'inventory_item_id' => $item->id,
            'usage_type' => 'dispensed_medication',
            'quantity_used' => 3,
            'charge_amount' => 450.00,
        ]);
    }

    public function test_mar_schedule_does_not_move_stock_but_administer_does(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $confinement = $this->makeConfinement($appointment);
        $item = $this->makeItem(['price' => 80]);
        $this->makeBatch($item);

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/medical-confinements/{$confinement->id}/mar", [
                'inventory_item_id' => $item->id,
                'dose' => '5 mg',
                'scheduled_at' => now()->addHour(),
            ])
            ->assertCreated();

        // Draft — no stock movement yet.
        $this->assertSame(50, (int) $item->fresh()->stock);
        $this->assertSame(0, ServiceItemUsage::where('appointment_id', $appointment->id)->count());

        $mar = MedicationAdministrationRecord::firstOrFail();
        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/medical-confinements/{$confinement->id}/mar/{$mar->id}/administer", [
                'quantity' => 2,
            ])
            ->assertOk();

        $this->assertSame(48, (int) $item->fresh()->stock);
        $this->assertDatabaseHas('service_item_usages', [
            'appointment_id' => $appointment->id,
            'usage_type' => 'medication_administration',
            'quantity_used' => 2,
        ]);
        $this->assertSame('administered', $mar->fresh()->status);

        // Idempotent — a second confirm does not double-deduct.
        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/medical-confinements/{$confinement->id}/mar/{$mar->id}/administer")
            ->assertOk();
        $this->assertSame(48, (int) $item->fresh()->stock);
    }

    // ── Expired batches ────────────────────────────────────────────

    public function test_expired_batch_is_rejected_for_dispensing_and_vaccination(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $item = $this->makeItem();
        $expired = $this->makeBatch($item, ['expiration_date' => now()->subDay(), 'status' => 'expired']);

        $this->withHeaders($this->authHeader($vet))
            ->postJson('/api/veterinary/dispensations', [
                'inventory_item_id' => $item->id,
                'inventory_batch_id' => $expired->id,
                'quantity' => 1,
            ])
            ->assertStatus(422);

        $this->assertSame(50, (int) $item->fresh()->stock);

        $this->expectException(\RuntimeException::class);
        VaccinationService::administer([
            'pet_id' => $appointment->pet_id,
            'veterinarian_id' => $vet->id,
            'vaccine_name' => 'Rabies',
            'inventory_batch_id' => $expired->id,
            'date_administered' => now()->toDateString(),
            'status' => 'given',
        ]);
    }

    // ── Vaccinations ───────────────────────────────────────────────

    public function test_vaccination_persists_lot_expiry_and_certificate_shows_them(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $vaccineItem = $this->makeItem(['item_class' => 'vaccine']);
        $batch = $this->makeBatch($vaccineItem, [
            'batch_no' => 'LOT-99127',
            'expiration_date' => now()->addMonths(9),
        ]);

        $vaccination = VaccinationService::administer([
            'pet_id' => $appointment->pet_id,
            'veterinarian_id' => $vet->id,
            'vaccine_name' => 'Rabies',
            'vaccine_type' => 'Core',
            'inventory_batch_id' => $batch->id,
            'date_administered' => now()->toDateString(),
            'next_due_date' => now()->addYear()->toDateString(),
            'site_of_administration' => 'Right shoulder',
            'status' => 'given',
        ]);

        // One dose deducted; lot + expiry snapshotted onto the record.
        $this->assertSame(19, (int) $batch->fresh()->remaining_quantity);
        $this->assertSame('LOT-99127', $vaccination->lot_number);
        $this->assertSame($batch->expiration_date->toDateString(), $vaccination->vaccine_expiry_date->toDateString());
        $this->assertSame('Right shoulder', $vaccination->site_of_administration);

        $cert = VaccinationService::certificate($vaccination->fresh());
        $this->assertSame('LOT-99127', $cert['vaccine']['lot_number']);
        $this->assertSame($batch->expiration_date->toDateString(), $cert['vaccine']['expiry_date']);
        $this->assertSame('Right shoulder', $cert['vaccine']['site']);
    }

    // ── Monthly audit variance approval ────────────────────────────

    public function test_inventory_audit_variance_needs_manager_approval(): void
    {
        $inventory = $this->userWithToken('inventory');
        $manager = $this->userWithToken('manager');
        $item = $this->makeItem();

        $audit = InventoryMonthlyAudit::create([
            'inventory_item_id' => $item->id,
            'system_stock' => 50,
            'actual_stock' => 47,
            'variance' => -3,
            'audit_month' => now()->format('Y-m'),
            'status' => 'discrepancy',
            'approval_status' => 'pending',
            'reason' => 'Cycle count shortfall',
            'checked_by' => $inventory->id,
        ]);

        $this->withHeaders($this->authHeader($manager))
            ->postJson("/api/manager/inventory-audits/{$audit->id}/approve")
            ->assertOk()
            ->assertJsonPath('audit.approval_status', 'approved');

        $this->assertSame($manager->id, (int) $audit->fresh()->approved_by);
        $this->assertNotNull($audit->fresh()->approved_at);
    }

    // ── Ward beds + confinement lifecycle ──────────────────────────

    public function test_ward_bed_assignment_moves_to_bed_assigned(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $confinement = $this->makeConfinement($appointment, ['status' => 'consented']);
        $bed = WardBed::create(['name' => 'ISO-1', 'ward' => 'isolation', 'is_isolation' => true, 'daily_rate' => 800]);
        $occupied = WardBed::create(['name' => 'GEN-1', 'ward' => 'general', 'daily_rate' => 500, 'status' => 'occupied']);

        // Available beds only (isolation flagged, occupied hidden).
        $beds = $this->withHeaders($this->authHeader($receptionist))
            ->getJson('/api/receptionist/ward-beds')
            ->assertOk()
            ->json('ward_beds');
        $this->assertCount(1, $beds);
        $this->assertTrue((bool) $beds[0]['is_isolation']);

        // Occupied beds cannot be assigned.
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/medical-confinements/{$confinement->id}/assign-bed", [
                'ward_bed_id' => $occupied->id,
            ])
            ->assertStatus(422);

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/medical-confinements/{$confinement->id}/assign-bed", [
                'ward_bed_id' => $bed->id,
                'deposit_amount' => 1000,
            ])
            ->assertOk()
            ->assertJsonPath('medical_confinement.status', 'bed_assigned')
            ->assertJsonPath('medical_confinement.daily_rate', '800.00');

        $this->assertSame('1000.00', $confinement->fresh()->deposit_amount);
    }

    public function test_legacy_completed_status_maps_to_discharged(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $confinement = $this->makeConfinement($appointment, ['status' => 'completed']);

        $this->assertSame('discharged', $confinement->fresh()->status);
        $this->assertSame('discharged', \App\Support\ConfinementStatusMap::forward('completed'));
        $this->assertSame('under_care', \App\Support\ConfinementStatusMap::forward('under_treatment'));
        $this->assertSame('bed_assigned', \App\Support\ConfinementStatusMap::forward('approved_for_admission'));
    }

    public function test_care_level_changes_and_discharge_clearance(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $confinement = $this->makeConfinement($appointment);

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/medical-confinements/{$confinement->id}/mark-critical")
            ->assertOk();

        $fresh = $confinement->fresh();
        $this->assertSame('under_care', $fresh->status);
        $this->assertSame('critical', $fresh->care_level);

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/medical-confinements/{$confinement->id}/clear-for-discharge")
            ->assertOk()
            ->assertJsonPath('medical_confinement.status', 'ready_for_discharge');
    }

    // ── Daily accrual ──────────────────────────────────────────────

    public function test_daily_accrual_posts_interim_invoice_lines_once_per_day(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $confinement = $this->makeConfinement($appointment, [
            'daily_rate' => 800,
            'admitted_at' => now()->subDays(3),
            'last_accrual_at' => now()->subDays(3),
        ]);

        $result = ConfinementAccrualService::accrue($confinement);
        $this->assertSame(3, $result['accrued_days']);
        $this->assertSame(2400.0, $result['amount']);

        $this->assertSame(3, ServiceItemUsage::where('appointment_id', $appointment->id)
            ->where('usage_type', 'inpatient_accrual')->count());

        // Idempotent — same-day rerun adds nothing.
        $rerun = ConfinementAccrualService::accrue($confinement->fresh());
        $this->assertSame(0, $rerun['accrued_days']);
    }

    // ── Release: financial clearance + manager override ────────────

    public function test_release_requires_financial_clearance(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $confinement = $this->makeConfinement($appointment, ['status' => 'ready_for_discharge']);

        // Unpaid + no override → blocked.
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/medical-confinements/{$confinement->id}/release")
            ->assertStatus(422);

        // Settled → released, bed freed.
        $confinement->update(['payment_status' => 'paid']);
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/medical-confinements/{$confinement->id}/release")
            ->assertOk()
            ->assertJsonPath('medical_confinement.status', 'discharged');

        $this->assertSame('discharged', $confinement->fresh()->status);
    }

    public function test_manager_override_release_is_logged(): void
    {
        $manager = $this->userWithToken('manager');
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);
        $confinement = $this->makeConfinement($appointment, ['status' => 'ready_for_discharge']);

        // A receptionist cannot self-approve an override.
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/medical-confinements/{$confinement->id}/release", [
                'override_reason' => 'Customer is a long-time client, paying tomorrow',
            ])
            ->assertStatus(422);

        // Manager override with reason releases and logs both entries.
        $this->withHeaders($this->authHeader($manager))
            ->postJson("/api/manager/medical-confinements/{$confinement->id}/release", [
                'override_reason' => 'Customer is a long-time client, paying tomorrow',
            ])
            ->assertOk()
            ->assertJsonPath('medical_confinement.status', 'discharged');

        $fresh = $confinement->fresh();
        $this->assertSame($manager->id, (int) $fresh->override_by);
        $this->assertSame('Customer is a long-time client, paying tomorrow', $fresh->override_reason);
        $this->assertNotNull($fresh->override_at);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'confinement_release_override',
            'reference_id' => $confinement->id,
        ]);
    }
}
