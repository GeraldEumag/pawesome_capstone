<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\MedicalRecord;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Final-stage audit probes: runtime authorization evidence for the
 * Veterinary role audit (docs/audit/veterinary/). Covers surface areas not
 * already asserted by AuthorizationMatrixTest / VisitIntakeTest /
 * VetBatch4SystemTest: unauthenticated sweeps, wrong-role sweeps across the
 * clinical surface, and cross-veterinarian IDOR on mutation endpoints.
 */
class VeterinaryFinalAuditProbeTest extends TestCase
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

    public function test_unauthenticated_requests_get_401_across_the_veterinary_surface(): void
    {
        $vet = User::factory()->create(['role' => 'veterinary', 'is_active' => true]);
        $appointment = $this->makeAppointment($vet);
        $record = MedicalRecord::create([
            'appointment_id' => $appointment->id,
            'pet_id' => $appointment->pet_id,
            'veterinarian_id' => $vet->id,
            'visit_date' => now(),
            'diagnosis' => 'Probe record',
        ]);

        $probes = [
            ['getJson', '/api/veterinary/dashboard'],
            ['getJson', '/api/veterinary/appointments'],
            ['getJson', '/api/veterinary/history'],
            ['getJson', '/api/veterinary/patients'],
            ['getJson', "/api/veterinary/appointments/{$appointment->id}"],
            ['postJson', "/api/veterinary/appointments/{$appointment->id}/check-in"],
            ['postJson', "/api/veterinary/consultations/{$appointment->id}/start"],
            ['postJson', "/api/veterinary/consultations/{$appointment->id}/complete"],
            ['getJson', '/api/veterinary/medical-records'],
            ['postJson', '/api/veterinary/medical-records'],
            ['getJson', "/api/veterinary/medical-records/{$record->id}"],
            ['putJson', "/api/veterinary/medical-records/{$record->id}"],
            ['getJson', '/api/veterinary/medical-confinements'],
            ['getJson', '/api/veterinary/inventory-items'],
            ['postJson', "/api/veterinary/appointments/{$appointment->id}/diagnostics"],
            ['getJson', "/api/veterinary/appointments/{$appointment->id}/consents"],
            ['postJson', '/api/veterinary/consents'],
            ['postJson', "/api/veterinary/consultations/{$appointment->id}/recommend-confinement"],
            ['getJson', '/api/veterinary/reports'],
        ];

        foreach ($probes as [$method, $uri]) {
            $this->{$method}($uri)->assertStatus(401)->assertJsonMissing(['data']);
        }
    }

    public function test_non_clinical_roles_get_403_on_clinical_endpoints(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet, ['status' => 'checked_in', 'checked_in_at' => now()]);

        foreach (['customer', 'receptionist', 'cashier', 'inventory', 'vet_tech'] as $role) {
            $actor = $this->userWithToken($role);

            // Clinical reads
            $this->withHeaders($this->authHeader($actor))
                ->getJson('/api/veterinary/dashboard')->assertStatus(403);
            $this->withHeaders($this->authHeader($actor))
                ->getJson('/api/veterinary/history')->assertStatus(403);
            $this->withHeaders($this->authHeader($actor))
                ->getJson('/api/veterinary/medical-records')->assertStatus(403);

            // Clinical writes
            $this->withHeaders($this->authHeader($actor))
                ->postJson("/api/veterinary/consultations/{$appointment->id}/start")->assertStatus(403);
            $this->withHeaders($this->authHeader($actor))
                ->postJson("/api/veterinary/consultations/{$appointment->id}/complete")->assertStatus(403);
            $this->withHeaders($this->authHeader($actor))
                ->postJson('/api/veterinary/medical-records', [
                    'pet_id' => $appointment->pet_id,
                    'appointment_id' => $appointment->id,
                    'visit_date' => now()->toISOString(),
                    'diagnosis' => 'x',
                ])->assertStatus(403);
            $this->withHeaders($this->authHeader($actor))
                ->postJson("/api/veterinary/appointments/{$appointment->id}/diagnostics", [
                    'name' => 'CBC',
                ])->assertStatus(403);
            $this->withHeaders($this->authHeader($actor))
                ->postJson("/api/veterinary/consultations/{$appointment->id}/recommend-confinement", [
                    'reason' => 'obs', 'priority' => 'normal',
                ])->assertStatus(403);
            $this->withHeaders($this->authHeader($actor))
                ->postJson("/api/veterinary/appointments/{$appointment->id}/inventory-usage", [
                    'items' => [['inventory_item_id' => 1, 'quantity' => 1]],
                ])->assertStatus(403);
        }
    }

    public function test_veterinarian_cannot_mutate_an_appointment_assigned_to_another_vet(): void
    {
        $ownerVet = $this->userWithToken('veterinary');
        $intruder = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($ownerVet, ['status' => 'checked_in', 'checked_in_at' => now()]);

        $headers = $this->authHeader($intruder);

        // Start is routed through canAccessAppointment → foreign vet gets 404.
        $this->withHeaders($headers)
            ->postJson("/api/veterinary/appointments/{$appointment->id}/start")
            ->assertStatus(404);

        // Generic status patch likewise.
        $this->withHeaders($headers)
            ->patchJson("/api/veterinary/appointments/{$appointment->id}/status", ['status' => 'in_consultation'])
            ->assertStatus(404);

        // Consultation complete: state guard (not in STARTED) trips first → 422.
        // The assigned-vet check runs inside the workflow; a foreign vet can
        // never reach the mutation regardless of which guard answers first.
        $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/complete")
            ->assertStatus(422);

        // Nothing changed.
        $this->assertSame('checked_in', $appointment->fresh()->status);
    }

    public function test_veterinarian_cannot_create_medical_record_for_foreign_pet_without_appointment(): void
    {
        $vet = $this->userWithToken('veterinary');
        $foreignPet = Pet::factory()->create(); // no appointment links vet to this pet

        // Controller returns 404 for a pet outside the vet's assignment scope
        // (no existence leak) — must not be 2xx.
        $this->withHeaders($this->authHeader($vet))
            ->postJson('/api/veterinary/medical-records', [
                'pet_id' => $foreignPet->id,
                'visit_date' => now()->toISOString(),
                'diagnosis' => 'unauthorized record',
            ])
            ->assertStatus(404);

        $this->assertDatabaseMissing('medical_records', ['pet_id' => $foreignPet->id]);
    }

    public function test_vet_tech_read_board_but_clinical_routes_all_forbidden(): void
    {
        $tech = $this->userWithToken('vet_tech');
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet, ['status' => 'checked_in', 'checked_in_at' => now()]);
        $headers = $this->authHeader($tech);

        $this->withHeaders($headers)->getJson('/api/veterinary/appointments')->assertOk();
        $this->withHeaders($headers)
            ->postJson("/api/veterinary/appointments/{$appointment->id}/check-in")->assertOk();

        $this->withHeaders($headers)
            ->getJson("/api/veterinary/appointments/{$appointment->id}")->assertStatus(403);
        $this->withHeaders($headers)
            ->postJson("/api/veterinary/appointments/{$appointment->id}/diagnostics", ['name' => 'CBC'])
            ->assertStatus(403);

        // Specimen collection IS a vet_tech responsibility — a real order must
        // collect successfully rather than be denied.
        $order = \App\Models\DiagnosticOrder::create([
            'appointment_id' => $appointment->id,
            'code' => 'DX-PROBE-1',
            'name' => 'CBC',
            'order_type' => 'lab',
            'status' => 'ordered',
            'ordered_by' => $vet->id,
            'ordered_at' => now(),
        ]);

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/diagnostics/{$order->id}/collect")
            ->assertOk()
            ->assertJsonPath('order.status', 'collected');
    }

    public function test_medical_record_list_view_writes_a_single_clinical_access_log(): void
    {
        $vet = $this->userWithToken('veterinary');

        $this->withHeaders($this->authHeader($vet))
            ->getJson('/api/veterinary/medical-records?status=draft')
            ->assertOk();

        $logs = \App\Models\ActivityLog::where('category', 'clinical_access')
            ->where('action', 'clinical_record_viewed')
            ->where('reference_type', 'medical_record')
            ->where('user_id', $vet->id)
            ->get();

        // Exactly one entry per request — count + filters in metadata,
        // no record contents (search terms deliberately excluded).
        $this->assertCount(1, $logs);
        $this->assertStringContainsString('list', $logs->first()->description);
        $this->assertSame('draft', $logs->first()->metadata['filters']['status'] ?? null);
    }
}
