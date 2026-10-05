<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\Grooming;
use App\Models\HotelRoom;
use App\Models\PaymentSettlement;
use App\Models\Pet;
use App\Models\Sale;
use App\Models\Service;
use App\Models\ServiceItemUsage;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\RevenueService;
use App\Services\ServiceBillingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Phase-2 billing remediation: base-item safety, payment ordering,
 * derived-state integrity, legacy /pay routes, revenue, authorization.
 */
class ServiceBillingRemediationTest extends TestCase
{
    use RefreshDatabase;

    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['customer', 'receptionist', 'super_receptionist', 'cashier', 'veterinary', 'admin', 'inventory'] as $role) {
            $this->users[$role] = User::factory()->create(['role' => $role]);
        }
    }

    private function as(string $role): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $this->users[$role]->createToken('t')->plainTextToken]);
    }

    private function boarding(array $attrs = []): Boarding
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        return Boarding::create(array_merge([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in' => now()->toDateString(),
            'check_out' => now()->addDay()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'total_amount' => 800,
        ], $attrs));
    }

    private function grooming(array $attrs = []): Grooming
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        return Grooming::create(array_merge([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Full Groom',
            'appointment_date' => now()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'amount' => 500,
            'total_amount' => 500,
        ], $attrs));
    }

    private function appointment(array $attrs = []): Appointment
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::create(['name' => 'Checkup', 'category' => 'Consultation', 'price' => 500, 'is_active' => true]);

        return Appointment::create(array_merge([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'scheduled_at' => now()->addDay(),
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'total_amount' => 500,
            'price' => 500,
        ], $attrs));
    }

    private function addItem(string $type, int $id, array $overrides = []): array
    {
        return ServiceBillingService::addBillingItem(array_merge([
            'service_type' => $type,
            'service_id' => $id,
            'item_type' => ServiceItemUsage::ITEM_MANUAL_CHARGE,
            'description' => 'Extra charge',
            'quantity' => 1,
            'unit_price' => 300,
        ], $overrides));
    }

    private function actingAsStaff(string $role = 'receptionist'): void
    {
        $this->actingAs($this->users[$role]);
    }

    /* ------------------------------------------------------------------ */
    /*  Base billing item                                                  */
    /* ------------------------------------------------------------------ */

    public function test_ensure_base_item_creates_from_authoritative_amount(): void
    {
        $boarding = $this->boarding(['total_amount' => 900]);

        $item = ServiceBillingService::ensureBaseServiceItem('boarding', $boarding->id);

        $this->assertNotNull($item);
        $this->assertSame('boarding', $item->service_type);
        $this->assertSame($boarding->id, $item->service_id);
        $this->assertSame('base_service', $item->item_type);
        $this->assertEquals(900.0, (float) $item->total_price);
        $this->assertFalse((bool) $item->is_paid);
    }

    public function test_ensure_base_item_is_idempotent(): void
    {
        $boarding = $this->boarding(['total_amount' => 900]);

        $first = ServiceBillingService::ensureBaseServiceItem('boarding', $boarding->id);
        $second = ServiceBillingService::ensureBaseServiceItem('boarding', $boarding->id);

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, ServiceItemUsage::where('service_type', 'boarding')
            ->where('service_id', $boarding->id)
            ->where('item_type', 'base_service')
            ->count());
    }

    public function test_ensure_base_item_does_not_touch_other_services(): void
    {
        $boarding = $this->boarding(['total_amount' => 900]);
        $other = $this->boarding(['total_amount' => 400]);

        ServiceBillingService::ensureBaseServiceItem('boarding', $boarding->id);

        $this->assertSame(0, ServiceItemUsage::where('service_type', 'boarding')
            ->where('service_id', $other->id)->count());
    }

    public function test_ensure_base_item_returns_null_for_zero_amount(): void
    {
        $boarding = $this->boarding(['total_amount' => 0]);

        $this->assertNull(ServiceBillingService::ensureBaseServiceItem('boarding', $boarding->id));
        $this->assertSame(0, ServiceItemUsage::count());
    }

    public function test_ensure_base_item_mirrors_paid_state(): void
    {
        // The boarding-2 production signature: paid record, missing base item.
        $boarding = $this->boarding(['total_amount' => 800, 'payment_status' => 'paid', 'amount_paid' => 0, 'balance_due' => 0]);

        $item = ServiceBillingService::ensureBaseServiceItem('boarding', $boarding->id);

        $this->assertTrue((bool) $item->is_paid);

        ServiceBillingService::syncServicePaymentState('boarding', $boarding->id);
        $boarding->refresh();
        $this->assertSame('paid', $boarding->payment_status);
        $this->assertEquals(800.0, (float) $boarding->amount_paid);
        $this->assertEquals(0.0, (float) $boarding->balance_due);
        $this->assertEquals(800.0, (float) $boarding->total_amount);
    }

    /* ------------------------------------------------------------------ */
    /*  Payment verification                                               */
    /* ------------------------------------------------------------------ */

    public function test_verify_boarding_without_base_item_still_settles(): void
    {
        $boarding = $this->boarding(['total_amount' => 800, 'payment_status' => 'pending', 'payment_proof' => 'payment-proofs/p.png']);

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF-800-BASE',
        ])->assertOk();

        $boarding->refresh();
        $this->assertSame('paid', $boarding->payment_status);
        $this->assertEquals(800.0, (float) $boarding->amount_paid);
        $this->assertEquals(0.0, (float) $boarding->balance_due);
        $this->assertNotNull($boarding->receipt_number);

        $settlement = PaymentSettlement::firstOrFail();
        $this->assertEquals(800.0, (float) $settlement->amount);
        $this->assertSame('boarding', $settlement->settleable_type);

        // Base item was materialized and marked paid by the same flow.
        $base = ServiceItemUsage::where('service_type', 'boarding')
            ->where('service_id', $boarding->id)
            ->where('item_type', 'base_service')
            ->sole();
        $this->assertTrue((bool) $base->is_paid);
    }

    public function test_duplicate_verification_rejected(): void
    {
        $boarding = $this->boarding(['total_amount' => 800, 'payment_status' => 'pending', 'payment_proof' => 'payment-proofs/p.png']);

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF-DUP-VERIFY',
        ])->assertOk();

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF-DUP-VERIFY',
        ])->assertStatus(422);

        $this->assertSame(1, PaymentSettlement::count());
    }

    public function test_verify_with_unpaid_addon_settles_base_only(): void
    {
        $boarding = $this->boarding(['total_amount' => 900, 'payment_status' => 'pending', 'payment_proof' => 'payment-proofs/p.png']);
        $this->actingAsStaff('receptionist');
        $this->addItem('boarding', $boarding->id, ['unit_price' => 300, 'description' => 'Extra food']);
        $boarding->refresh();
        $this->assertEquals(1200.0, (float) $boarding->total_amount);

        // Payment proof covers the base; verification settles what was paid.
        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF-BASE-ONLY',
        ])->assertOk();

        $boarding->refresh();
        $this->assertEquals(1200.0, (float) $boarding->total_amount);
        $this->assertEquals(900.0, (float) $boarding->amount_paid);
        $this->assertEquals(300.0, (float) $boarding->balance_due);
        $this->assertSame('partial', $boarding->payment_status);

        $settlement = PaymentSettlement::firstOrFail();
        $this->assertEquals(900.0, (float) $settlement->amount);
        $this->assertEquals(900.0, (float) $settlement->items()->sum('total_price'));
    }

    public function test_item_settlement_after_partial_verify_completes_bill(): void
    {
        $boarding = $this->boarding(['total_amount' => 900, 'payment_status' => 'pending', 'payment_proof' => 'payment-proofs/p.png']);
        $this->actingAsStaff('receptionist');
        $this->addItem('boarding', $boarding->id, ['unit_price' => 300, 'description' => 'Extra food']);

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF-BASE-ONLY',
        ])->assertOk();

        $addon = ServiceItemUsage::where('service_type', 'boarding')
            ->where('service_id', $boarding->id)
            ->where('is_paid', false)->sole();

        $this->as('cashier')->patchJson('/api/billing/items/mark-paid', [
            'item_ids' => [$addon->id],
            'payment_method' => 'cash',
            'reference_number' => 'CASH-300',
        ])->assertOk();

        $boarding->refresh();
        $this->assertSame('paid', $boarding->payment_status);
        $this->assertEquals(1200.0, (float) $boarding->amount_paid);
        $this->assertEquals(0.0, (float) $boarding->balance_due);
        $this->assertSame(2, PaymentSettlement::count());
        $this->assertEquals(1200.0, (float) PaymentSettlement::sum('amount'));
    }

    public function test_reject_flow(): void
    {
        $boarding = $this->boarding(['payment_status' => 'pending', 'payment_proof' => 'payment-proofs/p.png']);

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/reject", [
            'type' => 'boarding', 'rejection_reason' => 'Proof unreadable',
        ])->assertOk();

        $this->assertSame('rejected', $boarding->fresh()->payment_status);
        $this->assertSame(0, PaymentSettlement::count());
    }

    /* ------------------------------------------------------------------ */
    /*  Additional charges & discounts                                     */
    /* ------------------------------------------------------------------ */

    public function test_add_charge_increases_bill_not_replace(): void
    {
        $boarding = $this->boarding(['total_amount' => 900]);
        $this->actingAsStaff('receptionist');

        $result = $this->addItem('boarding', $boarding->id, ['unit_price' => 300]);

        $this->assertTrue($result['success']);
        $this->assertEquals(1200.0, (float) $result['billing']['total_bill']);
        $boarding->refresh();
        $this->assertEquals(1200.0, (float) $boarding->total_amount);
        $this->assertEquals(1200.0, (float) $boarding->balance_due);
    }

    public function test_charge_after_payment_reopens_balance(): void
    {
        $boarding = $this->boarding(['total_amount' => 900, 'payment_status' => 'pending', 'payment_proof' => 'payment-proofs/p.png']);
        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF-PAID-900',
        ])->assertOk();
        $this->assertSame('paid', $boarding->fresh()->payment_status);

        $this->actingAsStaff('receptionist');
        $result = $this->addItem('boarding', $boarding->id, ['unit_price' => 300]);

        $boarding->refresh();
        $this->assertEquals(1200.0, (float) $boarding->total_amount);
        $this->assertEquals(900.0, (float) $boarding->amount_paid);
        $this->assertEquals(300.0, (float) $boarding->balance_due);
        $this->assertSame('partial', $boarding->payment_status);
    }

    public function test_duplicate_charge_deduped_but_distinct_charges_kept(): void
    {
        $boarding = $this->boarding(['total_amount' => 900]);
        $this->actingAsStaff('receptionist');

        $first = $this->addItem('boarding', $boarding->id, ['unit_price' => 300, 'description' => 'Extra food']);
        $retry = $this->addItem('boarding', $boarding->id, ['unit_price' => 300, 'description' => 'Extra food']);

        $this->assertTrue($retry['duplicate'] ?? false);
        $this->assertSame($first['billing_item']->id, $retry['billing_item']->id);
        $this->assertSame(
            2, // base + one add-on
            ServiceItemUsage::where('service_type', 'boarding')->where('service_id', $boarding->id)->count()
        );

        // A genuinely different second charge must not collapse.
        $second = $this->addItem('boarding', $boarding->id, ['unit_price' => 150, 'description' => 'Playtime']);
        $this->assertEmpty($second['duplicate'] ?? null);
        $this->assertSame(3, ServiceItemUsage::where('service_type', 'boarding')->where('service_id', $boarding->id)->count());
    }

    public function test_discount_subtracts_and_clamps(): void
    {
        $boarding = $this->boarding(['total_amount' => 900]);
        $this->actingAsStaff('receptionist');

        $result = $this->addItem('boarding', $boarding->id, [
            'item_type' => 'discount',
            'description' => 'Loyalty discount',
            'unit_price' => 200,
        ]);

        $this->assertTrue($result['success']);
        $this->assertEquals(700.0, (float) $result['billing']['total_bill']);
        $this->assertEquals(900.0, (float) $result['billing']['gross_bill']);
        $this->assertEquals(200.0, (float) $result['billing']['discount_total']);
        $boarding->refresh();
        $this->assertEquals(700.0, (float) $boarding->total_amount);
        $this->assertEquals(700.0, (float) $boarding->balance_due);
    }

    public function test_discount_exceeding_bill_rejected(): void
    {
        $boarding = $this->boarding(['total_amount' => 900]);
        $this->actingAsStaff('receptionist');

        $this->expectException(\Exception::class);
        $this->addItem('boarding', $boarding->id, [
            'item_type' => 'discount',
            'description' => 'Too big',
            'unit_price' => 1000,
        ]);
    }

    /* ------------------------------------------------------------------ */
    /*  Scheduling                                                         */
    /* ------------------------------------------------------------------ */

    public function test_schedule_keeps_base_item_aligned_with_total(): void
    {
        $room = HotelRoom::create(['room_number' => 'R1', 'name' => 'Suite', 'daily_rate' => 800, 'status' => 'available']);
        $boarding = $this->boarding(['total_amount' => 800, 'payment_status' => 'unpaid']);

        $this->as('receptionist')->postJson("/api/receptionist/boarding-requests/{$boarding->id}/schedule", [
            'hotel_room_id' => $room->id,
            'check_in' => now()->toDateString(),
            'total_amount' => 900,
        ])->assertOk();

        $boarding->refresh();
        $this->assertEquals(900.0, (float) $boarding->total_amount);

        $base = ServiceItemUsage::where('service_type', 'boarding')
            ->where('service_id', $boarding->id)
            ->where('item_type', 'base_service')
            ->sole();
        $this->assertEquals(900.0, (float) $base->total_price);
        $this->assertFalse((bool) $base->is_paid);
    }

    public function test_schedule_cannot_repriced_paid_boarding(): void
    {
        $room = HotelRoom::create(['room_number' => 'R2', 'name' => 'Suite', 'daily_rate' => 800, 'status' => 'available']);
        $boarding = $this->boarding(['total_amount' => 800, 'payment_status' => 'paid', 'amount_paid' => 800, 'status' => 'approved']);

        $this->as('receptionist')->postJson("/api/receptionist/boarding-requests/{$boarding->id}/schedule", [
            'hotel_room_id' => $room->id,
            'check_in' => now()->toDateString(),
            'total_amount' => 1000,
        ])->assertStatus(422);

        $this->assertEquals(800.0, (float) $boarding->fresh()->total_amount);
    }

    /* ------------------------------------------------------------------ */
    /*  Legacy /pay routes                                                 */
    /* ------------------------------------------------------------------ */

    public function test_legacy_boarding_pay_uses_canonical_settlement(): void
    {
        $boarding = $this->boarding([
            'total_amount' => 800,
            'status' => 'confirmed',
            'payment_status' => 'unpaid',
        ]);

        $this->as('cashier')->postJson("/api/boardings/{$boarding->id}/pay", [
            'payment_method' => 'cash',
        ])->assertOk();

        $boarding->refresh();
        $this->assertSame('paid', $boarding->payment_status);
        $this->assertEquals(800.0, (float) $boarding->amount_paid);

        $settlement = PaymentSettlement::firstOrFail();
        $this->assertSame('boarding', $settlement->settleable_type);
        $this->assertEquals(800.0, (float) $settlement->amount);
        $this->assertSame(0, Sale::count());
    }

    public function test_legacy_appointment_pay_creates_no_sale_row(): void
    {
        $appointment = $this->appointment(['payment_status' => 'unpaid']);

        $this->as('cashier')->postJson("/api/appointments/{$appointment->id}/pay", [
            'payment_method' => 'cash',
        ])->assertOk();

        $appointment->refresh();
        $this->assertSame('paid', $appointment->payment_status);
        $this->assertEquals(500.0, (float) $appointment->amount_paid);
        $this->assertSame(0, Sale::count());

        $settlement = PaymentSettlement::firstOrFail();
        $this->assertSame('appointment', $settlement->settleable_type);
        $this->assertEquals(500.0, (float) $settlement->amount);
    }

    /* ------------------------------------------------------------------ */
    /*  Revenue                                                            */
    /* ------------------------------------------------------------------ */

    public function test_revenue_counts_each_paid_source_once(): void
    {
        $boarding = $this->boarding(['total_amount' => 800, 'payment_status' => 'paid', 'amount_paid' => 800]);
        $grooming = $this->grooming(['payment_status' => 'paid', 'amount_paid' => 500]);
        $appointment = $this->appointment(['payment_status' => 'paid', 'amount_paid' => 500]);
        Sale::create(['amount' => 250, 'type' => 'product', 'status' => 'completed']);

        $total = app(RevenueService::class)->total();
        $this->assertEquals(800 + 500 + 500 + 250, $total);
    }

    public function test_linked_service_request_not_double_counted(): void
    {
        $customer = Customer::factory()->create();
        $sr = ServiceRequest::create([
            'customer_id' => $this->users['customer']->id,
            'customer_name' => 'Customer',
            'customer_email' => 'c@example.com',
            'pet_name' => 'Max',
            'request_type' => 'hotel',
            'service_name' => 'Boarding',
            'total_amount' => 800,
            'status' => 'approved',
            'payment_status' => 'paid',
        ]);

        $boarding = $this->boarding([
            'total_amount' => 800,
            'payment_status' => 'paid',
            'service_request_id' => $sr->id,
        ]);

        $total = app(RevenueService::class)->total();
        // The linked boarding leg owns the money; the SR must not add again.
        $this->assertEquals(800.0, $total);
    }

    public function test_partial_settlement_counted_when_record_unpaid(): void
    {
        $boarding = $this->boarding(['total_amount' => 1200, 'payment_status' => 'partial', 'amount_paid' => 900]);

        PaymentSettlement::create([
            'settleable_type' => 'boarding',
            'settleable_id' => $boarding->id,
            'amount' => 900,
            'status' => 'paid',
            'idempotency_key' => 'verify:boarding:test-partial',
        ]);

        $total = app(RevenueService::class)->total();
        $this->assertEquals(900.0, $total);
    }

    public function test_settlement_excluded_once_record_paid(): void
    {
        $boarding = $this->boarding(['total_amount' => 800, 'payment_status' => 'paid', 'amount_paid' => 800]);

        PaymentSettlement::create([
            'settleable_type' => 'boarding',
            'settleable_id' => $boarding->id,
            'amount' => 800,
            'status' => 'paid',
            'idempotency_key' => 'verify:boarding:test-paid',
        ]);

        // Boarding leg counts 800; the settlement must not double it.
        $this->assertEquals(800.0, app(RevenueService::class)->total());
    }

    /* ------------------------------------------------------------------ */
    /*  Authorization                                                      */
    /* ------------------------------------------------------------------ */

    public function test_receptionist_and_super_receptionist_can_add_grooming_charge(): void
    {
        $grooming = $this->grooming();

        $this->as('receptionist')->postJson('/api/billing/items', [
            'service_type' => 'grooming',
            'service_id' => $grooming->id,
            'item_type' => 'manual_charge',
            'description' => 'De-matting',
            'quantity' => 1,
            'unit_price' => 300,
        ])->assertStatus(201);

        $this->as('super_receptionist')->postJson('/api/billing/items', [
            'service_type' => 'grooming',
            'service_id' => $grooming->id,
            'item_type' => 'manual_charge',
            'description' => 'Nail trim',
            'quantity' => 1,
            'unit_price' => 100,
        ])->assertStatus(201);
    }

    public function test_veterinary_role_cannot_add_boarding_charge(): void
    {
        $boarding = $this->boarding();

        $this->as('veterinary')->postJson('/api/billing/items', [
            'service_type' => 'boarding',
            'service_id' => $boarding->id,
            'item_type' => 'manual_charge',
            'description' => 'Extra',
            'quantity' => 1,
            'unit_price' => 100,
        ])->assertStatus(422);
    }

    public function test_customer_cannot_add_billing_items(): void
    {
        $boarding = $this->boarding();

        $this->as('customer')->postJson('/api/billing/items', [
            'service_type' => 'boarding',
            'service_id' => $boarding->id,
            'item_type' => 'manual_charge',
            'description' => 'Extra',
            'quantity' => 1,
            'unit_price' => 100,
        ])->assertStatus(403);
    }

    /* ------------------------------------------------------------------ */
    /*  Cashier transaction history                                        */
    /* ------------------------------------------------------------------ */

    public function test_cashier_transactions_include_settlements(): void
    {
        $boarding = $this->boarding(['total_amount' => 800, 'payment_status' => 'pending', 'payment_proof' => 'payment-proofs/p.png']);
        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF-HIST-1',
        ])->assertOk();

        Sale::create(['amount' => 150, 'type' => 'product', 'status' => 'completed']);

        $response = $this->as('cashier')->getJson('/api/cashier/transactions');
        $response->assertOk();

        $settlement = PaymentSettlement::firstOrFail();

        $rows = collect($response->json('transactions') ?? $response->json('data') ?? $response->json());
        $this->assertTrue($rows->contains(fn ($t) => ($t['id'] ?? '') === 'SETTLEMENT-' . $settlement->id));
        $this->assertTrue($rows->contains(fn ($t) => str_starts_with((string) ($t['id'] ?? ''), 'SALE-')));
    }
}
