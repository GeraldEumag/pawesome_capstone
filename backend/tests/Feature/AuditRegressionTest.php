<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Dispensation;
use App\Models\HotelRoom;
use App\Models\InventoryItem;
use App\Models\Notification;
use App\Models\Pet;
use App\Models\Sale;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Models\Boarding;
use App\Services\Chatbot\Tools\ChatbotTools;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AuditRegressionTest extends TestCase
{
    use RefreshDatabase;

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('audit-test')->plainTextToken];
    }

    private function staffUser(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function customerPet(): array
    {
        $user = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $customer = Customer::factory()->create(['user_id' => $user->id, 'email' => $user->email]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        return [$user, $customer, $pet];
    }

    public function test_chatbot_tool_role_recheck_blocks_staff_tool_for_customer(): void
    {
        [$user] = $this->customerPet();

        $result = ChatbotTools::execute('get_today_queue', [], $user, 'customer');
        $this->assertSame('tool_not_allowed', $result['data']['error'] ?? null);
    }

    public function test_chatbot_tool_role_recheck_allows_customer_tool(): void
    {
        [$user] = $this->customerPet();

        $result = ChatbotTools::execute('get_services_prices', [], $user, 'customer');
        $this->assertArrayNotHasKey('error', $result['data']);
    }

    public function test_receptionist_grooming_uses_catalog_price_not_client_amount(): void
    {
        $receptionist = $this->staffUser('receptionist');
        [, $customer, $pet] = $this->customerPet();
        Service::factory()->create(['name' => 'Full Groom', 'category' => 'grooming', 'price' => 800, 'is_active' => true]);

        $resp = $this->postJson('/api/grooming', [
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Full Groom',
            'appointment_date' => now()->addDay()->toDateString(),
            'appointment_time' => '10:00',
            'amount' => 1, // must be ignored
        ], $this->authHeaders($receptionist));

        $resp->assertCreated();
        $grooming = \App\Models\Grooming::latest('id')->first();
        $this->assertEquals(800.0, (float) $grooming->total_amount);
    }

    public function test_pos_rejects_insufficient_cash(): void
    {
        $cashier = $this->staffUser('cashier');
        $item = InventoryItem::factory()->create([
            'name' => 'Dog Food', 'sku' => 'SKU-DF1', 'price' => 500, 'stock' => 10,
            'status' => 'active', 'is_sellable' => true,
        ]);

        $resp = $this->postJson('/api/cashier/pos/transaction', [
            'items' => [[
                'item_type' => 'product', 'item_id' => $item->id,
                'item_name' => 'Dog Food', 'quantity' => 1, 'unit_price' => 500,
            ]],
            'payment_method' => 'cash',
            'cash_received' => 100,
        ], $this->authHeaders($cashier));

        $resp->assertStatus(422);
        $this->assertSame(0, Sale::count());
        $this->assertSame(10, (int) $item->fresh()->stock);
    }

    public function test_boarding_update_cannot_set_status_or_payment_status(): void
    {
        $receptionist = $this->staffUser('receptionist');
        [, $customer, $pet] = $this->customerPet();
        $room = HotelRoom::factory()->create(['status' => 'available', 'daily_rate' => 1000]);
        $boarding = Boarding::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'hotel_room_id' => $room->id,
            'check_in' => now()->addDay()->toDateString(),
            'check_out' => now()->addDay()->toDateString(),
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'total_amount' => 1000,
        ]);

        $resp = $this->putJson("/api/boardings/{$boarding->id}", [
            'status' => 'cancelled',
            'payment_status' => 'paid',
            'notes' => 'edit attempt',
        ], $this->authHeaders($receptionist));

        $resp->assertOk();
        $fresh = $boarding->fresh();
        $this->assertSame('pending', $fresh->status);
        $this->assertSame('unpaid', $fresh->payment_status);
        $this->assertSame('edit attempt', $fresh->notes);
    }

    public function test_oversized_idempotency_key_rejected_before_action(): void
    {
        $cashier = $this->staffUser('cashier');

        $resp = $this->patchJson('/api/billing/items/mark-paid', [
            'service_type' => 'veterinary',
            'service_id' => 1,
            'item_ids' => [1],
        ], $this->authHeaders($cashier) + [
            'Idempotency-Key' => str_repeat('k', 200),
        ]);

        $resp->assertStatus(422);
    }

    public function test_expiry_sweep_dedupes_notifications_on_rerun(): void
    {
        $this->staffUser('inventory');
        $item = InventoryItem::factory()->create(['name' => 'Vaccine', 'sku' => 'SKU-VAC1', 'stock' => 5, 'status' => 'active']);
        \App\Models\InventoryBatch::create([
            'inventory_item_id' => $item->id,
            'batch_no' => 'B-1',
            'quantity' => 5,
            'remaining_quantity' => 5,
            'expiration_date' => now()->addDays(20)->toDateString(),
            'received_date' => now()->toDateString(),
            'status' => 'active',
        ]);

        $this->artisan('inventory:check-expiries')->assertExitCode(0);
        $first = Notification::count();
        $this->assertGreaterThan(0, $first);

        $this->artisan('inventory:check-expiries')->assertExitCode(0);
        $this->assertSame($first, Notification::count(), 'Rerun must not duplicate alerts');
    }

    public function test_duplicate_dispense_within_window_is_rejected(): void
    {
        $vet = $this->staffUser('veterinary');
        $item = InventoryItem::factory()->create([
            'name' => 'Antibiotic', 'sku' => 'SKU-AB2', 'price' => 50, 'stock' => 10,
            'status' => 'active', 'item_class' => 'medicine',
        ]);

        \App\Services\DispensingService::dispense([
            'inventory_item_id' => $item->id,
            'quantity' => 1,
        ], $vet->id);

        $this->assertSame(9, (int) $item->fresh()->stock);
        $this->expectException(\RuntimeException::class);
        \App\Services\DispensingService::dispense([
            'inventory_item_id' => $item->id,
            'quantity' => 1,
        ], $vet->id);
    }

    public function test_receipt_confirm_without_any_reference_is_rejected(): void
    {
        $cashier = $this->staffUser('cashier');
        [, $customer, $pet] = $this->customerPet();

        $sr = ServiceRequest::create([
            'request_type' => 'grooming',
            'customer_name' => 'Test Customer',
            'customer_id' => $customer->user_id,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'service_name' => 'Full Groom',
            'status' => 'approved',
            'payment_status' => 'pending',
            'payment_method' => 'gcash',
            'payment_proof' => 'proofs/test.png',
            'booking_channel' => 'online',
        ]);

        $receipt = \App\Models\PaymentReceipt::create([
            'payable_type' => 'service_request',
            'payable_id' => $sr->id,
            'uploaded_by' => $customer->user_id,
            'disk' => 'private',
            'disk_path' => 'proofs/test.png',
            'mime' => 'image/png',
            'sha256' => str_repeat('a', 64),
            'status' => 'ready',
            'provider' => 'gcash',
        ]);

        $resp = $this->postJson("/api/cashier/receipts/{$receipt->id}/confirm", [
            'payment_method' => 'cash', // digital proof must not go down as no-ref cash
        ], $this->authHeaders($cashier));

        $resp->assertStatus(422);
        $this->assertSame('pending', $sr->fresh()->payment_status);
    }

    public function test_query_param_token_is_not_accepted(): void
    {
        $user = $this->staffUser('cashier');
        $token = $user->createToken('leak-test')->plainTextToken;

        $this->getJson('/api/cashier/dashboard?token=' . $token)->assertUnauthorized();
    }

    public function test_pos_idempotency_replays_without_duplicate_sale(): void
    {
        $cashier = $this->staffUser('cashier');
        $item = InventoryItem::factory()->create([
            'name' => 'Shampoo', 'sku' => 'SKU-SH1', 'price' => 200, 'stock' => 5,
            'status' => 'active', 'is_sellable' => true,
        ]);

        $payload = [
            'items' => [[
                'item_type' => 'product', 'item_id' => $item->id,
                'item_name' => 'Shampoo', 'quantity' => 1, 'unit_price' => 200,
            ]],
            'payment_method' => 'cash', 'cash_received' => 200,
        ];
        $headers = $this->authHeaders($cashier) + ['Idempotency-Key' => 'pos-test-key-1'];

        $this->postJson('/api/cashier/pos/transaction', $payload, $headers)->assertOk();
        $replay = $this->postJson('/api/cashier/pos/transaction', $payload, $headers);
        $replay->assertOk()->assertHeader('Idempotent-Replayed', 'true');

        $this->assertSame(1, Sale::count());
        $this->assertSame(4, (int) $item->fresh()->stock);
    }

    public function test_dispensation_void_restores_stock_and_marks_returned(): void
    {
        $vet = $this->staffUser('veterinary');
        $item = InventoryItem::factory()->create([
            'name' => 'Antibiotic', 'sku' => 'SKU-AB3', 'price' => 50, 'stock' => 10,
            'status' => 'active', 'item_class' => 'medicine',
        ]);

        $dispensation = \App\Services\DispensingService::dispense([
            'inventory_item_id' => $item->id, 'quantity' => 2,
        ], $vet->id);
        $this->assertSame(8, (int) $item->fresh()->stock);

        $voided = \App\Services\DispensingService::void($dispensation, $vet->id, 'wrong dose');
        $this->assertSame('returned', $voided->status);
        $this->assertSame(10, (int) $item->fresh()->stock);
    }
}
