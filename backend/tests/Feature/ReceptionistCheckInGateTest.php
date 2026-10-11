<?php

namespace Tests\Feature;

use App\Models\Boarding;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReceptionistCheckInGateTest extends TestCase
{
    use RefreshDatabase;

    private function receptionist(): User
    {
        return User::factory()->receptionist()->create();
    }

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('check-in-gate-test')->plainTextToken];
    }

    private function boarding(array $overrides = []): Boarding
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        return Boarding::create(array_merge([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in' => Carbon::today()->toDateString(),
            'check_out' => Carbon::today()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
        ], $overrides));
    }

    public function test_boarding_check_in_is_rejected_when_payment_is_not_verified(): void
    {
        $receptionist = $this->receptionist();
        $boarding = $this->boarding(['payment_status' => 'unpaid']);

        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/check-in")
            ->assertStatus(422)
            ->assertJsonPath('error', 'Booking must be paid before check-in.');

        $this->assertDatabaseHas('boardings', [
            'id' => $boarding->id,
            'status' => 'approved',
        ]);
    }

    public function test_boarding_check_in_is_rejected_when_not_scheduled_today(): void
    {
        $receptionist = $this->receptionist();
        $boarding = $this->boarding([
            'check_in' => Carbon::tomorrow()->toDateString(),
            'check_out' => Carbon::tomorrow()->toDateString(),
        ]);

        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/check-in")
            ->assertStatus(422)
            ->assertJsonPath('error', 'Check-in is only allowed on the scheduled date.');
    }

    public function test_boarding_check_in_succeeds_when_paid_and_scheduled_today(): void
    {
        $receptionist = $this->receptionist();
        $boarding = $this->boarding();

        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/check-in")
            ->assertOk();

        $this->assertDatabaseHas('boardings', [
            'id' => $boarding->id,
            'status' => 'in_care',
        ]);
    }

    public function test_service_request_check_in_requires_paid_booking(): void
    {
        $receptionist = $this->receptionist();
        $serviceRequest = ServiceRequest::create([
            'customer_name' => 'Test Customer',
            'customer_email' => 'gate@example.test',
            'pet_name' => 'Milo',
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => Carbon::today()->toDateString(),
            'request_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'unpaid',
        ]);

        $this->withHeaders($this->authHeaders($receptionist))
            ->patchJson("/api/receptionist/requests/{$serviceRequest->id}/status", [
                'status' => 'checked_in',
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Booking must be paid before check-in.');
    }

    public function test_service_request_check_in_requires_todays_schedule(): void
    {
        $receptionist = $this->receptionist();
        $serviceRequest = ServiceRequest::create([
            'customer_name' => 'Test Customer',
            'customer_email' => 'gate@example.test',
            'pet_name' => 'Milo',
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => Carbon::tomorrow()->toDateString(),
            'request_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'paid',
        ]);

        $this->withHeaders($this->authHeaders($receptionist))
            ->patchJson("/api/receptionist/requests/{$serviceRequest->id}/status", [
                'status' => 'checked_in',
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Check-in is only allowed on the scheduled date.');
    }

    public function test_service_request_check_in_succeeds_when_paid_and_scheduled_today(): void
    {
        $receptionist = $this->receptionist();
        $customerUser = User::factory()->customer()->create();
        $customer = Customer::factory()->create([
            'user_id' => $customerUser->id,
            'name' => $customerUser->name,
            'email' => $customerUser->email,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $serviceRequest = ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => Carbon::today()->toDateString(),
            'request_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'paid',
        ]);

        $this->withHeaders($this->authHeaders($receptionist))
            ->patchJson("/api/receptionist/requests/{$serviceRequest->id}/status", [
                'status' => 'checked_in',
            ])
            ->assertOk()
            ->assertJsonPath('request.status', 'checked_in');
    }

    public function test_service_request_check_in_targets_the_linked_boarding_not_a_numeric_collision(): void
    {
        $receptionist = $this->receptionist();
        $customerUser = User::factory()->customer()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $serviceRequest = ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'customer_name' => 'Collision Customer',
            'customer_email' => 'collision@example.test',
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'request_date' => Carbon::today()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
        ]);

        // An unrelated boarding whose numeric ID equals the service request ID.
        // The old frontend posted service request IDs into the boarding
        // check-in endpoint, so this collision must never be followed.
        $unrelatedBoarding = new Boarding();
        $unrelatedBoarding->forceFill([
            'id' => $serviceRequest->id,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in' => Carbon::today()->toDateString(),
            'check_out' => Carbon::today()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
        ]);
        $unrelatedBoarding->save();

        $linkedBoarding = Boarding::create([
            'service_request_id' => $serviceRequest->id,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in' => Carbon::today()->toDateString(),
            'check_out' => Carbon::today()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
        ]);

        $this->assertNotSame($linkedBoarding->id, $serviceRequest->id);
        $this->assertSame($unrelatedBoarding->id, $serviceRequest->id);

        $this->withHeaders($this->authHeaders($receptionist))
            ->patchJson("/api/receptionist/requests/{$serviceRequest->id}/status", [
                'status' => 'checked_in',
            ])
            ->assertOk();

        $this->assertDatabaseHas('boardings', [
            'id' => $linkedBoarding->id,
            'status' => 'in_care',
        ]);
        $this->assertDatabaseHas('boardings', [
            'id' => $unrelatedBoarding->id,
            'status' => 'approved',
        ]);
        $this->assertDatabaseHas('service_requests', [
            'id' => $serviceRequest->id,
            'status' => 'checked_in',
        ]);
    }

    public function test_boarding_check_in_syncs_the_linked_service_request(): void
    {
        $receptionist = $this->receptionist();
        $customerUser = User::factory()->customer()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $serviceRequest = ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'customer_name' => 'Sync Customer',
            'customer_email' => 'sync@example.test',
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'request_date' => Carbon::today()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
        ]);

        $boarding = Boarding::create([
            'service_request_id' => $serviceRequest->id,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in' => Carbon::today()->toDateString(),
            'check_out' => Carbon::today()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
        ]);

        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/check-in")
            ->assertOk();

        $this->assertDatabaseHas('boardings', [
            'id' => $boarding->id,
            'status' => 'in_care',
        ]);
        $this->assertDatabaseHas('service_requests', [
            'id' => $serviceRequest->id,
            'status' => 'checked_in',
        ]);
    }

    public function test_second_check_in_is_rejected(): void
    {
        $receptionist = $this->receptionist();
        $boarding = $this->boarding();

        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/check-in")
            ->assertOk();

        $this->withHeaders($this->authHeaders($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/check-in")
            ->assertStatus(422);

        $this->assertDatabaseHas('boardings', [
            'id' => $boarding->id,
            'status' => 'in_care',
        ]);
    }
}
