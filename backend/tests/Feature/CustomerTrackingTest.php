<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\Grooming;
use App\Models\Pet;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerTrackingTest extends TestCase
{
    use RefreshDatabase;

    private function customer(): array
    {
        $user = User::factory()->customer()->create();
        $customer = Customer::create([
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'name' => 'Chuchu']);

        return [$user, $customer, $pet];
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('customer-tracking-test')->plainTextToken];
    }

    private function serviceRequest(User $user, string $status = 'completed'): ServiceRequest
    {
        return ServiceRequest::create([
            'customer_id' => $user->id,
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_name' => 'Chuchu',
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => now()->toDateString(),
            'status' => $status,
            'payment_status' => 'paid',
        ]);
    }

    public function test_tracking_includes_completed_booking_kinds_and_scopes_them_to_the_customer(): void
    {
        [$user, $customer, $pet] = $this->customer();
        $request = $this->serviceRequest($user);
        $appointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'status' => 'completed',
        ]);
        $grooming = Grooming::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Full Groom',
            'appointment_date' => now()->toDateString(),
            'status' => 'completed',
            'payment_status' => 'paid',
        ]);
        $boarding = Boarding::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'check_in' => now()->subDays(2)->toDateString(),
            'check_out' => now()->subDay()->toDateString(),
            'status' => 'checked_out',
            'payment_status' => 'paid',
        ]);

        [, $otherCustomer, $otherPet] = $this->customer();
        $otherAppointment = Appointment::factory()->create([
            'customer_id' => $otherCustomer->id,
            'pet_id' => $otherPet->id,
            'status' => 'completed',
        ]);

        $response = $this->withHeaders($this->headers($user))->getJson('/api/customer/tracking');

        $response->assertOk()->assertJsonCount(4, 'items');
        $items = collect($response->json('items'))->keyBy('id');
        $this->assertEqualsCanonicalizing([
            'request-' . $request->id,
            'appointment-' . $appointment->id,
            'grooming-' . $grooming->id,
            'boarding-' . $boarding->id,
        ], $items->keys()->all());
        $this->assertSame('completed', $items['request-' . $request->id]['status']);
        $this->assertSame('completed', $items['grooming-' . $grooming->id]['status']);
        $this->assertSame('checked_out', $items['boarding-' . $boarding->id]['status']);
        $this->assertSame('Picked Up', $items['boarding-' . $boarding->id]['status_label']);
        $this->assertArrayNotHasKey('appointment-' . $otherAppointment->id, $items->all());
    }

    public function test_promoted_completed_request_is_returned_once_as_its_boarding_record(): void
    {
        [$user, $customer, $pet] = $this->customer();
        $request = $this->serviceRequest($user);
        $boarding = Boarding::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'check_in' => now()->subDays(2)->toDateString(),
            'check_out' => now()->subDay()->toDateString(),
            'status' => 'completed',
            'payment_status' => 'paid',
            'service_request_id' => $request->id,
        ]);

        $response = $this->withHeaders($this->headers($user))->getJson('/api/customer/tracking');

        $response->assertOk()
            ->assertJsonCount(1, 'items')
            ->assertJsonPath('items.0.id', 'boarding-' . $boarding->id)
            ->assertJsonPath('items.0.status', 'completed');
    }
}
