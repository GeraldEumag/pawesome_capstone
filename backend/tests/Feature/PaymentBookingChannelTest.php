<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\BoardingRoom;
use App\Models\BoardingRoomReservation;
use App\Models\Customer;
use App\Models\Grooming;
use App\Models\HotelRoom;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * P0 payment/booking-integrity coverage: explicit booking channels, cashier
 * eligibility enforcement, grooming/vet proof uploads, and persistent
 * boarding-room reservations.
 */
class PaymentBookingChannelTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function staff(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('p0-integrity')->plainTextToken];
    }

    private function customerWithPet(array $petAttrs = []): array
    {
        $user = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'email' => $user->email,
            'name' => $user->name,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'dog'] + $petAttrs);

        return [$user, $customer, $pet];
    }

    private function serviceRequest(array $overrides = []): ServiceRequest
    {
        return ServiceRequest::create(array_merge([
            'customer_name' => 'Test Customer',
            'customer_email' => 'customer@example.com',
            'pet_name' => 'Bantay',
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => Carbon::tomorrow()->toDateString(),
            'request_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'online',
            'price' => 500,
        ], $overrides));
    }

    private function verifyPayload(array $overrides = []): array
    {
        return array_merge([
            'payment_method' => 'cash',
            'cashier_remarks' => 'Counter collection',
        ], $overrides);
    }

    /* ── D2: explicit channel ─────────────────────────────────────── */

    public function test_online_request_is_marked_online(): void
    {
        [$user, $customer, $pet] = $this->customerWithPet();

        $response = $this->withHeaders($this->headers($user))
            ->postJson('/api/customer/requests', [
                'customer_name' => $user->name,
                'pet_id' => $pet->id,
                'request_type' => 'grooming',
                'service_name' => 'Bath and Brush',
                'requested_date' => Carbon::tomorrow()->toDateString(),
                'requested_time' => '10:00',
            ]);

        $response->assertStatus(201);

        $sr = ServiceRequest::latest('id')->first();
        $this->assertNotNull($sr);
        $this->assertSame('online', $sr->booking_channel);
    }

    public function test_walk_in_request_is_marked_walk_in(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 08:00:00', 'Asia/Manila'));
        $receptionist = $this->staff('receptionist');
        [, $customer, $pet] = $this->customerWithPet();

        $response = $this->withHeaders($this->headers($receptionist))
            ->postJson('/api/receptionist/walk-ins', [
                'customer_mode' => 'existing',
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'booking' => [
                    'service_type' => 'grooming',
                    'service_name' => 'Bath and Brush',
                    'request_date' => Carbon::today()->toDateString(),
                    'request_time' => '10:00',
                ],
            ]);

        $response->assertStatus(201);

        $sr = ServiceRequest::latest('id')->first();
        $this->assertNotNull($sr);
        $this->assertSame('walk_in', $sr->booking_channel);

        $grooming = Grooming::where('service_request_id', $sr->id)->first();
        $this->assertNotNull($grooming);
        $this->assertSame('walk_in', $grooming->booking_channel);
    }

    /* ── D1: cashier eligibility ──────────────────────────────────── */

    public function test_unapproved_request_cannot_be_verified(): void
    {
        $cashier = $this->staff('cashier');
        $sr = $this->serviceRequest(['status' => 'pending']);

        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$sr->id}/verify", $this->verifyPayload(['type' => 'service_request']))
            ->assertStatus(422);

        $this->assertSame('unpaid', $sr->fresh()->payment_status);
    }

    public function test_online_unpaid_request_cannot_be_cash_collected(): void
    {
        $cashier = $this->staff('cashier');
        $sr = $this->serviceRequest([
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'payment_method' => null,
            'booking_channel' => 'online',
        ]);

        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$sr->id}/verify", $this->verifyPayload(['type' => 'service_request']))
            ->assertStatus(422)
            ->assertJson(['success' => false]);

        $sr->refresh();
        $this->assertSame('unpaid', $sr->payment_status);
        $this->assertDatabaseCount('payment_settlements', 0);
    }

    public function test_online_request_is_not_listed_as_counter_collection(): void
    {
        $cashier = $this->staff('cashier');
        $sr = $this->serviceRequest([
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'payment_method' => null,
            'booking_channel' => 'online',
        ]);

        $payments = collect(
            $this->withHeaders($this->headers($cashier))
                ->getJson('/api/cashier/payment-requests')
                ->assertOk()
                ->json('payments')
        );

        $this->assertFalse(
            $payments->contains(fn ($p) => $p['payable_type'] === 'service_request' && $p['id'] === $sr->id),
            'Online booking with no submitted proof must not surface as a counter collection.'
        );
    }

    public function test_walk_in_unpaid_request_allows_counter_cash(): void
    {
        $cashier = $this->staff('cashier');
        $sr = $this->serviceRequest([
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
        ]);

        $response = $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$sr->id}/verify", $this->verifyPayload(['type' => 'service_request']));

        $response->assertOk()->assertJson(['success' => true]);

        $sr->refresh();
        $this->assertSame('paid', $sr->payment_status);
        $this->assertSame('cash', $sr->payment_method);
        $this->assertNotNull($sr->receipt_number);
    }

    public function test_online_pending_proof_can_be_verified(): void
    {
        $cashier = $this->staff('cashier');
        $sr = $this->serviceRequest([
            'status' => 'approved',
            'payment_status' => 'pending',
            'payment_method' => 'gcash',
            'payment_proof' => 'payment-proofs/proof.jpg',
            'payment_reference' => 'GC-123456',
            'booking_channel' => 'online',
        ]);

        $response = $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$sr->id}/verify", [
                'type' => 'service_request',
                'payment_method' => 'gcash',
                'reference_number' => 'GC-123456',
            ]);

        $response->assertOk()->assertJson(['success' => true]);
        $this->assertSame('paid', $sr->fresh()->payment_status);
    }

    public function test_proof_verification_ignores_counter_method_override(): void
    {
        // A pending digital-proof row reclassifies an explicit cash request as a
        // proof verification — but the submitted proof's method is authoritative.
        // The request-supplied 'cash' must not relabel the settlement.
        $cashier = $this->staff('cashier');
        $sr = $this->serviceRequest([
            'status' => 'approved',
            'payment_status' => 'pending',
            'payment_method' => 'gcash',
            'payment_proof' => 'payment-proofs/proof.jpg',
            'payment_reference' => 'GC-555555',
            'booking_channel' => 'online',
        ]);

        $response = $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$sr->id}/verify", [
                'type' => 'service_request',
                'payment_method' => 'cash',
            ]);

        $response->assertOk()->assertJson(['success' => true]);

        $sr->refresh();
        $this->assertSame('paid', $sr->payment_status);
        $this->assertSame('gcash', $sr->payment_method);

        $this->assertDatabaseHas('payment_settlements', [
            'settleable_type' => 'service_request',
            'settleable_id' => $sr->id,
            'payment_method' => 'gcash',
        ]);
    }

    public function test_rejected_online_proof_can_settle_at_counter_and_stays_distinguishable(): void
    {
        $cashier = $this->staff('cashier');
        $sr = $this->serviceRequest([
            'status' => 'approved',
            'payment_status' => 'rejected',
            'payment_method' => 'gcash',
            'payment_proof' => 'payment-proofs/proof.jpg',
            'booking_channel' => 'online',
        ]);

        $response = $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$sr->id}/verify", $this->verifyPayload(['type' => 'service_request']));

        $response->assertOk()->assertJson(['success' => true]);

        $sr->refresh();
        $this->assertSame('paid', $sr->payment_status);
        // The cash settlement supersedes the rejected e-wallet attempt and
        // must remain distinguishable from it.
        $this->assertSame('cash', $sr->payment_method);

        $this->assertDatabaseHas('payment_settlements', [
            'settleable_type' => 'service_request',
            'settleable_id' => $sr->id,
            'payment_method' => 'cash',
        ]);
    }

    public function test_rejecting_proof_does_not_mark_paid(): void
    {
        $cashier = $this->staff('cashier');
        $sr = $this->serviceRequest([
            'status' => 'approved',
            'payment_status' => 'pending',
            'payment_method' => 'gcash',
            'payment_proof' => 'payment-proofs/proof.jpg',
            'booking_channel' => 'online',
        ]);

        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$sr->id}/reject", [
                'type' => 'service_request',
                'rejection_reason' => 'Reference number mismatch',
            ])
            ->assertOk();

        $this->assertSame('rejected', $sr->fresh()->payment_status);
    }

    public function test_duplicate_verification_is_rejected(): void
    {
        $cashier = $this->staff('cashier');
        $sr = $this->serviceRequest([
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
        ]);

        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$sr->id}/verify", $this->verifyPayload(['type' => 'service_request']))
            ->assertOk();

        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$sr->id}/verify", $this->verifyPayload(['type' => 'service_request']))
            ->assertStatus(422);

        $this->assertSame('paid', $sr->fresh()->payment_status);
    }

    public function test_pending_appointment_cannot_be_verified(): void
    {
        $cashier = $this->staff('cashier');
        [, $customer, $pet] = $this->customerWithPet();
        $service = Service::firstOrCreate(['name' => 'Veterinary Consultation'], ['category' => 'Veterinary', 'price' => 700]);

        $appointment = Appointment::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'status' => 'pending',
            'scheduled_at' => Carbon::tomorrow()->setTime(10, 0),
            'price' => 700,
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
        ]);

        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$appointment->id}/verify", $this->verifyPayload(['type' => 'appointment']))
            ->assertStatus(422);

        $this->assertSame('unpaid', $appointment->fresh()->payment_status);
    }

    /* ── D3: grooming/vet proof uploads ───────────────────────────── */

    public function test_grooming_proof_upload_persists_and_stays_unpaid(): void
    {
        Storage::fake('private');
        [$user, $customer, $pet] = $this->customerWithPet();

        $sr = $this->serviceRequest([
            'customer_id' => $user->id,
            'customer_email' => $user->email,
            'pet_id' => $pet->id,
            'request_type' => 'grooming',
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'online',
        ]);

        $grooming = Grooming::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Bath and Brush',
            'appointment_date' => Carbon::tomorrow()->toDateString(),
            'appointment_time' => '10:00',
            'amount' => 500,
            'total_amount' => 500,
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'service_request_id' => $sr->id,
        ]);

        $response = $this->withHeaders($this->headers($user))
            ->post("/api/customer/requests/{$sr->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'GC-998877',
                'payment_proof' => UploadedFile::fake()->create('proof.jpg', 100, 'image/jpeg'),
            ]);

        $response->assertOk();

        $sr->refresh();
        // Uploading proof never marks the booking paid — it stays pending
        // for cashier verification.
        $this->assertSame('pending', $sr->payment_status);
        $this->assertNotNull($sr->payment_proof);

        $grooming->refresh();
        $this->assertSame('pending', $grooming->payment_status);
        $this->assertSame('gcash', $grooming->payment_method);
    }

    public function test_veterinary_proof_upload_persists_and_stays_unpaid(): void
    {
        Storage::fake('private');
        [$user, $customer, $pet] = $this->customerWithPet();
        $service = Service::firstOrCreate(['name' => 'Veterinary Consultation'], ['category' => 'Veterinary', 'price' => 700]);

        $sr = $this->serviceRequest([
            'customer_id' => $user->id,
            'customer_email' => $user->email,
            'pet_id' => $pet->id,
            'request_type' => 'vet',
            'service_name' => 'Veterinary Consultation',
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'online',
        ]);

        $appointment = Appointment::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'status' => 'approved',
            'scheduled_at' => Carbon::tomorrow()->setTime(10, 0),
            'price' => 700,
            'payment_status' => 'unpaid',
            'service_request_id' => $sr->id,
        ]);

        $response = $this->withHeaders($this->headers($user))
            ->post("/api/customer/requests/{$sr->id}/payment-proof", [
                'payment_method' => 'maya',
                'payment_reference' => 'MY-112233',
                'payment_proof' => UploadedFile::fake()->create('proof.jpg', 100, 'image/jpeg'),
            ]);

        $response->assertOk();

        $sr->refresh();
        $this->assertSame('pending', $sr->payment_status);
        $this->assertSame('maya', $sr->payment_method);

        // The linked appointment tracks payment state (its table stores no
        // proof/method columns — those live on the request row).
        $this->assertSame('pending', $appointment->fresh()->payment_status);
    }

    public function test_pending_walk_in_service_request_cannot_submit_preapproval_proof(): void
    {
        Storage::fake('private');
        [$user, , $pet] = $this->customerWithPet();
        $sr = $this->serviceRequest([
            'customer_id' => $user->id,
            'customer_email' => $user->email,
            'pet_id' => $pet->id,
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
        ]);

        $this->withHeaders($this->headers($user))
            ->post("/api/customer/requests/{$sr->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'GC-WALKIN-001',
                'payment_proof' => UploadedFile::fake()->create('walk-in-proof.jpg', 100, 'image/jpeg'),
            ])
            ->assertUnprocessable();

        $this->assertSame('unpaid', $sr->fresh()->payment_status);
        $this->assertNull($sr->fresh()->payment_proof);
    }

    public function test_pending_online_service_request_can_submit_proof_before_approval(): void
    {
        Storage::fake('private');
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        [$user, $customer, $pet] = $this->customerWithPet();
        $receptionist = $this->staff('receptionist');
        $cashier = $this->staff('cashier');
        Service::firstOrCreate(['name' => 'Bath and Brush'], ['category' => 'Grooming', 'price' => 500, 'is_active' => true]);
        $sr = $this->serviceRequest([
            'customer_id' => $user->id,
            'customer_email' => $user->email,
            'pet_id' => $pet->id,
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'online',
        ]);
        $grooming = Grooming::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Bath and Brush',
            'appointment_date' => Carbon::tomorrow()->toDateString(),
            'appointment_time' => '10:00',
            'amount' => 500,
            'total_amount' => 500,
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'service_request_id' => $sr->id,
        ]);

        $this->withHeaders($this->headers($user))
            ->post("/api/customer/requests/{$sr->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'GC-PREAPPROVAL-1',
                'payment_proof' => UploadedFile::fake()->create('booking-proof.jpg', 100, 'image/jpeg'),
            ])
            ->assertOk()
            ->assertJsonPath('payment_status', 'pending');

        $sr->refresh();
        $this->assertSame('pending', $sr->status);
        $this->assertSame('pending', $sr->payment_status);
        $this->assertNotNull($sr->payment_proof);
        $this->assertSame('pending', $grooming->fresh()->payment_status);

        $queue = $this->withHeaders($this->headers($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->json('payments');
        $this->assertFalse(collect($queue)->contains(fn ($row) => (int) $row['id'] === $sr->id && $row['payable_type'] === 'service_request'));

        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$sr->id}/verify", $this->verifyPayload(['type' => 'service_request']))
            ->assertStatus(422);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/requests/{$sr->id}/approve")
            ->assertOk();

        $this->assertSame('approved', $sr->fresh()->status);
        $this->assertSame('pending', $sr->fresh()->payment_status);
        $this->assertSame('approved', $grooming->fresh()->status);
        $this->assertSame('pending', $grooming->fresh()->payment_status);
        $queue = $this->withHeaders($this->headers($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->json('payments');
        $this->assertTrue(collect($queue)->contains(fn ($row) => (int) $row['id'] === $sr->id && $row['payable_type'] === 'service_request'));
    }

    public function test_customer_boarding_requires_card_and_verification_before_approval_or_schedule(): void
    {
        Storage::fake('private');
        Carbon::setTestNow(Carbon::parse('2026-09-29 12:00:00', 'Asia/Manila'));
        [$user, $customer, $pet] = $this->customerWithPet();
        $receptionist = $this->staff('receptionist');
        $cashier = $this->staff('cashier');
        $room = HotelRoom::factory()->create(['status' => 'available', 'daily_rate' => 850]);
        $bookingData = [
            'pet_id' => $pet->id,
            'hotel_room_id' => $room->id,
            'check_in_date' => Carbon::tomorrow()->toDateString(),
            'number_of_days' => 1,
        ];

        $this->withHeaders($this->headers($user))
            ->postJson('/api/customer/boardings', $bookingData)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['vaccination_card']);
        $this->assertDatabaseCount('boardings', 0);

        $created = $this->withHeaders($this->headers($user))
            ->post('/api/customer/boardings', $bookingData + [
                'vaccination_card' => UploadedFile::fake()->create('vaccine-card.png', 100, 'image/png'),
            ])
            ->assertCreated()
            ->json('boarding');
        $boarding = Boarding::findOrFail($created['id']);
        $this->assertSame('pending', $boarding->status);
        $this->assertSame('online', $boarding->booking_channel);
        $this->assertNotNull($boarding->vaccination_card);

        $this->withHeaders($this->headers($user))
            ->post("/api/customer/boarding-requests/{$boarding->id}/payment-proof", [
                'payment_method' => 'maya',
                'payment_reference' => 'MY-PREAPPROVAL-1',
                'payment_proof' => UploadedFile::fake()->create('boarding-proof.pdf', 100, 'application/pdf'),
            ])
            ->assertOk();

        $cashierQueue = $this->withHeaders($this->headers($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->json('payments');
        $this->assertFalse(collect($cashierQueue)->contains(fn ($row) => (int) $row['id'] === $boarding->id && $row['payable_type'] === 'boarding'));

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/approve")
            ->assertUnprocessable()
            ->assertJsonPath('error', 'The vaccination card must be verified before approving this online boarding.');

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/schedule", [
                'hotel_room_id' => $room->id,
                'check_in' => Carbon::tomorrow()->toDateString(),
                'check_out' => Carbon::tomorrow()->toDateString(),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'The vaccination card must be verified before approving this online boarding.');

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/verify-vaccination")
            ->assertOk();
        $verifiedAt = $boarding->fresh()->vaccination_card_verified_at;
        $this->assertNotNull($verifiedAt);

        $this->withHeaders($this->headers($user))
            ->post("/api/customer/boarding-requests/{$boarding->id}/vaccination-card", [
                'vaccination_card' => UploadedFile::fake()->create('replacement-card.png', 100, 'image/png'),
            ])
            ->assertOk();
        $this->assertNull($boarding->fresh()->vaccination_card_verified_at);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/approve")
            ->assertUnprocessable();

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/verify-vaccination")
            ->assertOk();
        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/approve")
            ->assertOk();

        $boarding->refresh();
        $this->assertSame('approved', $boarding->status);
        $this->assertSame('pending', $boarding->payment_status);
        $this->assertNotNull($boarding->payment_proof);
        $cashierQueue = $this->withHeaders($this->headers($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->json('payments');
        $this->assertTrue(collect($cashierQueue)->contains(fn ($row) => (int) $row['id'] === $boarding->id && $row['payable_type'] === 'boarding'));
    }

    public function test_receptionist_walk_in_boarding_is_not_blocked_by_customer_card_requirement(): void
    {
        [, $customer, $pet] = $this->customerWithPet();
        $receptionist = $this->staff('receptionist');
        $boarding = Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'check_in' => Carbon::tomorrow()->toDateString(),
            'check_out' => Carbon::tomorrow()->toDateString(),
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'total_amount' => 850,
            'booking_channel' => 'walk_in',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/boarding-requests/{$boarding->id}/approve")
            ->assertOk();
        $this->assertSame('approved', $boarding->fresh()->status);
    }

    public function test_legacy_online_hotel_request_cannot_be_approved_without_verified_boarding_card(): void
    {
        $receptionist = $this->staff('receptionist');
        [, $customer, $pet] = $this->customerWithPet();
        $request = $this->serviceRequest([
            'customer_id' => $customer->user_id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'online',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/requests/{$request->id}/approve")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Online hotel requests must use the Pet Hotel reservation flow and have a verified vaccination card before approval.');

        $this->assertSame('pending', $request->fresh()->status);
        $this->assertDatabaseMissing('boardings', ['service_request_id' => $request->id]);
    }

    /* ── D4: boarding-room reservation ────────────────────────────── */

    private function boardingRoom(array $overrides = []): BoardingRoom
    {
        return BoardingRoom::create(array_merge([
            'room_code' => 'DR-' . uniqid(),
            'room_name' => 'Dog Kennel',
            'room_type' => 'dog_standard',
            'hotel_category' => 'dog_hotel',
            'allowed_species' => ['dog'],
            'max_capacity' => 1,
            'total_rooms' => 1,
            'daily_rate' => 800,
            'is_active' => true,
            'customer_selectable' => true,
        ], $overrides));
    }

    public function test_hotel_approval_persists_room_reservation(): void
    {
        $receptionist = $this->staff('receptionist');
        [, $customer, $pet] = $this->customerWithPet();
        $room = $this->boardingRoom();

        $sr = $this->serviceRequest([
            'customer_id' => $customer->user_id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
            'boarding_room_id' => $room->id,
            'room_name' => $room->room_name,
            'room_type' => $room->room_type,
            'daily_rate' => $room->daily_rate,
            'check_out_date' => Carbon::tomorrow()->addDay()->toDateString(),
            'total_days' => 1,
            'total_amount' => 800,
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/requests/{$sr->id}/approve")
            ->assertOk();

        $sr->refresh();
        $this->assertSame('approved', $sr->status);

        $boarding = Boarding::where('service_request_id', $sr->id)->first();
        $this->assertNotNull($boarding);
        $this->assertSame('approved', $boarding->status);

        $reservation = BoardingRoomReservation::where('source_type', 'service_request')
            ->where('source_id', $sr->id)
            ->first();
        $this->assertNotNull($reservation, 'Approval must persist a boarding-room reservation.');
        $this->assertSame($room->id, (int) $reservation->room_id);
        $this->assertSame($pet->id, (int) $reservation->pet_id);
    }

    public function test_full_room_causes_controlled_approval_rejection(): void
    {
        $receptionist = $this->staff('receptionist');
        [, $customer, $pet] = $this->customerWithPet();
        $room = $this->boardingRoom();

        $checkIn = Carbon::tomorrow()->toDateString();
        $checkOut = Carbon::tomorrow()->addDay()->toDateString();

        // Occupy the room's single slot for the requested stay.
        BoardingRoomReservation::create([
            'room_id' => $room->id,
            'source_type' => 'service_request',
            'source_id' => 9999,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in_date' => $checkIn,
            'check_out_date' => $checkOut,
            'status' => 'approved',
        ]);

        $sr = $this->serviceRequest([
            'customer_id' => $customer->user_id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
            'boarding_room_id' => $room->id,
            'check_out_date' => $checkOut,
            'total_days' => 1,
            'total_amount' => 800,
            'request_date' => $checkIn,
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/requests/{$sr->id}/approve")
            ->assertStatus(422);

        $sr->refresh();
        // The request must not be silently approved without a reservation.
        $this->assertSame('pending', $sr->status);
        $this->assertDatabaseMissing('boardings', ['service_request_id' => $sr->id]);
        $this->assertSame(
            1,
            BoardingRoomReservation::where('room_id', $room->id)->count(),
            'No extra reservation should be created for the rejected approval.'
        );
    }

    public function test_duplicate_approval_does_not_duplicate_reservation(): void
    {
        $receptionist = $this->staff('receptionist');
        [, $customer, $pet] = $this->customerWithPet();
        // Two units — a duplicate approve must not be blocked by availability
        // (which would hide whether a second reservation row was created).
        $room = $this->boardingRoom(['total_rooms' => 2]);

        $sr = $this->serviceRequest([
            'customer_id' => $customer->user_id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
            'boarding_room_id' => $room->id,
            'room_name' => $room->room_name,
            'room_type' => $room->room_type,
            'daily_rate' => $room->daily_rate,
            'check_out_date' => Carbon::tomorrow()->addDay()->toDateString(),
            'total_days' => 1,
            'total_amount' => 800,
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/requests/{$sr->id}/approve")
            ->assertOk();
        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/requests/{$sr->id}/approve")
            ->assertOk();

        $this->assertSame(
            1,
            BoardingRoomReservation::where('source_type', 'service_request')
                ->where('source_id', $sr->id)
                ->count(),
            'A retried approval must not create a second reservation.'
        );
        $this->assertSame(
            1,
            Boarding::where('service_request_id', $sr->id)->count(),
            'A retried approval must not create a second boarding record.'
        );
    }

    public function test_hotel_request_without_room_cannot_be_approved_unassigned(): void
    {
        $receptionist = $this->staff('receptionist');
        [, $customer, $pet] = $this->customerWithPet();

        // No compatible rooms exist — the request cannot be assigned.
        $sr = $this->serviceRequest([
            'customer_id' => $customer->user_id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
            'boarding_room_id' => null,
            'room_type' => 'dog_standard',
            'check_out_date' => Carbon::tomorrow()->addDay()->toDateString(),
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/requests/{$sr->id}/approve")
            ->assertStatus(422);

        $sr->refresh();
        $this->assertSame('pending', $sr->status);
        $this->assertDatabaseMissing('boardings', ['service_request_id' => $sr->id]);
    }

    public function test_hotel_approval_auto_assigns_compatible_room(): void
    {
        $receptionist = $this->staff('receptionist');
        [, $customer, $pet] = $this->customerWithPet();
        $room = $this->boardingRoom();

        // Request specifies a room type but no specific room — approval
        // must auto-assign a compatible room instead of dropping it.
        $sr = $this->serviceRequest([
            'customer_id' => $customer->user_id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
            'boarding_room_id' => null,
            'room_type' => 'dog_standard',
            'check_out_date' => Carbon::tomorrow()->addDay()->toDateString(),
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/requests/{$sr->id}/approve")
            ->assertOk();

        $sr->refresh();
        $this->assertSame('approved', $sr->status);
        $this->assertSame($room->id, (int) $sr->boarding_room_id);

        $this->assertDatabaseHas('boarding_room_reservations', [
            'source_type' => 'service_request',
            'source_id' => $sr->id,
            'room_id' => $room->id,
        ]);
    }

    public function test_same_day_approval_keeps_boarding_and_reservation_dates_aligned(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-12 12:00:00', 'Asia/Manila'));
        $receptionist = $this->staff('receptionist');
        [, $customer, $pet] = $this->customerWithPet();
        $room = $this->boardingRoom();
        $date = Carbon::tomorrow('Asia/Manila')->toDateString();
        $sr = $this->serviceRequest([
            'customer_id' => $customer->user_id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'hotel',
            'service_name' => 'Pet Hotel',
            'request_date' => $date,
            'check_out_date' => $date,
            'booking_channel' => 'walk_in',
            'status' => 'pending',
            'boarding_room_id' => $room->id,
            'room_type' => $room->room_type,
            'room_name' => $room->room_name,
            'daily_rate' => $room->daily_rate,
            'total_days' => 1,
            'total_amount' => 800,
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->postJson("/api/receptionist/requests/{$sr->id}/approve")
            ->assertOk();

        $boarding = Boarding::where('service_request_id', $sr->id)->firstOrFail();
        $reservation = BoardingRoomReservation::where('source_type', 'service_request')
            ->where('source_id', $sr->id)
            ->firstOrFail();
        $this->assertSame($date, $boarding->check_in->toDateString());
        $this->assertSame($date, $boarding->check_out->toDateString());
        $this->assertSame($date, $reservation->check_in_date->toDateString());
        $this->assertSame($date, $reservation->check_out_date->toDateString());
    }

    public function test_legacy_hotel_booking_does_not_consume_a_modern_room_with_the_same_id(): void
    {
        [, $customer, $pet] = $this->customerWithPet();
        $legacyRoom = HotelRoom::factory()->create(['status' => 'available']);
        $modernRoom = BoardingRoom::forceCreate([
            'id' => $legacyRoom->id,
            'room_code' => 'POOL-' . $legacyRoom->id,
            'room_name' => 'Modern Dog Kennel',
            'room_type' => 'dog_standard',
            'hotel_category' => 'dog_hotel',
            'allowed_species' => ['dog'],
            'max_capacity' => 1,
            'total_rooms' => 1,
            'daily_rate' => 800,
            'is_active' => true,
            'customer_selectable' => true,
        ]);
        $date = Carbon::tomorrow()->toDateString();

        Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'hotel_room_id' => $legacyRoom->id,
            'check_in' => $date,
            'check_out' => Carbon::parse($date)->addDay()->toDateString(),
            'status' => 'approved',
        ]);

        $rooms = $this->getJson('/api/boarding/rooms/available?species=dog&check_in_date=' . $date . '&check_out_date=' . $date)
            ->assertOk()
            ->json('rooms');

        $modern = collect($rooms)->firstWhere('id', $modernRoom->id);
        $this->assertNotNull($modern);
        $this->assertTrue((bool) $modern['available']);
        $this->assertSame(1, (int) $modern['available_rooms']);
    }
}
