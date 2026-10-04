<?php

namespace Tests\Feature;

use App\Models\Boarding;
use App\Models\Customer;
use App\Models\PaymentSettlement;
use App\Models\Pet;
use App\Models\ServiceItemUsage;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\PaymentSettlementService;
use App\Services\ServiceBillingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * P5-A: payment_settlements is the immutable service-side settlement ledger —
 * written inside existing settlement transactions, idempotent, additive only.
 */
class PaymentSettlementTest extends TestCase
{
    use RefreshDatabase;

    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['customer', 'receptionist', 'cashier', 'inventory', 'veterinary', 'admin'] as $role) {
            $this->users[$role] = User::factory()->create(['role' => $role]);
        }
    }

    private function as(string $role): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $this->users[$role]->createToken('t')->plainTextToken]);
    }

    private function pendingBoarding(): Boarding
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        return Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in' => now()->addDay()->toDateString(),
            'check_out' => now()->addDays(3)->toDateString(),
            'status' => 'approved',
            'payment_status' => 'pending',
            'payment_proof' => 'payment-proofs/proof.png',
        ]);
    }

    private function billableItem(Boarding $boarding, float $price = 100, bool $paid = false): ServiceItemUsage
    {
        return ServiceItemUsage::create([
            'service_type' => ServiceItemUsage::SERVICE_BOARDING,
            'service_id' => $boarding->id,
            'quantity_used' => 1,
            'item_type' => ServiceItemUsage::ITEM_BASE_SERVICE,
            'description' => 'Boarding base',
            'unit_price' => $price,
            'total_price' => $price,
            'is_billable' => true,
            'is_paid' => $paid,
        ]);
    }

    public function test_verify_records_settlement_with_snapshot_items(): void
    {
        $boarding = $this->pendingBoarding();
        $this->billableItem($boarding, 150);
        $this->billableItem($boarding, 50);

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF123456',
        ])->assertOk();

        $boarding->refresh();
        $settlement = PaymentSettlement::firstOrFail();
        $this->assertSame('boarding', $settlement->settleable_type);
        $this->assertSame($boarding->id, $settlement->settleable_id);
        $this->assertSame($boarding->customer_id, $settlement->customer_id);
        $this->assertSame($boarding->receipt_number, $settlement->receipt_number);
        $this->assertSame('REF123456', $settlement->reference_number);
        $this->assertSame($this->users['cashier']->id, $settlement->verified_by);
        $this->assertSame(PaymentSettlement::STATUS_PAID, $settlement->status);
        $this->assertNotNull($settlement->paid_at);
        $this->assertNotNull($settlement->verified_at);
        $this->assertSame(200.0, (float) $settlement->amount);
        $this->assertSame(2, $settlement->items()->count());
        $this->assertSame(200.0, (float) $settlement->items()->sum('total_price'));
    }

    public function test_verify_failure_leaves_no_settlement(): void
    {
        $boarding = $this->pendingBoarding();
        $this->billableItem($boarding, 100);

        Boarding::saving(fn () => throw new \RuntimeException('forced billing failure'));

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF123456',
        ])->assertStatus(500);

        $this->assertSame(0, PaymentSettlement::count());
        $this->assertSame('pending', $boarding->fresh()->payment_status);
    }

    public function test_service_request_verify_records_settlement(): void
    {
        $sr = ServiceRequest::create([
            'customer_id' => $this->users['customer']->id,
            'customer_name' => $this->users['customer']->name,
            'customer_email' => $this->users['customer']->email,
            'pet_name' => 'Buddy',
            'request_type' => 'grooming',
            'service_name' => 'Full Groom',
            'price' => 500,
            'total_amount' => 500,
            'status' => 'approved',
            'payment_status' => 'pending',
            'payment_method' => 'gcash',
            'payment_reference' => 'GCASH-REF-1',
            'payment_proof' => 'payment-proofs/proof_test.png',
        ]);

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$sr->id}/verify", [
            'type' => 'service_request', 'reference_number' => 'REF999888',
        ])->assertOk();

        $sr->refresh();
        $settlement = PaymentSettlement::firstOrFail();
        $this->assertSame('service_request', $settlement->settleable_type);
        $this->assertSame($sr->id, $settlement->settleable_id);
        $this->assertSame($sr->receipt_number, $settlement->receipt_number);
        $this->assertSame($this->users['customer']->id, $settlement->user_id);
        $this->assertSame('gcash', $settlement->payment_method);
        $this->assertSame('REF999888', $settlement->reference_number);
        $this->assertSame(500.0, (float) $settlement->amount);
        $this->assertSame('Full Groom', $settlement->items()->first()->description);
    }

    public function test_record_is_idempotent_on_duplicate_key(): void
    {
        $data = [
            'settleable_type' => 'boarding',
            'settleable_id' => 42,
            'amount' => 100,
            'receipt_number' => 'BD-REC-DUP-1',
            'idempotency_key' => 'verify:boarding:42:BD-REC-DUP-1',
        ];

        $first = PaymentSettlementService::record($data);
        $second = PaymentSettlementService::record($data);

        $this->assertSame(1, PaymentSettlement::count());
        $this->assertSame($first->id, $second->id);
    }

    public function test_mark_items_as_paid_records_settlement_per_service(): void
    {
        $boarding = $this->pendingBoarding();
        $a = $this->billableItem($boarding, 100);
        $b = $this->billableItem($boarding, 60);
        $unpaid = $this->billableItem($boarding, 40);

        $result = ServiceBillingService::markItemsAsPaid([$a->id, $b->id], $this->users['cashier']->id, 'cash', 'CASH-1');

        $this->assertTrue($result['success']);
        $settlement = PaymentSettlement::firstOrFail();
        $this->assertSame('boarding', $settlement->settleable_type);
        $this->assertSame($boarding->id, $settlement->settleable_id);
        $this->assertSame(160.0, (float) $settlement->amount);
        $this->assertSame('cash', $settlement->payment_method);
        $this->assertSame('CASH-1', $settlement->reference_number);
        $this->assertSame(2, $settlement->items()->count());
        $this->assertNull($settlement->receipt_number);
    }

    public function test_distinct_item_batches_create_separate_settlements(): void
    {
        $boarding = $this->pendingBoarding();
        $a = $this->billableItem($boarding, 100);
        $b = $this->billableItem($boarding, 60);

        ServiceBillingService::markItemsAsPaid([$a->id], $this->users['cashier']->id);
        ServiceBillingService::markItemsAsPaid([$b->id], $this->users['cashier']->id);

        $this->assertSame(2, PaymentSettlement::count());
        $this->assertSame(160.0, (float) PaymentSettlement::sum('amount'));
    }

    public function test_void_is_append_only_and_idempotent(): void
    {
        $settlement = PaymentSettlementService::record([
            'settleable_type' => 'grooming',
            'settleable_id' => 7,
            'amount' => 80,
            'idempotency_key' => 'verify:grooming:7:GR-REC-1',
        ]);

        PaymentSettlementService::void($settlement, $this->users['cashier']->id, 'Verified in error');

        $settlement->refresh();
        $this->assertSame(PaymentSettlement::STATUS_VOIDED, $settlement->status);
        $this->assertSame($this->users['cashier']->id, $settlement->voided_by);
        $this->assertSame('Verified in error', $settlement->void_reason);
        $this->assertNotNull($settlement->voided_at);

        PaymentSettlementService::void($settlement, $this->users['admin']->id, 'second void');
        $settlement->refresh();
        $this->assertSame('Verified in error', $settlement->void_reason);
    }

    public function test_dead_boarding_payment_endpoint_is_gone(): void
    {
        $boarding = $this->pendingBoarding();

        $response = $this->as('receptionist')->postJson("/api/boardings/{$boarding->id}/payment", [
            'amount' => 100, 'method' => 'cash',
        ]);

        $this->assertContains($response->status(), [404, 405]);
    }
}
