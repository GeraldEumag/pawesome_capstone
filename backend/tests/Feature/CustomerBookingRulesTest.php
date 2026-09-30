<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Pet;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerBookingRulesTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function customer(): User
    {
        return User::factory()->customer()->create();
    }

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('customer-booking-test')->plainTextToken];
    }

    public function test_customer_can_cancel_a_service_request_with_the_cancelled_status(): void
    {
        $user = $this->customer();
        $receptionist = User::factory()->receptionist()->create();
        $serviceRequest = ServiceRequest::create([
            'customer_id' => $user->id,
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_name' => 'Milo',
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => Carbon::tomorrow()->toDateString(),
            'request_time' => '10:00',
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ]);

        $this->withHeaders($this->authHeaders($user))
            ->patchJson("/api/customer/requests/{$serviceRequest->id}/cancel")
            ->assertOk()
            ->assertJsonPath('request.status', 'cancelled');

        $this->assertDatabaseHas('service_requests', [
            'id' => $serviceRequest->id,
            'status' => 'cancelled',
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $receptionist->id,
            'role' => 'receptionist',
            'related_type' => 'service_request',
            'related_id' => $serviceRequest->id,
            'type' => 'warning',
        ]);
    }

    public function test_customer_cannot_make_a_same_day_service_request_after_store_closes_but_can_book_a_future_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 23:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $headers = $this->authHeaders($user);
        $booking = [
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_name' => 'Milo',
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_time' => '18:00',
        ];

        $this->withHeaders($headers)
            ->postJson('/api/customer/requests', [
                ...$booking,
                'requested_date' => Carbon::today()->toDateString(),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.requested_date.0', 'Same-day bookings are closed after 7:00 PM. Please choose a future date.');

        $this->withHeaders($headers)
            ->postJson('/api/customer/requests', [
                ...$booking,
                'requested_date' => Carbon::tomorrow()->toDateString(),
            ])
            ->assertCreated();
    }

    public function test_customer_cannot_make_a_same_day_hotel_booking_after_store_closes(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-29 23:00:00', 'Asia/Manila'));
        $user = $this->customer();
        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'email' => $user->email,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $this->withHeaders($this->authHeaders($user))
            ->postJson('/api/customer/boardings', [
                'pet_id' => $pet->id,
                'check_in_date' => Carbon::today()->toDateString(),
                'number_of_days' => 1,
            ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.check_in_date.0', 'Same-day hotel bookings are closed after 7:00 PM. Please choose a future date.');

        $this->assertDatabaseMissing('boardings', [
            'pet_id' => $pet->id,
            'check_in' => Carbon::today()->toDateString(),
        ]);
    }
}
