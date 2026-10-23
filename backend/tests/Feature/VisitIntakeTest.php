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
 * Intake: front-desk check-in and the hand-off into consultation.
 * The triage stage was removed — a checked-in visit waits for the vet
 * directly.
 */
class VisitIntakeTest extends TestCase
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
            'status' => 'scheduled',
            'scheduled_at' => now()->addHour(),
        ], $overrides));
    }

    public function test_receptionist_can_check_in_a_scheduled_appointment(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/appointments/{$appointment->id}/check-in")
            ->assertOk()
            ->assertJsonPath('appointment.status', 'checked_in');

        $appointment->refresh();
        $this->assertNotNull($appointment->checked_in_at);
        $this->assertSame($receptionist->id, (int) $appointment->checked_in_by);
        $this->assertFalse((bool) $appointment->emergency);
    }

    public function test_check_in_is_idempotent_and_keeps_the_original_stamp(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);

        $headers = $this->authHeader($receptionist);
        $this->withHeaders($headers)
            ->postJson("/api/receptionist/appointments/{$appointment->id}/check-in")
            ->assertOk();

        $firstStamp = $appointment->fresh()->checked_in_at;

        $this->withHeaders($headers)
            ->postJson("/api/receptionist/appointments/{$appointment->id}/check-in")
            ->assertOk()
            ->assertJsonPath('appointment.status', 'checked_in');

        $this->assertSame(
            $firstStamp->toDateTimeString(),
            $appointment->fresh()->checked_in_at->toDateTimeString()
        );
    }

    public function test_check_in_on_a_visit_past_intake_is_a_no_op(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet, ['status' => 'checkout']);

        // Idempotent: the endpoint returns the visit unchanged rather than
        // resurrecting it into the intake pipeline.
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/appointments/{$appointment->id}/check-in")
            ->assertOk()
            ->assertJsonPath('appointment.status', 'checkout');

        $fresh = $appointment->fresh();
        $this->assertSame('checkout', $fresh->status);
        $this->assertNull($fresh->checked_in_at);
    }

    public function test_vet_tech_can_flag_an_emergency_check_in(): void
    {
        $tech = $this->userWithToken('vet_tech');
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);

        $this->withHeaders($this->authHeader($tech))
            ->postJson("/api/veterinary/appointments/{$appointment->id}/check-in", [
                'is_emergency' => true,
            ])
            ->assertOk()
            ->assertJsonPath('appointment.status', 'checked_in')
            ->assertJsonPath('appointment.emergency', true);
    }

    public function test_queue_orders_emergencies_then_earliest_check_in(): void
    {
        $vet = $this->userWithToken('veterinary');

        // Checked in earliest, not an emergency.
        $early = $this->makeAppointment($vet, [
            'status' => 'checked_in',
            'checked_in_at' => now()->subMinutes(30),
        ]);
        // Emergency flag beats everything even though it checked in last.
        $emergency = $this->makeAppointment($vet, [
            'status' => 'checked_in',
            'emergency' => true,
            'checked_in_at' => now()->subMinutes(5),
        ]);
        // Checked in between the two.
        $middle = $this->makeAppointment($vet, [
            'status' => 'checked_in',
            'checked_in_at' => now()->subMinutes(10),
        ]);

        $queue = $this->withHeaders($this->authHeader($vet))
            ->getJson('/api/veterinary/appointments')
            ->assertOk()
            ->json('data');

        $ids = collect($queue)->pluck('id')->toArray();
        $this->assertSame(
            [$emergency->id, $early->id, $middle->id],
            array_values(array_intersect($ids, [$emergency->id, $early->id, $middle->id]))
        );
    }

    public function test_vet_tech_cannot_start_a_consultation_or_reach_clinical_routes(): void
    {
        $tech = $this->userWithToken('vet_tech');
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet, [
            'status' => 'checked_in',
            'checked_in_at' => now(),
        ]);

        $this->withHeaders($this->authHeader($tech))
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start")
            ->assertStatus(403);

        $this->assertSame('checked_in', $appointment->fresh()->status);
    }

    public function test_veterinarian_can_start_a_checked_in_visit_and_a_draft_record_is_created(): void
    {
        $vet = $this->userWithToken('veterinary');
        $receptionist = $this->userWithToken('receptionist');
        $appointment = $this->makeAppointment($vet);

        // Intake chain: check-in -> start.
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/appointments/{$appointment->id}/check-in")
            ->assertOk();

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start")
            ->assertOk();

        $fresh = $appointment->fresh();
        $this->assertSame('in_consultation', $fresh->status);
        $this->assertNotNull($fresh->started_at);
        $this->assertNotNull($fresh->checked_in_at);
        $this->assertNotNull(
            MedicalRecord::where('appointment_id', $appointment->id)
                ->where('status', MedicalRecord::STATUS_DRAFT)
                ->first()
        );
    }

    public function test_clinical_completion_moves_the_visit_to_checkout_until_paid(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->makeAppointment($vet);

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start")
            ->assertOk();

        // Clinical completion requires a finalized medical record first.
        $record = MedicalRecord::where('appointment_id', $appointment->id)->firstOrFail();
        $this->withHeaders($this->authHeader($vet))
            ->putJson("/api/veterinary/medical-records/{$record->id}", [
                'appointment_id' => $appointment->id,
                'pet_id' => $appointment->pet_id,
                'visit_date' => now()->toISOString(),
                'diagnosis' => 'Healthy',
                'treatment_plan' => 'None needed',
                'status' => 'finalized',
            ])
            ->assertOk()
            ->assertJsonPath('record.status', 'finalized');

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/consultations/{$appointment->id}/complete", [
                'diagnosis' => 'Healthy',
                'treatment_notes' => 'None needed',
            ])
            ->assertOk()
            ->assertJsonPath('consultation.status', 'checkout');

        $fresh = $appointment->fresh();
        $this->assertSame('checkout', $fresh->status);
        // Final closure is automatic — never stamped at clinical completion.
        $this->assertNull($fresh->completed_at);
    }
}
