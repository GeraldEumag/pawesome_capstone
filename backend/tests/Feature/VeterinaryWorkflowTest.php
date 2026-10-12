<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
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
            'status' => 'approved',
            'scheduled_at' => now()->addHour(),
        ]);

        Appointment::factory()->create([
            'veterinarian_id' => $otherVet->id,
            'status' => 'approved',
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
            ->assertJsonPath('appointment.status', 'approved');

        $appointmentId = $createResponse->json('appointment.id');

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointmentId}/start")
            ->assertOk()
            ->assertJsonPath('appointment.status', 'in_progress')
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
            ->assertOk()
            ->assertJsonPath('appointment.status', 'completed');

        $editableAppointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'approved',
            'scheduled_at' => now()->addDay(),
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->putJson("/api/veterinary/appointments/{$editableAppointment->id}", [
                'service_id' => $service->id,
                'scheduled_at' => Carbon::now('Asia/Manila')->addDays(2)->setTime(10, 0)->toISOString(),
                'notes' => 'Updated consult',
            ])
            ->assertOk()
            ->assertJsonPath('notes', 'Updated consult');
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
            'status' => 'approved',
            'scheduled_at' => now()->addHour(),
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->patchJson("/api/veterinary/appointments/{$appointment->id}/status", [
                'status' => 'in_progress',
            ])
            ->assertOk()
            ->assertJsonPath('appointment.status', 'in_progress');
    }

    public function test_veterinary_must_finalize_consultation_before_completion(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = Appointment::factory()->create([
            'veterinarian_id' => $vet->id,
            'status' => 'approved',
            'scheduled_at' => now()->addHour(),
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointment->id}/start")
            ->assertOk();

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointment->id}/complete")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Finalize the consultation medical record before completing this appointment');
    }

    public function test_veterinary_cannot_access_other_veterinarian_appointment_detail(): void
    {
        $vet = $this->userWithToken('veterinary');
        $otherVet = $this->userWithToken('veterinary');
        $appointment = Appointment::factory()->create([
            'veterinarian_id' => $otherVet->id,
            'status' => 'approved',
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->getJson("/api/veterinary/appointments/{$appointment->id}")
            ->assertNotFound();
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
            ->assertJsonPath('appointment.status', 'approved');

        $this->assertDatabaseHas('appointments', [
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'approved',
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
        $appointment->update(['status' => 'in_progress']);
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
            'status' => 'approved',
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
            'status' => 'approved',
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
            ->assertJsonPath('consultation.status', 'awaiting_payment');

        // 4. Vet cannot complete before the cashier verifies payment
        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointmentId}/complete")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Appointment cannot be completed until payment is fully verified.');

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

        // 7. Vet completes the transaction after payment
        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/appointments/{$appointmentId}/complete")
            ->assertOk()
            ->assertJsonPath('appointment.status', 'completed');
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
            'status' => 'approved',
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
        $appointment->update(['status' => 'in_progress']);

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
            'status' => 'approved',
            'scheduled_at' => $scheduledAt,
        ]);
        $headers = $this->authHeader($receptionist);

        $this->withHeaders($headers)
            ->postJson("/api/receptionist/appointments/{$appointment->id}/approve", [
                'veterinarian_id' => $secondVet->id,
            ])
            ->assertOk()
            ->assertJsonPath('appointment.veterinarian_id', $secondVet->id);

        $appointment->update(['status' => 'in_progress']);
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
            'status' => 'approved',
            'scheduled_at' => $firstTime,
        ]);
        Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'approved',
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
