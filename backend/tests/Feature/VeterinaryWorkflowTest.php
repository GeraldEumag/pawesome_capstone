<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\MedicalConfinement;
use App\Models\MedicalRecord;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class VeterinaryWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

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

    public function test_veterinary_dashboard_only_shows_assigned_workflow_records(): void
    {
        $vet = $this->userWithToken('veterinary');
        $otherVet = $this->userWithToken('veterinary');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create();

        $ownAppointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => now()->addHour(),
        ]);

        Appointment::factory()->create([
            'veterinarian_id' => $otherVet->id,
            'status' => 'scheduled',
            'scheduled_at' => now()->addHour(),
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->getJson('/api/veterinary/dashboard')
            ->assertOk()
            ->assertJsonPath('approved_appointments', 1)
            ->assertJsonPath('total_patients', 1);

        $this->withHeaders($this->authHeader($vet))
            ->getJson('/api/veterinary/appointments')
            ->assertOk()
            ->assertJsonFragment(['id' => $ownAppointment->id]);
    }

    public function test_veterinary_can_create_start_complete_and_edit_assigned_appointment(): void
    {
        $vet = $this->userWithToken('veterinary');
        $cashier = $this->userWithToken('cashier');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create(['price' => 750]);

        $createResponse = $this->withHeaders($this->authHeader($vet))
            ->postJson('/api/veterinary/appointments', [
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'scheduled_at' => now()->addDay()->setTime(10, 0)->format('Y-m-d H:i:s'),
                'notes' => 'Initial consult',
            ])
            ->assertCreated()
            ->assertJsonPath('appointment.veterinarian_id', $vet->id)
            ->assertJsonPath('appointment.status', 'scheduled');

        $appointmentId = $createResponse->json('appointment.id');

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointmentId}/start")
            ->assertOk()
            ->assertJsonPath('appointment.status', 'in_consultation')
            ->assertJsonPath('appointment.started_at', fn ($value) => !empty($value));

        $record = MedicalRecord::where('appointment_id', $appointmentId)->firstOrFail();
        $record->update([
            'diagnosis' => 'Routine wellness consultation',
            'treatment_plan' => 'Continue observation and home care',
            'status' => MedicalRecord::STATUS_FINALIZED,
        ]);

        $this->withHeaders($this->authHeader($cashier))
            ->postJson("/api/appointments/{$appointmentId}/pay")
            ->assertOk()
            ->assertJsonPath('appointment.payment_status', 'paid');

        $this->withHeaders($this->authHeader($cashier))
            ->postJson("/api/appointments/{$appointmentId}/pay")
            ->assertStatus(422);

        // Payment verification now records a settlement, not a POS sale row
        $this->assertDatabaseHas('payment_settlements', [
            'settleable_type' => 'appointment',
            'settleable_id' => $appointmentId,
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointmentId}/complete")
            ->assertNotFound();

        $initialSchedule = Carbon::now('Asia/Manila')->addDay()->setTime(10, 0);
        $updatedSchedule = Carbon::now('Asia/Manila')->addDays(2)->setTime(10, 0);
        $editableAppointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => $initialSchedule->copy()->utc(),
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->putJson("/api/veterinary/appointments/{$editableAppointment->id}", [
                'service_id' => $service->id,
                'scheduled_at' => $updatedSchedule->copy()->utc()->toISOString(),
                'notes' => 'Updated consult',
            ])
            ->assertOk()
            ->assertJsonPath('notes', 'Updated consult');

        $this->assertDatabaseHas('appointments', [
            'id' => $editableAppointment->id,
            'scheduled_at' => $updatedSchedule->copy()->utc()->format('Y-m-d H:i:s'),
        ]);
    }

    public function test_confinement_recommendation_can_still_finalize_bill_and_complete_appointment(): void
    {
        $vet = $this->userWithToken('veterinary');
        $cashier = $this->userWithToken('cashier');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'Emergency Consultation',
            'category' => 'Consultation',
            'price' => 800,
        ]);
        $appointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => now()->addHour(),
            'price' => 800,
            'booking_channel' => 'walk_in',
        ]);
        $headers = $this->authHeader($vet);

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/appointments/{$appointment->id}/start")
            ->assertOk()
            ->assertJsonPath('appointment.status', 'in_consultation');

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/recommend-confinement", [
                'diagnosis' => 'Severe dehydration',
                'reason_for_confinement' => 'Needs IV fluids and monitoring',
                'urgency_level' => 'urgent',
                'expected_stay_days' => 2,
                'treatment_plan' => 'IV fluids and repeat vitals',
                'estimated_cost' => 2500,
            ])
            ->assertCreated();

        $appointment->refresh();
        // The visit stays in the active clinical workflow; the recommendation
        // is carried by the flag, not by a dedicated status.
        $this->assertSame('in_consultation', $appointment->status);
        $this->assertTrue((bool) $appointment->confinement_recommended);
        $this->assertDatabaseHas('medical_confinements', [
            'consultation_id' => $appointment->id,
            'vet_id' => $vet->id,
            'status' => 'recommended',
        ]);

        $record = MedicalRecord::where('appointment_id', $appointment->id)->firstOrFail();
        $this->withHeaders($headers)
            ->putJson("/api/veterinary/medical-records/{$record->id}", [
                'appointment_id' => $appointment->id,
                'pet_id' => $pet->id,
                'visit_date' => now()->toISOString(),
                'diagnosis' => 'Severe dehydration',
                'treatment_plan' => 'IV fluids and repeat vitals',
                'status' => 'finalized',
            ])
            ->assertOk()
            ->assertJsonPath('record.status', 'finalized');

        $this->withHeaders($headers)
            ->putJson("/api/veterinary/medical-records/{$record->id}", [
                'appointment_id' => $appointment->id,
                'pet_id' => $pet->id,
                'visit_date' => now()->toISOString(),
                'diagnosis' => 'Changed after finalization',
                'status' => 'draft',
            ])
            ->assertForbidden();
        $this->assertSame('Severe dehydration', $record->fresh()->diagnosis);
        $this->assertSame('finalized', $record->fresh()->status);

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/complete", [
                'diagnosis' => 'Severe dehydration',
                'treatment_notes' => 'IV fluids and repeat vitals',
            ])
            ->assertOk()
            ->assertJsonPath('consultation.status', 'clinical_complete');

        $this->withHeaders($this->authHeader($cashier))
            ->postJson("/api/appointments/{$appointment->id}/pay")
            ->assertOk()
            ->assertJsonPath('appointment.payment_status', 'paid');

        $this->withHeaders($headers)
            ->getJson("/api/veterinary/receipt/{$appointment->id}")
            ->assertOk()
            ->assertJsonPath('receipt.total', 800)
            ->assertJsonPath('receipt.breakdown.vat_amount', 85.71);

        // Visit stays open while the confinement is still active — payment is
        // settled, but the open confinement blocks automatic closure.
        $appointment->refresh();
        $this->assertSame('clinical_complete', $appointment->status);

        $confinement = MedicalConfinement::where('consultation_id', $appointment->id)->firstOrFail();
        $confinement->update(['status' => 'ready_for_discharge', 'payment_status' => 'paid']);

        $this->withHeaders($this->authHeader($this->userWithToken('receptionist')))
            ->postJson("/api/receptionist/medical-confinements/{$confinement->id}/release")
            ->assertOk();

        $this->assertSame('completed', $appointment->fresh()->status);
    }

    public function test_veterinary_confinement_list_is_visible_to_clinical_staff_and_cross_vet_access_is_logged(): void
    {
        $vet = $this->userWithToken('veterinary');
        $otherVet = $this->userWithToken('veterinary');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $appointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'veterinarian_id' => $vet->id,
        ]);
        $otherAppointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'veterinarian_id' => $otherVet->id,
        ]);

        $ownConfinement = MedicalConfinement::create([
            'consultation_id' => $appointment->id,
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'vet_id' => $vet->id,
            'diagnosis' => 'Own patient',
            'reason_for_confinement' => 'Observation',
            'status' => 'recommended',
        ]);
        $otherConfinement = MedicalConfinement::create([
            'consultation_id' => $otherAppointment->id,
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'vet_id' => $otherVet->id,
            'diagnosis' => 'Other patient',
            'reason_for_confinement' => 'Observation',
            'status' => 'recommended',
        ]);

        $response = $this->withHeaders($this->authHeader($vet))
            ->getJson('/api/veterinary/medical-confinements')
            ->assertOk();

        $ids = collect($response->json('medical_confinements'))->pluck('id');
        $this->assertContains($ownConfinement->id, $ids);
        $this->assertContains($otherConfinement->id, $ids);
        $this->assertCount(2, $ids);

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $vet->id,
            'category' => 'clinical_access',
            'action' => 'clinical_record_viewed',
        ]);
    }

    public function test_completed_appointment_leaves_active_board_stays_in_history_and_pet_records(): void
    {
        $vet = $this->userWithToken('veterinary');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create();

        $completed = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'completed',
            'scheduled_at' => now()->subDay(),
        ]);

        MedicalRecord::create([
            'appointment_id' => $completed->id,
            'pet_id' => $pet->id,
            'veterinarian_id' => $vet->id,
            'visit_date' => now(),
            'diagnosis' => 'Completed consultation record',
            'status' => MedicalRecord::STATUS_FINALIZED,
        ]);

        // Active board excludes terminal appointments.
        $this->withHeaders($this->authHeader($vet))
            ->getJson('/api/veterinary/appointments')
            ->assertOk()
            ->assertJsonMissing(['id' => $completed->id]);

        // History retains the completed appointment.
        $this->withHeaders($this->authHeader($vet))
            ->getJson('/api/veterinary/history?status=completed')
            ->assertOk()
            ->assertJsonFragment(['id' => $completed->id]);

        // The pet's medical history includes the appointment-linked record.
        $this->withHeaders($this->authHeader($vet))
            ->getJson("/api/veterinary/pets/{$pet->id}/medical-records")
            ->assertOk()
            ->assertJsonFragment(['appointment_id' => $completed->id]);
    }

    public function test_veterinary_can_update_status_with_patch_for_list_actions(): void
    {
        $vet = $this->userWithToken('vet');
        $appointment = Appointment::factory()->create([
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => now()->addHour(),
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->patchJson("/api/veterinary/appointments/{$appointment->id}/status", [
                'status' => 'in_consultation',
            ])
            ->assertOk()
            ->assertJsonPath('appointment.status', 'in_consultation');
    }

    public function test_veterinary_must_finalize_consultation_before_completion_and_cannot_close_visit_directly(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = Appointment::factory()->create([
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => now()->addHour(),
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointment->id}/start")
            ->assertOk();

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointment->id}/complete")
            ->assertNotFound();

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/consultations/{$appointment->id}/complete")
            ->assertStatus(422)
            ->assertJsonPath('error', 'Save and finalize the medical record before completing this consultation');
    }

    public function test_other_veterinarian_can_read_appointment_detail_but_access_is_logged(): void
    {
        $vet = $this->userWithToken('veterinary');
        $otherVet = $this->userWithToken('veterinary');
        $appointment = Appointment::factory()->create([
            'veterinarian_id' => $otherVet->id,
            'status' => 'scheduled',
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->getJson("/api/veterinary/appointments/{$appointment->id}")
            ->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $vet->id,
            'category' => 'clinical_access',
            'reference_type' => 'appointment',
            'reference_id' => $appointment->id,
        ]);

        // Writes stay assignment-scoped: the other vet cannot start the visit.
        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start")
            ->assertForbidden();
    }

    public function test_cashier_marking_the_bill_paid_closes_the_visit_automatically(): void
    {
        $vet = $this->userWithToken('veterinary');
        $cashier = $this->userWithToken('cashier');
        $appointment = Appointment::factory()->create([
            'veterinarian_id' => $vet->id,
            'status' => 'in_consultation',
            'scheduled_at' => now()->addHour(),
            'price' => 500,
        ]);
        $headers = $this->authHeader($vet);

        MedicalRecord::create([
            'appointment_id' => $appointment->id,
            'pet_id' => $appointment->pet_id,
            'veterinarian_id' => $vet->id,
            'visit_date' => now(),
            'diagnosis' => 'Routine check',
            'status' => MedicalRecord::STATUS_FINALIZED,
        ]);

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/complete", ['diagnosis' => 'Routine check'])
            ->assertOk()
            ->assertJsonPath('consultation.status', 'checkout');

        $itemIds = collect($this->withHeaders($headers)
            ->getJson("/api/billing/veterinary/{$appointment->id}/summary")
            ->assertOk()
            ->json('billing.items'))
            ->where('is_paid', false)
            ->where('is_billable', true)
            ->pluck('id')
            ->values()
            ->all();
        $this->assertNotEmpty($itemIds);

        $this->withHeaders($this->authHeader($cashier))
            ->patchJson('/api/billing/items/mark-paid', [
                'item_ids' => $itemIds,
                'payment_method' => 'cash',
                'reference_number' => 'COUNTER-REF-1',
            ])
            ->assertOk();

        $this->assertSame('completed', $appointment->fresh()->status);
    }

    public function test_consultation_start_is_idempotent_and_creates_one_draft_record(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = Appointment::factory()->create([
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => now()->addHour(),
        ]);
        $headers = $this->authHeader($vet);

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start")
            ->assertOk()
            ->assertJsonPath('consultation.status', 'in_consultation');
        $startedAt = $appointment->fresh()->started_at;

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/appointments/{$appointment->id}/start")
            ->assertOk()
            ->assertJsonPath('appointment.status', 'in_consultation');

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start")
            ->assertOk();

        $this->assertSame(1, MedicalRecord::where('appointment_id', $appointment->id)->count());
        $this->assertEquals($startedAt, $appointment->fresh()->started_at);
    }

    public function test_second_confinement_recommendation_is_refused_and_only_one_exists(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = Appointment::factory()->create([
            'veterinarian_id' => $vet->id,
            'status' => 'in_consultation',
            'scheduled_at' => now()->addHour(),
        ]);
        $headers = $this->authHeader($vet);
        $payload = [
            'diagnosis' => 'Fractured radius',
            'reason_for_confinement' => 'Stabilise limb and monitor',
            'urgency_level' => 'urgent',
        ];

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/recommend-confinement", $payload)
            ->assertCreated();

        $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/recommend-confinement", $payload)
            ->assertStatus(422);

        $this->assertSame(1, MedicalConfinement::where('consultation_id', $appointment->id)->count());
    }

    public function test_finalized_record_is_append_only_and_addenda_are_attributed(): void
    {
        $vet = $this->userWithToken('veterinary');
        $admin = $this->userWithToken('admin');
        $appointment = Appointment::factory()->create([
            'veterinarian_id' => $vet->id,
            'status' => 'in_consultation',
            'scheduled_at' => now()->addHour(),
        ]);
        $record = MedicalRecord::create([
            'appointment_id' => $appointment->id,
            'pet_id' => $appointment->pet_id,
            'veterinarian_id' => $vet->id,
            'visit_date' => now(),
            'diagnosis' => 'Original diagnosis',
            'status' => MedicalRecord::STATUS_DRAFT,
        ]);
        $record->update(['status' => MedicalRecord::STATUS_FINALIZED]);
        $this->assertNotNull($record->fresh()->content_hash);

        $this->withHeaders($this->authHeader($admin))
            ->putJson("/api/veterinary/medical-records/{$record->id}", ['diagnosis' => 'Admin rewrite'])
            ->assertForbidden();

        $this->withHeaders($this->authHeader($vet))
            ->putJson("/api/veterinary/medical-records/{$record->id}", ['diagnosis' => 'Vet rewrite'])
            ->assertForbidden();

        $this->assertSame('Original diagnosis', $record->fresh()->diagnosis);

        $this->withHeaders($this->authHeader($admin))
            ->postJson("/api/veterinary/medical-records/{$record->id}/addenda", ['body' => 'Admin note'])
            ->assertForbidden();

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/medical-records/{$record->id}/addenda", ['body' => 'Dose corrected to 5 mg'])
            ->assertCreated()
            ->assertJsonPath('addendum.author.name', $vet->name);

        $this->withHeaders($this->authHeader($vet))
            ->getJson("/api/veterinary/medical-records/{$record->id}")
            ->assertOk()
            ->assertJsonPath('addenda.0.body', 'Dose corrected to 5 mg')
            ->assertJsonPath('diagnosis', 'Original diagnosis');
    }

    public function test_cancelling_after_consultation_starts_requires_a_manager(): void
    {
        $vet = $this->userWithToken('veterinary');
        $receptionist = $this->userWithToken('receptionist');
        $manager = $this->userWithToken('manager');
        $appointment = Appointment::factory()->create([
            'veterinarian_id' => $vet->id,
            'status' => 'in_consultation',
            'scheduled_at' => now()->addHour(),
        ]);
        $body = ['reason' => 'Client changed mind'];

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/appointments/{$appointment->id}/cancel", $body)
            ->assertForbidden();
        $this->assertSame('in_consultation', $appointment->fresh()->status);

        $this->withHeaders($this->authHeader($manager))
            ->postJson("/api/receptionist/appointments/{$appointment->id}/cancel", $body)
            ->assertOk();
        $this->assertSame('cancelled', $appointment->fresh()->status);
    }

    public function test_receptionist_approves_vet_request_by_assigning_specific_veterinarian(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $otherVet = $this->userWithToken('veterinary');
        $customer = Customer::factory()->create(['email' => 'client@example.test']);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'Wellness Consultation',
            'category' => 'Consultation',
            'price' => 500,
        ]);

        $request = ServiceRequest::create([
            'request_type' => 'vet',
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'service_name' => $service->name,
            'request_date' => now()->addDay()->toDateString(),
            'request_time' => '10:00',
            'status' => 'pending',
            'payment_status' => 'pending',
        ]);

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/requests/{$request->id}/approve", [
                'veterinarian_id' => $vet->id,
            ])
            ->assertOk()
            ->assertJsonPath('appointment.veterinarian_id', $vet->id)
            ->assertJsonPath('appointment.status', 'scheduled');

        $this->assertDatabaseHas('appointments', [
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
        ]);

        $this->assertDatabaseMissing('appointments', [
            'veterinarian_id' => $otherVet->id,
            'pet_id' => $pet->id,
        ]);
    }

    public function test_approved_legacy_vet_request_can_be_repaired_and_assignment_is_returned(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $otherVet = $this->userWithToken('veterinary');
        $customer = Customer::factory()->create(['email' => 'repair-client@example.test']);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'Repair Consultation',
            'category' => 'Consultation',
            'price' => 500,
            'duration_minutes' => 30,
        ]);
        $scheduled = Carbon::now('Asia/Manila')->addDay()->setTime(10, 0);
        $request = ServiceRequest::create([
            'request_type' => 'vet',
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'service_name' => $service->name,
            'request_date' => $scheduled->toDateString(),
            'request_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'unpaid',
        ]);

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/requests/{$request->id}/approve", [
                'veterinarian_id' => $vet->id,
            ])
            ->assertOk()
            ->assertJsonPath('appointment.veterinarian_id', $vet->id);

        $this->withHeaders($this->authHeader($receptionist))
            ->getJson('/api/receptionist/requests')
            ->assertOk()
            ->assertJsonPath('requests.0.veterinarian_id', $vet->id)
            ->assertJsonPath('requests.0.veterinarian.name', $vet->name);

        $appointment = Appointment::where('service_request_id', $request->id)->firstOrFail();
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/requests/{$request->id}/approve", [
                'veterinarian_id' => $otherVet->id,
            ])
            ->assertOk()
            ->assertJsonPath('appointment.veterinarian_id', $otherVet->id);

        $appointment->refresh();
        $appointment->update(['status' => 'in_consultation']);
        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/requests/{$request->id}/approve", [
                'veterinarian_id' => $vet->id,
            ])
            ->assertUnprocessable();
        $this->assertSame($otherVet->id, (int) $appointment->fresh()->veterinarian_id);
    }

    public function test_generic_status_endpoint_cannot_approve_a_vet_request_without_assignment(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $request = ServiceRequest::create([
            'request_type' => 'vet',
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'service_name' => 'General Consultation',
            'request_date' => Carbon::now('Asia/Manila')->addDay()->toDateString(),
            'request_time' => '10:00',
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ]);

        $this->withHeaders($this->authHeader($receptionist))
            ->patchJson("/api/receptionist/requests/{$request->id}/status", ['status' => 'approved'])
            ->assertUnprocessable();

        $this->assertSame('pending', $request->fresh()->status);
        $this->assertDatabaseMissing('appointments', ['service_request_id' => $request->id]);
    }

    public function test_receptionist_can_assign_legacy_name_only_vet_request_when_pet_match_is_unique(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $customer = Customer::factory()->create([
            'name' => 'Customer',
            'email' => 'legacy-customer@example.test',
        ]);
        $pet = Pet::factory()->create([
            'customer_id' => $customer->id,
            'name' => 'Buddy',
        ]);

        $request = ServiceRequest::create([
            'request_type' => 'vet',
            'customer_name' => 'Customer',
            'pet_name' => 'Buddy',
            'service_name' => 'vet',
            'request_date' => now()->addDay()->toDateString(),
            'request_time' => '14:00',
            'status' => 'pending',
            'payment_status' => 'pending',
        ]);

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/requests/{$request->id}/approve", [
                'veterinarian_id' => $vet->id,
            ])
            ->assertOk()
            ->assertJsonPath('appointment.veterinarian_id', $vet->id)
            ->assertJsonPath('appointment.pet_id', $pet->id)
            ->assertJsonPath('appointment.service.name', 'Veterinary Consultation');

        $this->assertDatabaseHas('service_requests', [
            'id' => $request->id,
            'pet_id' => $pet->id,
            'status' => 'approved',
        ]);

        $this->assertDatabaseHas('appointments', [
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
        ]);
    }

    public function test_customer_vet_booking_to_receptionist_assignment_payment_and_cashier_verification_workflow(): void
    {
        Storage::fake('public');

        $customerUser = $this->userWithToken('customer');
        $receptionist = $this->userWithToken('receptionist');
        $cashier = $this->userWithToken('cashier');
        $assignedVet = $this->userWithToken('veterinary');
        $otherVet = $this->userWithToken('veterinary');

        $customer = Customer::factory()->create([
            'email' => $customerUser->email,
            'name' => $customerUser->name,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'Wellness Consultation',
            'category' => 'Consultation',
            'price' => 650,
            'is_active' => true,
        ]);

        $createResponse = $this->withHeaders($this->authHeader($customerUser))
            ->postJson('/api/customer/requests', [
                'customer_name' => $customer->name,
                'customer_email' => $customer->email,
                'pet_id' => $pet->id,
                'pet_name' => $pet->name,
                'request_type' => 'vet',
                'service_name' => $service->name,
                'requested_date' => now()->addDay()->toDateString(),
                'requested_time' => '10:00',
                'notes' => 'Annual wellness visit',
            ])
            ->assertCreated()
            ->assertJsonPath('request.status', 'pending')
            ->assertJsonPath('request.pet_id', $pet->id)
            ->assertJsonPath('request.service_name', $service->name);

        $requestId = $createResponse->json('request.id');

        $this->assertDatabaseHas('service_requests', [
            'id' => $requestId,
            'pet_id' => $pet->id,
            'service_name' => $service->name,
        ]);

        $this->withHeaders($this->authHeader($receptionist))
            ->getJson('/api/receptionist/veterinarians/available')
            ->assertOk()
            ->assertJsonFragment(['id' => $assignedVet->id])
            ->assertJsonFragment(['id' => $otherVet->id]);

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/requests/{$requestId}/approve", [
                'veterinarian_id' => $assignedVet->id,
                'receptionist_remarks' => 'Assigned to available veterinarian',
            ])
            ->assertOk()
            ->assertJsonPath('request.status', 'approved')
            ->assertJsonPath('appointment.veterinarian_id', $assignedVet->id);

        $this->withHeaders($this->authHeader($customerUser))
            ->getJson('/api/customer/my-requests')
            ->assertOk()
            ->assertJsonPath('requests.0.veterinarian_id', $assignedVet->id)
            ->assertJsonPath('requests.0.veterinarian.name', $assignedVet->name);

        $this->assertDatabaseHas('appointments', [
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $assignedVet->id,
            'status' => 'scheduled',
        ]);

        $this->assertDatabaseMissing('appointments', [
            'pet_id' => $pet->id,
            'veterinarian_id' => $otherVet->id,
        ]);

        $this->withHeaders($this->authHeader($customerUser))
            ->post("/api/customer/requests/{$requestId}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'PAY-12345',
                'payment_proof' => UploadedFile::fake()->create('proof.pdf', 20, 'application/pdf'),
            ])
            ->assertOk()
            ->assertJsonPath('payment_status', 'pending');

        $this->assertDatabaseHas('service_requests', [
            'id' => $requestId,
            'payment_status' => 'pending',
            'payment_method' => 'gcash',
            'payment_reference' => 'PAY-12345',
        ]);

        $this->withHeaders($this->authHeader($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $requestId,
                'type' => 'service_request',
                'payment_status' => 'pending',
            ]);

        $this->withHeaders($this->authHeader($cashier))
            ->postJson("/api/cashier/payment-requests/{$requestId}/verify", [
                'type' => 'service_request',
                'cashier_remarks' => 'Payment proof accepted',
            ])
            ->assertOk()
            ->assertJsonPath('payment_status', 'paid');

        $this->assertDatabaseHas('service_requests', [
            'id' => $requestId,
            'payment_status' => 'paid',
            'verified_by' => $cashier->id,
            'cashier_remarks' => 'Payment proof accepted',
        ]);
    }

    public function test_consultation_proceeds_to_payment_then_completes_after_cashier_verification(): void
    {
        $vet = $this->userWithToken('veterinary');
        $cashier = $this->userWithToken('cashier');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'Wellness Consultation',
            'category' => 'Consultation',
            'price' => 500,
        ]);

        $createResponse = $this->withHeaders($this->authHeader($vet))
            ->postJson('/api/veterinary/appointments', [
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'scheduled_at' => now()->addDay()->setTime(10, 0)->format('Y-m-d H:i:s'),
                'notes' => 'Scheduled consult',
            ])
            ->assertCreated();

        $appointmentId = $createResponse->json('appointment.id');

        // 1. Vet starts the consultation
        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/consultations/{$appointmentId}/start")
            ->assertOk()
            ->assertJsonPath('consultation.status', 'in_consultation');

        // 2. Vet finalizes the medical record
        $record = MedicalRecord::where('appointment_id', $appointmentId)->firstOrFail();
        $record->update([
            'diagnosis' => 'Healthy pet',
            'treatment_plan' => 'Routine care',
            'status' => MedicalRecord::STATUS_FINALIZED,
        ]);

        // 3. Vet marks consultation done -> proceed to pay
        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/consultations/{$appointmentId}/complete", [
                'diagnosis' => 'Healthy pet',
                'treatment_notes' => 'Routine care',
            ])
            ->assertOk()
            ->assertJsonPath('consultation.status', 'checkout');

        // 4. The visit stays open until the cashier verifies payment; there is no vet close action
        $this->assertSame('checkout', Appointment::find($appointmentId)->status);
        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointmentId}/complete")
            ->assertNotFound();

        // 5. The appointment shows in the cashier payment queue
        $this->withHeaders($this->authHeader($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $appointmentId,
                'type' => 'appointment',
            ]);

        // 6. Cashier verifies the payment
        $this->withHeaders($this->authHeader($cashier))
            ->postJson("/api/appointments/{$appointmentId}/pay")
            ->assertOk()
            ->assertJsonPath('appointment.payment_status', 'paid');

        $this->assertDatabaseHas('payment_settlements', [
            'settleable_type' => 'appointment',
            'settleable_id' => $appointmentId,
        ]);

        // 7. Verifying payment closes the visit automatically
        $this->assertSame('completed', Appointment::find($appointmentId)->status);
    }

    public function test_receptionist_reschedule_rejects_overlap_and_syncs_linked_request(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $customerUser = $this->userWithToken('customer');
        $customer = Customer::create([
            'user_id' => $customerUser->id,
            'name' => $customerUser->name,
            'email' => $customerUser->email,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'General Check-up',
            'category' => 'Consultation',
            'duration_minutes' => 30,
            'price' => 500,
        ]);
        $date = Carbon::now('Asia/Manila')->addDay()->toDateString();
        $serviceRequest = ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'vet',
            'service_name' => $service->name,
            'request_date' => $date,
            'request_time' => '10:00',
            'preferred_date' => $date,
            'preferred_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'unpaid',
        ]);
        $movingAppointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'service_request_id' => $serviceRequest->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => Carbon::parse("{$date} 10:00:00", 'Asia/Manila')->utc(),
        ]);
        Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => Carbon::parse("{$date} 11:00:00", 'Asia/Manila')->utc(),
        ]);

        $headers = $this->authHeader($receptionist);
        $this->withHeaders($headers)
            ->postJson("/api/receptionist/appointments/{$movingAppointment->id}/reschedule", [
                'scheduled_at' => "{$date} 11:30:00",
            ])
            ->assertUnprocessable();

        $this->assertDatabaseHas('appointments', [
            'id' => $movingAppointment->id,
            'scheduled_at' => Carbon::parse("{$date} 10:00:00", 'Asia/Manila')->utc()->format('Y-m-d H:i:s'),
        ]);
        $this->assertDatabaseHas('service_requests', [
            'id' => $serviceRequest->id,
            'request_time' => '10:00',
            'preferred_time' => '10:00',
        ]);

        $this->withHeaders($headers)
            ->postJson("/api/receptionist/appointments/{$movingAppointment->id}/reschedule", [
                'scheduled_at' => "{$date} 12:00:00",
            ])
            ->assertOk();

        $this->assertDatabaseHas('appointments', [
            'id' => $movingAppointment->id,
            'scheduled_at' => Carbon::parse("{$date} 12:00:00", 'Asia/Manila')->utc()->format('Y-m-d H:i:s'),
        ]);
        $this->assertDatabaseHas('service_requests', [
            'id' => $serviceRequest->id,
            'request_date' => $date,
            'request_time' => '12:00',
            'preferred_date' => $date,
            'preferred_time' => '12:00',
        ]);
    }

    public function test_veterinary_appointment_update_rejects_an_overlapping_time(): void
    {
        $vet = $this->userWithToken('veterinary');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'General Check-up',
            'category' => 'Consultation',
            'duration_minutes' => 30,
        ]);
        $date = now()->addDay()->toDateString();
        $appointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => Carbon::parse("{$date} 10:00:00", 'Asia/Manila')->utc(),
        ]);
        Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => Carbon::parse("{$date} 11:00:00", 'Asia/Manila')->utc(),
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->putJson("/api/veterinary/appointments/{$appointment->id}", [
                'service_id' => $service->id,
                'scheduled_at' => "{$date} 11:30:00",
            ])
            ->assertUnprocessable();

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'scheduled_at' => Carbon::parse("{$date} 10:00:00", 'Asia/Manila')->utc()->format('Y-m-d H:i:s'),
        ]);
    }

    public function test_approved_vet_request_without_an_appointment_can_be_repaired_and_reassigned_before_start(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 08:00:00', 'Asia/Manila'));
        $receptionist = $this->userWithToken('receptionist');
        $firstVet = $this->userWithToken('veterinary');
        $secondVet = $this->userWithToken('veterinary');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'Assignment Repair Consultation',
            'category' => 'Consultation',
            'price' => 500,
            'duration_minutes' => 30,
        ]);
        $date = Carbon::tomorrow('Asia/Manila')->toDateString();
        $request = ServiceRequest::create([
            'request_type' => 'vet',
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'service_name' => $service->name,
            'request_date' => $date,
            'request_time' => '10:00',
            'status' => 'scheduled',
            'payment_status' => 'unpaid',
        ]);

        $headers = $this->authHeader($receptionist);
        $created = $this->withHeaders($headers)
            ->postJson("/api/receptionist/requests/{$request->id}/approve", [
                'veterinarian_id' => $firstVet->id,
            ])
            ->assertOk()
            ->assertJsonPath('appointment.veterinarian_id', $firstVet->id);

        $appointmentId = $created->json('appointment.id');
        $this->withHeaders($headers)
            ->getJson('/api/receptionist/requests')
            ->assertOk()
            ->assertJsonPath('requests.0.veterinarian_id', $firstVet->id)
            ->assertJsonPath('requests.0.veterinarian.name', $firstVet->name);

        $this->withHeaders($headers)
            ->postJson("/api/receptionist/requests/{$request->id}/approve", [
                'veterinarian_id' => $secondVet->id,
            ])
            ->assertOk()
            ->assertJsonPath('appointment.veterinarian_id', $secondVet->id);

        $appointment = Appointment::findOrFail($appointmentId);
        $this->assertSame($secondVet->id, (int) $appointment->veterinarian_id);
        $appointment->update(['status' => 'in_consultation']);

        $this->withHeaders($headers)
            ->postJson("/api/receptionist/requests/{$request->id}/approve", [
                'veterinarian_id' => $firstVet->id,
            ])
            ->assertUnprocessable();
        $this->assertSame($secondVet->id, (int) $appointment->fresh()->veterinarian_id);
    }

    public function test_direct_appointment_assignment_can_be_repaired_and_reassigned_before_start(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 08:00:00', 'Asia/Manila'));
        $receptionist = $this->userWithToken('receptionist');
        $firstVet = $this->userWithToken('veterinary');
        $secondVet = $this->userWithToken('veterinary');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'General Consultation',
            'category' => 'Consultation',
            'duration_minutes' => 30,
        ]);
        $scheduledAt = Carbon::tomorrow('Asia/Manila')->setTime(10, 0)->utc();
        $appointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $firstVet->id,
            'status' => 'scheduled',
            'scheduled_at' => $scheduledAt,
        ]);
        $headers = $this->authHeader($receptionist);

        $this->withHeaders($headers)
            ->postJson("/api/receptionist/appointments/{$appointment->id}/approve", [
                'veterinarian_id' => $secondVet->id,
            ])
            ->assertOk()
            ->assertJsonPath('appointment.veterinarian_id', $secondVet->id);

        $appointment->update(['status' => 'in_consultation']);
        $this->withHeaders($headers)
            ->postJson("/api/receptionist/appointments/{$appointment->id}/approve", [
                'veterinarian_id' => $firstVet->id,
            ])
            ->assertUnprocessable();
        $this->assertSame($secondVet->id, (int) $appointment->fresh()->veterinarian_id);
    }

    public function test_reschedule_and_general_update_reject_overlapping_intervals(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 08:00:00', 'Asia/Manila'));
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'General Consultation',
            'category' => 'Consultation',
            'duration_minutes' => 30,
        ]);
        $date = Carbon::tomorrow('Asia/Manila')->toDateString();
        $firstTime = Carbon::parse($date . ' 10:00', 'Asia/Manila')->utc();
        $secondTime = Carbon::parse($date . ' 11:00', 'Asia/Manila')->utc();
        $first = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => $firstTime,
        ]);
        Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => $secondTime,
        ]);
        $headers = $this->authHeader($receptionist);
        $overlap = Carbon::parse($date . ' 10:30', 'Asia/Manila')->toISOString();

        $this->withHeaders($headers)
            ->postJson("/api/receptionist/appointments/{$first->id}/reschedule", ['scheduled_at' => $overlap])
            ->assertUnprocessable();
        $this->assertSame($firstTime->format('Y-m-d H:i:s'), $first->fresh()->scheduled_at->utc()->format('Y-m-d H:i:s'));

        $this->withHeaders($headers)
            ->putJson("/api/receptionist/appointments/{$first->id}", ['scheduled_at' => $overlap])
            ->assertUnprocessable();
        $this->assertSame($firstTime->format('Y-m-d H:i:s'), $first->fresh()->scheduled_at->utc()->format('Y-m-d H:i:s'));

        $adjacent = Carbon::parse($date . ' 12:00', 'Asia/Manila')->toISOString();
        $this->withHeaders($headers)
            ->postJson("/api/receptionist/appointments/{$first->id}/reschedule", ['scheduled_at' => $adjacent])
            ->assertOk();
        $this->assertSame('12:00', $first->fresh()->scheduled_at->setTimezone('Asia/Manila')->format('H:i'));
    }
}
