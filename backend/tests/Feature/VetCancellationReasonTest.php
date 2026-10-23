<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VetCancellationReasonTest extends TestCase
{
    use RefreshDatabase;

    private function vet(): User
    {
        return User::factory()->veterinary()->create();
    }

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('cancel-reason-test')->plainTextToken];
    }

    private function appointmentFor(User $vet, array $overrides = []): Appointment
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::create(['name' => 'Consult', 'category' => 'Consultation', 'price' => 500]);

        return Appointment::create(array_merge([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'scheduled_at' => now()->addDay(),
            'status' => 'scheduled',
            'price' => 500,
        ], $overrides));
    }

    public function test_cancellation_without_reason_is_rejected(): void
    {
        $vet = $this->vet();
        $appointment = $this->appointmentFor($vet);

        $this->withHeaders($this->authHeaders($vet))
            ->patchJson("/api/veterinary/appointments/{$appointment->id}/status", [
                'status' => 'cancelled',
            ])
            ->assertStatus(422);

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'status' => 'scheduled',
        ]);
    }

    public function test_other_reason_requires_an_explanation(): void
    {
        $vet = $this->vet();
        $appointment = $this->appointmentFor($vet);

        $this->withHeaders($this->authHeaders($vet))
            ->patchJson("/api/veterinary/appointments/{$appointment->id}/status", [
                'status' => 'cancelled',
                'cancellation_reason_code' => 'other',
            ])
            ->assertStatus(422);

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'status' => 'scheduled',
        ]);
    }

    public function test_invalid_reason_code_is_rejected(): void
    {
        $vet = $this->vet();
        $appointment = $this->appointmentFor($vet);

        $this->withHeaders($this->authHeaders($vet))
            ->patchJson("/api/veterinary/appointments/{$appointment->id}/status", [
                'status' => 'cancelled',
                'cancellation_reason_code' => 'invented_reason',
            ])
            ->assertStatus(422);
    }

    public function test_predefined_reason_cancels_and_persists(): void
    {
        $vet = $this->vet();
        $appointment = $this->appointmentFor($vet);

        $this->withHeaders($this->authHeaders($vet))
            ->patchJson("/api/veterinary/appointments/{$appointment->id}/status", [
                'status' => 'cancelled',
                'cancellation_reason_code' => 'client_request',
            ])
            ->assertOk();

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'status' => 'cancelled',
            'cancellation_reason' => 'Client requested cancellation',
        ]);
    }

    public function test_other_with_explanation_cancels_and_stores_text(): void
    {
        $vet = $this->vet();
        $appointment = $this->appointmentFor($vet);

        $this->withHeaders($this->authHeaders($vet))
            ->patchJson("/api/veterinary/appointments/{$appointment->id}/status", [
                'status' => 'cancelled',
                'cancellation_reason_code' => 'other',
                'cancellation_note' => 'Pet transferred to another clinic',
            ])
            ->assertOk();

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'status' => 'cancelled',
            'cancellation_reason' => 'Other: Pet transferred to another clinic',
        ]);
    }

    public function test_cancellation_propagates_to_the_linked_service_request(): void
    {
        $vet = $this->vet();
        $customerUser = User::factory()->customer()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $serviceRequest = ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'customer_name' => 'Cancel Customer',
            'customer_email' => 'cancel@example.test',
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'vet',
            'service_name' => 'Consult',
            'request_date' => Carbon::today()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
        ]);

        $appointment = $this->appointmentFor($vet, [
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_request_id' => $serviceRequest->id,
        ]);

        $this->withHeaders($this->authHeaders($vet))
            ->patchJson("/api/veterinary/appointments/{$appointment->id}/status", [
                'status' => 'cancelled',
                'cancellation_reason_code' => 'veterinarian_unavailable',
            ])
            ->assertOk();

        $this->assertDatabaseHas('service_requests', [
            'id' => $serviceRequest->id,
            'status' => 'cancelled',
            'rejection_reason' => 'Veterinarian unavailable',
        ]);
    }

    public function test_completed_appointment_cannot_be_cancelled(): void
    {
        $vet = $this->vet();
        $appointment = $this->appointmentFor($vet, ['status' => 'completed', 'completed_at' => now()]);

        $this->withHeaders($this->authHeaders($vet))
            ->patchJson("/api/veterinary/appointments/{$appointment->id}/status", [
                'status' => 'cancelled',
                'cancellation_reason_code' => 'client_request',
            ])
            ->assertStatus(422);

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'status' => 'completed',
        ]);
    }
}
