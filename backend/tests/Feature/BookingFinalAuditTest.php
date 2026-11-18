<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Grooming;
use App\Models\Boarding;
use App\Models\BoardingRoom;
use App\Models\BoardingRoomReservation;
use App\Models\Pet;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingFinalAuditTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('booking-final-audit')->plainTextToken];
    }

    private function groomingBooking(string $status = 'approved', string $requestStatus = 'approved'): array
    {
        $user = User::factory()->customer()->create();
        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'email' => $user->email,
            'name' => $user->name,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'dog']);

        $request = ServiceRequest::create([
            'customer_id' => $user->id,
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => now()->addDay()->toDateString(),
            'request_time' => '10:00',
            'status' => $requestStatus,
            'payment_status' => 'paid',
            'booking_channel' => 'online',
        ]);

        $grooming = Grooming::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Bath and Brush',
            'appointment_date' => now()->addDay()->toDateString(),
            'appointment_time' => '10:00',
            'amount' => 500,
            'base_amount' => 500,
            'total_amount' => 500,
            'balance_due' => 0,
            'payment_status' => 'paid',
            'status' => $status,
            'service_request_id' => $request->id,
        ]);

        return [$request, $grooming];
    }

    public function test_dedicated_grooming_endpoint_rejects_reopening_cancelled_booking(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [, $grooming] = $this->groomingBooking('cancelled', 'cancelled');

        $this->withHeaders($this->headers($receptionist))
            ->putJson("/api/grooming/{$grooming->id}/status", ['status' => 'approved'])
            ->assertUnprocessable()
            ->assertJsonPath('current_status', 'cancelled')
            ->assertJsonPath('requested_status', 'approved');

        $this->assertSame('cancelled', $grooming->fresh()->status);
    }

    public function test_receptionist_request_status_rejects_reopening_cancelled_grooming(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [$request, $grooming] = $this->groomingBooking('cancelled', 'cancelled');

        $this->withHeaders($this->headers($receptionist))
            ->patchJson("/api/receptionist/requests/{$request->id}/status", ['status' => 'in_progress'])
            ->assertUnprocessable()
            ->assertJsonPath('current_status', 'cancelled');

        $this->assertSame('cancelled', $request->fresh()->status);
        $this->assertSame('cancelled', $grooming->fresh()->status);
    }

    public function test_receptionist_cannot_reopen_cancelled_grooming_request_without_execution_row(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [$request, $grooming] = $this->groomingBooking('cancelled', 'cancelled');
        $grooming->delete();

        $this->withHeaders($this->headers($receptionist))
            ->patchJson("/api/receptionist/requests/{$request->id}/status", ['status' => 'approved'])
            ->assertUnprocessable()
            ->assertJsonPath('current_status', 'cancelled');

        $this->assertSame('cancelled', $request->fresh()->status);
    }

    public function test_receptionist_request_status_keeps_grooming_execution_record_in_sync(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [$request, $grooming] = $this->groomingBooking('approved', 'approved');

        $this->withHeaders($this->headers($receptionist))
            ->patchJson("/api/receptionist/requests/{$request->id}/status", ['status' => 'in_progress'])
            ->assertOk();

        $this->assertSame('in_progress', $request->fresh()->status);
        $this->assertSame('in_progress', $grooming->fresh()->status);
    }

    public function test_grooming_endpoint_rolls_back_both_rows_when_request_write_fails_first(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [$request, $grooming] = $this->groomingBooking();
        $fail = true;
        ServiceRequest::updating(function (ServiceRequest $model) use (&$fail, $request): void {
            if ($fail && $model->is($request)) {
                $fail = false;
                throw new \RuntimeException('Injected failure before the first status write.');
            }
        });

        $this->withHeaders($this->headers($receptionist))
            ->putJson("/api/grooming/{$grooming->id}/status", ['status' => 'in_progress'])
            ->assertStatus(500);

        $this->assertSame('approved', $request->fresh()->status);
        $this->assertSame('approved', $grooming->fresh()->status);
    }

    public function test_grooming_endpoint_rolls_back_request_write_when_execution_write_fails(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [$request, $grooming] = $this->groomingBooking();
        $fail = true;
        Grooming::updating(function (Grooming $model) use (&$fail, $grooming): void {
            if ($fail && $model->is($grooming)) {
                $fail = false;
                throw new \RuntimeException('Injected failure after the request write.');
            }
        });

        $this->withHeaders($this->headers($receptionist))
            ->putJson("/api/grooming/{$grooming->id}/status", ['status' => 'in_progress'])
            ->assertStatus(500);

        $this->assertSame('approved', $request->fresh()->status);
        $this->assertSame('approved', $grooming->fresh()->status);
    }

    public function test_request_status_endpoint_rolls_back_both_rows_when_request_write_fails_first(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [$request, $grooming] = $this->groomingBooking();
        $fail = true;
        ServiceRequest::updating(function (ServiceRequest $model) use (&$fail, $request): void {
            if ($fail && $model->is($request)) {
                $fail = false;
                throw new \RuntimeException('Injected failure before the first status write.');
            }
        });

        $this->withHeaders($this->headers($receptionist))
            ->patchJson("/api/receptionist/requests/{$request->id}/status", ['status' => 'in_progress'])
            ->assertStatus(500);

        $this->assertSame('approved', $request->fresh()->status);
        $this->assertSame('approved', $grooming->fresh()->status);
    }

    public function test_request_status_endpoint_rolls_back_request_write_when_execution_write_fails(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [$request, $grooming] = $this->groomingBooking();
        $fail = true;
        Grooming::updating(function (Grooming $model) use (&$fail, $grooming): void {
            if ($fail && $model->is($grooming)) {
                $fail = false;
                throw new \RuntimeException('Injected failure after the request write.');
            }
        });

        $this->withHeaders($this->headers($receptionist))
            ->patchJson("/api/receptionist/requests/{$request->id}/status", ['status' => 'in_progress'])
            ->assertStatus(500);

        $this->assertSame('approved', $request->fresh()->status);
        $this->assertSame('approved', $grooming->fresh()->status);
    }

    public function test_request_status_endpoint_updates_unlinked_request_without_creating_an_execution_row(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [$request, $grooming] = $this->groomingBooking();
        $grooming->delete();

        $this->withHeaders($this->headers($receptionist))
            ->patchJson("/api/receptionist/requests/{$request->id}/status", ['status' => 'in_progress'])
            ->assertOk();

        $this->assertSame('in_progress', $request->fresh()->status);
        $this->assertSoftDeleted('groomings', ['id' => $grooming->id]);
    }

    public function test_dedicated_grooming_endpoint_updates_unlinked_execution_record(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [$request, $grooming] = $this->groomingBooking();
        $request->delete();

        $this->withHeaders($this->headers($receptionist))
            ->putJson("/api/grooming/{$grooming->id}/status", ['status' => 'in_progress'])
            ->assertOk();

        $this->assertSame('in_progress', $grooming->fresh()->status);
    }

    public function test_grooming_status_transitions_follow_the_execution_lifecycle(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        [$request, $grooming] = $this->groomingBooking('approved', 'approved');
        $headers = $this->headers($receptionist);

        $this->withHeaders($headers)
            ->putJson("/api/grooming/{$grooming->id}/status", ['status' => 'in_progress'])
            ->assertOk();

        $this->assertSame('in_progress', $grooming->fresh()->status);

        $this->withHeaders($headers)
            ->putJson("/api/grooming/{$grooming->id}/status", ['status' => 'completed'])
            ->assertUnprocessable();

        $this->assertSame('in_progress', $grooming->fresh()->status);

        $grooming->update(['status' => 'completed']);

        $this->withHeaders($headers)
            ->putJson("/api/grooming/{$grooming->id}/status", ['status' => 'pending'])
            ->assertUnprocessable();

        $this->assertSame('completed', $grooming->fresh()->status);
        $this->assertSame('in_progress', $request->fresh()->status);
    }

    public function test_boarding_check_in_uses_store_local_calendar_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-18 17:00:00', 'UTC'));
        $receptionist = User::factory()->receptionist()->create();
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $boarding = \App\Models\Boarding::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'check_in' => '2026-11-19',
            'check_out' => '2026-11-19',
            'status' => 'approved',
            'payment_status' => 'paid',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/check-in")
            ->assertOk();

        $this->assertSame('in_care', $boarding->fresh()->status);
    }

    public function test_walk_in_boarding_approval_keeps_request_and_reservation_in_sync(): void
    {
        $receptionist = User::factory()->receptionist()->create();
        $user = User::factory()->customer()->create();
        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'email' => $user->email,
            'name' => $user->name,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'dog']);
        $room = BoardingRoom::factory()->create([
            'room_code' => 'AUDIT-APPROVAL-' . uniqid(),
            'room_type' => 'dog_standard',
            'total_rooms' => 1,
            'allowed_species' => ['dog'],
        ]);
        $request = ServiceRequest::create([
            'customer_id' => $user->id,
            'customer_name' => $user->name,
            'customer_email' => $user->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'request_date' => now()->addDays(2)->toDateString(),
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
        ]);
        $boarding = Boarding::create([
            'service_request_id' => $request->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'pet_type' => 'dog',
            'check_in' => now()->addDays(2)->toDateString(),
            'check_out' => now()->addDays(2)->toDateString(),
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'total_amount' => 500,
            'booking_channel' => 'walk_in',
        ]);
        $reservation = BoardingRoomReservation::create([
            'room_id' => $room->id,
            'source_type' => 'pet_hotel',
            'source_id' => $boarding->id,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in_date' => now()->addDays(2)->toDateString(),
            'check_out_date' => now()->addDays(2)->toDateString(),
            'status' => 'pending',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/approve")
            ->assertOk();

        $this->assertSame('approved', $request->fresh()->status);
        $this->assertSame('unpaid', $request->fresh()->payment_status);
        $this->assertSame('approved', $boarding->fresh()->status);
        $this->assertSame('approved', $reservation->fresh()->status);
        $this->assertSame($receptionist->id, $request->fresh()->approved_by);
        $this->assertNotNull($request->fresh()->approved_at);
    }

    public function test_walk_in_room_reservation_with_linked_request_is_released_on_checkout(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-18 17:00:00', 'UTC'));
        $receptionist = User::factory()->receptionist()->create();
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'dog']);
        $room = BoardingRoom::factory()->create([
            'room_code' => 'AUDIT-CHECKOUT-' . uniqid(),
            'room_type' => 'dog_standard',
            'total_rooms' => 1,
            'allowed_species' => ['dog'],
        ]);
        $request = ServiceRequest::create([
            'customer_id' => $customer->user_id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'request_date' => '2026-11-19',
            'status' => 'checked_in',
            'payment_status' => 'paid',
            'booking_channel' => 'walk_in',
        ]);
        $boarding = Boarding::create([
            'service_request_id' => $request->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'pet_type' => 'dog',
            'check_in' => '2026-11-19',
            'check_out' => '2026-11-19',
            'status' => 'in_care',
            'payment_status' => 'paid',
            'total_amount' => 500,
            'booking_channel' => 'walk_in',
        ]);
        $reservation = BoardingRoomReservation::create([
            'room_id' => $room->id,
            'source_type' => 'pet_hotel',
            'source_id' => $boarding->id,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in_date' => '2026-11-19',
            'check_out_date' => '2026-11-19',
            'status' => 'checked_in',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/check-out")
            ->assertOk();

        $this->assertSame('checked_out', $reservation->fresh()->status);
        $this->assertTrue($room->fresh()->isAvailable('2026-11-19', '2026-11-19'));
    }
}
