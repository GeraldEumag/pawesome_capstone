<?php

namespace Tests\Feature;

use App\Mail\AccountWelcomeMail;
use App\Models\AddOn;
use App\Models\EmailDelivery;
use App\Models\Boarding;
use App\Models\BoardingRoom;
use App\Models\BookingAddOn;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\Notification;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Services\EmailDeliveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Regression tests for the P1 security/data-integrity hardening fixes:
 *  1. Deactivated users must not use previously issued API tokens.
 *  2. POS and customer checkout must not trust client-supplied prices/totals.
 *  3. Boarding add-on inventory deduction must be atomic, idempotent,
 *     and restored when an already-deducted booking is rejected.
 */
class P1SecurityIntegrityTest extends TestCase
{
    use RefreshDatabase;

    /* ---------------------------------------------------------------
     | P1-1 — Deactivated users must not use existing tokens
     * -------------------------------------------------------------- */

    private function bearer(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('test')->plainTextToken];
    }

    public function test_active_user_can_access_protected_endpoint(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'is_active' => true]);

        $this->getJson('/api/auth/me', $this->bearer($customer))->assertOk();
    }

    public function test_deactivated_user_token_is_rejected(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $headers = $this->bearer($customer);

        // Sanity: token works while active
        $this->getJson('/api/auth/me', $headers)->assertOk();

        // Deactivate in the database — the existing token must stop working
        $customer->update(['is_active' => false]);

        $this->getJson('/api/auth/me', $headers)->assertStatus(401);
    }

    public function test_invalid_token_is_rejected(): void
    {
        $this->getJson('/api/auth/me', ['Authorization' => 'Bearer not-a-real-token'])
            ->assertStatus(401);
    }

    public function test_missing_token_is_rejected(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_reactivated_user_token_works_again(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $headers = $this->bearer($customer);

        $customer->update(['is_active' => false]);
        $this->getJson('/api/auth/me', $headers)->assertStatus(401);

        $customer->update(['is_active' => true]);
        $this->getJson('/api/auth/me', $headers)->assertOk();
    }

    /* ---------------------------------------------------------------
     | P1-2 — Client-supplied prices must never be persisted
     * -------------------------------------------------------------- */

    private function makeProduct(array $overrides = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'sku' => 'P1-' . uniqid(),
            'name' => 'Test Product',
            'category' => 'Food',
            'price' => 500,
            'stock' => 50,
            'reorder_level' => 5,
            'status' => 'active',
            'is_sellable' => true,
        ], $overrides));
    }

    public function test_pos_ignores_manipulated_price_and_total(): void
    {
        $cashier = User::factory()->create(['role' => 'cashier']);
        $product = $this->makeProduct(['price' => 500]);

        // Attacker sends a real product with a fake ₱1 price and ₱2 total
        $response = $this->postJson('/api/cashier/pos/transaction', [
            'items' => [[
                'item_id' => $product->id,
                'item_type' => 'product',
                'item_name' => $product->name,
                'quantity' => 2,
                'unit_price' => 1,
            ]],
            'subtotal' => 2,
            'tax' => 0,
            'discount' => 0,
            'total' => 2,
            'payment_method' => 'cash',
            'cash_received' => 2,
        ], $this->bearer($cashier));

        $response->assertOk()->assertJsonPath('success', true);

        // Authoritative values: 500 * 2 = 1000
        $this->assertDatabaseHas('sale_items', [
            'product_id' => $product->id,
            'unit_price' => 500,
            'total_price' => 1000,
        ]);
        $this->assertDatabaseHas('sales', ['total_amount' => 1000]);
        $this->assertDatabaseHas('payments', ['amount' => 1000]);
        $this->assertEquals(48, $product->fresh()->stock);
    }

    public function test_pos_legitimate_sale_still_works(): void
    {
        $cashier = User::factory()->create(['role' => 'cashier']);
        $product = $this->makeProduct(['price' => 250]);

        $response = $this->postJson('/api/cashier/pos/transaction', [
            'items' => [[
                'item_id' => $product->id,
                'item_type' => 'product',
                'item_name' => $product->name,
                'quantity' => 2,
                'unit_price' => 250,
            ]],
            'payment_method' => 'cash',
            'cash_received' => 500,
        ], $this->bearer($cashier));

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertEquals(500, $response->json('transaction.total_amount'));
        $this->assertEquals(48, $product->fresh()->stock);
    }

    public function test_customer_store_checkout_is_disabled_without_creating_orders(): void
    {
        $customer = User::factory()->create([
            'role' => 'customer',
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        Customer::create(['user_id' => $customer->id, 'name' => $customer->name, 'email' => $customer->email]);
        $product = $this->makeProduct(['price' => 500]);

        $response = $this->postJson('/api/customer/store/checkout', [
            'items' => [[
                'product_id' => $product->id,
                'name' => $product->name,
                'quantity' => 2,
                'price' => 1,          // tampered
            ]],
            'total_amount' => 2,       // tampered
            'order_type' => 'Pick-up',
            'payment_method' => 'GCash',
        ], $this->bearer($customer));

        $response->assertStatus(410)
            ->assertJsonPath('message', 'Customer store order workflows are disabled.');

        $this->assertDatabaseCount('customer_orders', 0);
        $this->assertDatabaseCount('customer_order_items', 0);
        $this->assertEquals(50, $product->fresh()->stock);
    }

    /* ---------------------------------------------------------------
     | P1-3 — Boarding add-on inventory deduction
     * -------------------------------------------------------------- */

    private function makeBoardingWithInventoryAddOn(int $itemStock = 10, int $requiredQty = 2): array
    {
        $user = User::factory()->create(['role' => 'customer', 'is_active' => true]);

        // pets.customer_id and boardings.customer_id reference customers.id
        $customer = Customer::create([
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);

        $pet = Pet::create([
            'customer_id' => $customer->id,
            'name' => 'Buddy',
            'species' => 'dog',
        ]);

        $boarding = Boarding::create([
            'customer_id' => $customer->id,
            'customer_email' => $user->email,
            'customer_name' => $user->name,
            'pet_id' => $pet->id,
            'pet_name' => 'Buddy',
            'pet_type' => 'dog',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
            'check_in' => now()->addDay()->toDateString(),
            'check_out' => now()->addDays(3)->toDateString(),
            'total_amount' => 1000,
        ]);

        $item = $this->makeProduct(['stock' => $itemStock]);

        $addOn = AddOn::create([
            'name' => 'Premium Dog Food',
            'add_on_type' => 'inventory_item',
            'charge_type' => 'one_time',
            'unit_price' => 150,
            'inventory_item_id' => $item->id,
            'quantity_per_unit' => $requiredQty,
            'status' => true,
        ]);

        $bookingAddOn = BookingAddOn::create([
            'booking_id' => $boarding->id,
            'add_on_id' => $addOn->id,
            'inventory_item_id' => $item->id,
            'name' => $addOn->name,
            'add_on_type' => 'inventory_item',
            'charge_type' => 'one_time',
            'quantity' => 1,
            'unit_price' => 150,
            'number_of_days' => 1,
            'subtotal' => 150,
        ]);

        return [$boarding, $item, $bookingAddOn];
    }

    public function test_approval_deducts_addon_inventory_once(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        [$boarding, $item, $bookingAddOn] = $this->makeBoardingWithInventoryAddOn(10, 2);

        $response = $this->postJson(
            "/api/receptionist/boarding-requests/{$boarding->id}/approve",
            [],
            $this->bearer($receptionist)
        );

        $response->assertOk();
        $this->assertEquals('approved', $boarding->fresh()->status);

        // quantity_per_unit(2) * selected(1) = 2 deducted, exactly once
        $this->assertEquals(8, $item->fresh()->stock);
        $this->assertDatabaseHas('inventory_logs', [
            'inventory_item_id' => $item->id,
            'movement_type' => 'boarding_addon_usage',
            'reference_type' => 'boarding',
            'reference_id' => $boarding->id,
        ]);
        $this->assertEquals('deducted', $bookingAddOn->fresh()->deduction_status);

        // Re-approval must fail (not pending) and must not deduct again
        $this->postJson(
            "/api/receptionist/boarding-requests/{$boarding->id}/approve",
            [],
            $this->bearer($receptionist)
        )->assertStatus(422);
        $this->assertEquals(8, $item->fresh()->stock);
    }

    public function test_insufficient_stock_blocks_approval_atomically(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        [$boarding, $item] = $this->makeBoardingWithInventoryAddOn(1, 5);

        $response = $this->postJson(
            "/api/receptionist/boarding-requests/{$boarding->id}/approve",
            [],
            $this->bearer($receptionist)
        );

        $response->assertStatus(422);
        $this->assertEquals('pending', $boarding->fresh()->status);
        $this->assertEquals(1, $item->fresh()->stock);
        $this->assertDatabaseMissing('inventory_logs', [
            'inventory_item_id' => $item->id,
            'movement_type' => 'boarding_addon_usage',
        ]);
    }

    public function test_rejecting_approved_boarding_restores_addon_stock(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        [$boarding, $item, $bookingAddOn] = $this->makeBoardingWithInventoryAddOn(10, 2);

        $this->postJson(
            "/api/receptionist/boarding-requests/{$boarding->id}/approve",
            [],
            $this->bearer($receptionist)
        )->assertOk();
        $this->assertEquals(8, $item->fresh()->stock);

        $this->postJson(
            "/api/receptionist/boarding-requests/{$boarding->id}/reject",
            ['rejection_reason' => 'Customer requested cancellation'],
            $this->bearer($receptionist)
        )->assertOk();

        $this->assertEquals('rejected', $boarding->fresh()->status);
        $this->assertEquals(10, $item->fresh()->stock);
        $this->assertEquals('restored', $bookingAddOn->fresh()->deduction_status);
        $this->assertDatabaseHas('inventory_logs', [
            'inventory_item_id' => $item->id,
            'movement_type' => 'boarding_addon_restore',
            'reference_id' => $boarding->id,
        ]);
    }

    public function test_rejecting_pending_boarding_is_unaffected(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        [$boarding, $item] = $this->makeBoardingWithInventoryAddOn(10, 2);

        $this->postJson(
            "/api/receptionist/boarding-requests/{$boarding->id}/reject",
            ['rejection_reason' => 'Dates unavailable'],
            $this->bearer($receptionist)
        )->assertOk();

        $this->assertEquals('rejected', $boarding->fresh()->status);
        $this->assertEquals(10, $item->fresh()->stock);
    }

    /* ---------------------------------------------------------------
     | P1-4 — Service-request recipient/price integrity + walk-in
     |        credential handling
     * -------------------------------------------------------------- */

    private function verifiedCustomer(array $overrides = []): array
    {
        $user = User::factory()->create(array_merge([
            'role' => 'customer',
            'is_active' => true,
            'email_verified_at' => now(),
        ], $overrides));

        $customer = Customer::create([
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);

        return [$user, $customer];
    }

    public function test_service_request_binds_email_to_account_and_price_to_service(): void
    {
        [$user, $customer] = $this->verifiedCustomer(['email' => 'real-customer@example.com']);
        $pet = Pet::create(['customer_id' => $customer->id, 'name' => 'Buddy', 'species' => 'dog']);
        Service::create([
            'name' => 'Vet Consultation',
            'category' => 'Consultation',
            'price' => 500,
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/customer/requests', [
            'customer_name' => $user->name,
            'customer_email' => 'attacker@example.com', // must be ignored
            'pet_id' => $pet->id,
            'pet_name' => 'Buddy',
            'request_type' => 'veterinary',
            'service_name' => 'Vet Consultation',
            'requested_date' => now()->addDay()->toDateString(),
            'requested_time' => '10:00',
            'price' => 1,            // must be ignored
            'total_amount' => 1,     // must be ignored
        ], $this->bearer($user));

        $response->assertCreated();

        $this->assertDatabaseHas('service_requests', [
            'customer_id' => $user->id,
            'customer_email' => 'real-customer@example.com',
            'price' => 500,
        ]);
        $this->assertDatabaseMissing('service_requests', [
            'customer_email' => 'attacker@example.com',
        ]);
    }

    public function test_dedicated_hotel_booking_computes_total_from_server_room_rate(): void
    {
        Storage::fake('private');
        [$user, $customer] = $this->verifiedCustomer();
        $pet = Pet::create(['customer_id' => $customer->id, 'name' => 'Buddy', 'species' => 'dog']);
        $room = BoardingRoom::create([
            'room_code' => 'P1-ROOM',
            'room_name' => 'Standard Dog Room',
            'room_type' => 'dog_standard',
            'hotel_category' => 'dog_hotel',
            'allowed_species' => ['dog'],
            'daily_rate' => 800,
            'total_rooms' => 2,
            'is_active' => true,
            'customer_selectable' => true,
        ]);

        $response = $this->post('/api/customer/boardings', [
            'pet_id' => $pet->id,
            'room_id' => $room->id,
            'check_in_date' => now()->addDays(3)->toDateString(),
            'number_of_days' => 1,
            'vaccination_card' => UploadedFile::fake()->create('buddy-card.png', 100, 'image/png'),
            'daily_rate' => 1,
            'total_amount' => 1,
            'price' => 1,
        ], $this->bearer($user));

        $response->assertCreated();
        $boarding = $response->json('boarding');
        $this->assertEquals(800, (float) $boarding['total_amount']);
        $this->assertDatabaseHas('boardings', [
            'id' => $boarding['id'],
            'customer_id' => $customer->id,
            'total_amount' => 800,
        ]);
        $this->assertDatabaseHas('boarding_room_reservations', [
            'source_type' => 'pet_hotel',
            'source_id' => $boarding['id'],
            'room_id' => $room->id,
        ]);
    }

    public function test_walk_in_new_customer_gets_set_password_link_not_plaintext_password(): void
    {
        Mail::fake();
        $receptionist = User::factory()->create(['role' => 'receptionist', 'is_active' => true]);
        Service::create([
            'name' => 'Basic Bath',
            'category' => 'Grooming',
            'price' => 350,
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/receptionist/walk-ins', [
            'customer_mode' => 'new',
            'customer' => [
                'first_name' => 'Walkin',
                'last_name' => 'Customer',
                'email' => 'walkin@example.com',
                'phone' => '09171234567',
            ],
            'pet' => ['name' => 'Buddy', 'species' => 'dog'],
            'booking' => [
                'service_type' => 'grooming',
                'service_name' => 'Basic Bath',
                'request_date' => now()->addDay()->toDateString(),
                'request_time' => '10:00',
            ],
        ], $this->bearer($receptionist));

        $response->assertCreated()->assertJsonPath('success', true);

        $user = User::where('email', 'walkin@example.com')->firstOrFail();

        // No persisted notification may contain a plaintext credential
        $notification = Notification::where('user_id', $user->id)->firstOrFail();
        $this->assertStringNotContainsString('temporary password', $notification->message);
        $this->assertStringNotContainsString('password is', $notification->message);

        // Credential delivery is recorded as a durable outbox intent — the
        // token was minted in the same transaction, and a delayed worker
        // still re-validates the token row at send time via suppression.
        $delivery = EmailDelivery::where('event_key', 'auth.account_welcome')->firstOrFail();
        $this->assertSame(EmailDelivery::fingerprint('walkin@example.com'), $delivery->recipient_fingerprint);
        $this->assertNotNull($delivery->suppression);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => 'walkin@example.com']);

        // Run the worker path — the welcome email must reach the customer.
        if ($delivery->status === EmailDelivery::STATUS_PENDING) {
            app(EmailDeliveryService::class)->send($delivery->id, 'test');
        }
        Mail::assertSent(AccountWelcomeMail::class, fn ($m) => $m->hasTo('walkin@example.com'));

        // The customer can set their own password via the emailed token
        $mailable = Mail::sent(AccountWelcomeMail::class)->first();
        $this->postJson('/api/auth/password/reset', [
            'email' => 'walkin@example.com',
            'token' => $mailable->token,
            'new_password' => 'ChosenByCustomer123!',
            'new_password_confirmation' => 'ChosenByCustomer123!',
        ])->assertOk();
        $this->assertTrue(Hash::check('ChosenByCustomer123!', $user->fresh()->password));
    }
}
