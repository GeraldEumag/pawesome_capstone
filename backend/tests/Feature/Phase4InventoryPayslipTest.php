<?php

namespace Tests\Feature;

use App\Models\EmailDelivery;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\Payroll;
use App\Models\User;
use App\Services\EmailDeliveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

/**
 * Phase 4: payslip-release email through the durable outbox, and
 * inventory adjustment/reconciliation hardening.
 */
class Phase4InventoryPayslipTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $employee;
    private User $inventoryStaff;

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = User::factory()->create([
            'role' => 'manager',
            'is_active' => true,
        ]);

        $this->employee = User::factory()->create([
            'role' => 'cashier',
            'is_active' => true,
            'email' => 'phase4.payee@example.com',
        ]);

        $this->inventoryStaff = User::factory()->create([
            'role' => 'inventory',
            'is_active' => true,
        ]);
    }

    private function auth(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('test-token')->plainTextToken];
    }

    private function payrollFor(User $user, string $status = 'pending', array $overrides = []): Payroll
    {
        return Payroll::create(array_merge([
            'payroll_id' => 'PAY-P4-' . strtoupper(uniqid()),
            'user_id' => $user->id,
            'department' => 'Operations',
            'position' => 'Cashier',
            'base_salary' => 25000,
            'pay_period_start' => '2026-01-01',
            'pay_period_end' => '2026-01-15',
            'pay_period_label' => 'Jan 01 - Jan 15, 2026',
            'status' => $status,
            'gross_pay' => 12500,
            'net_pay' => 11000,
        ], $overrides));
    }

    public function test_release_creates_durable_payslip_intent(): void
    {
        $payroll = $this->payrollFor($this->employee);

        $this->postJson("/api/manager/payroll/{$payroll->id}/release", [
            'payment_method' => 'Cash',
        ], $this->auth($this->manager))->assertOk();

        $this->assertDatabaseCount('email_deliveries', 1);

        $delivery = EmailDelivery::sole();
        $this->assertSame('payroll.payslip_released', $delivery->event_key);
        $this->assertSame('payroll.payslip:' . $payroll->id, $delivery->occurrence_key);
        $this->assertSame('payroll', $delivery->source_type);
        $this->assertSame($payroll->id, (int) $delivery->source_id);
        $this->assertSame($this->employee->id, (int) $delivery->user_id);
        $this->assertSame('phase4.payee@example.com', Crypt::decryptString($delivery->recipient_email));
        $this->assertStringContainsString(
            \App\Mail\PayslipReleasedMail::class,
            Crypt::decryptString($delivery->payload)
        );
    }

    public function test_repeat_release_does_not_duplicate_intent(): void
    {
        $payroll = $this->payrollFor($this->employee);

        $this->postJson("/api/manager/payroll/{$payroll->id}/release", [
            'payment_method' => 'Cash',
        ], $this->auth($this->manager))->assertOk();

        // Second release is rejected by the already-paid guard; even a
        // hypothetical replay shares the same occurrence_key, so the outbox
        // can never hold two intents for one payroll row.
        $this->postJson("/api/manager/payroll/{$payroll->id}/release", [], $this->auth($this->manager))
            ->assertStatus(422);

        $this->assertDatabaseCount('email_deliveries', 1);
    }

    public function test_rejected_release_creates_no_intent(): void
    {
        $payroll = $this->payrollFor($this->employee, 'draft');

        $this->postJson("/api/manager/payroll/{$payroll->id}/release", [], $this->auth($this->manager))
            ->assertStatus(422);

        $this->assertDatabaseCount('email_deliveries', 0);
        $this->assertSame('draft', $payroll->fresh()->status);
    }

    public function test_non_manager_cannot_release_and_creates_no_intent(): void
    {
        $payroll = $this->payrollFor($this->employee);

        $this->postJson("/api/manager/payroll/{$payroll->id}/release", [
            'payment_method' => 'Cash',
        ], $this->auth($this->employee))->assertStatus(403);

        $this->assertDatabaseCount('email_deliveries', 0);
        $this->assertSame('pending', $payroll->fresh()->status);
    }

    public function test_failed_outbox_intent_rolls_back_the_status_transition(): void
    {
        $payroll = $this->payrollFor($this->employee);

        // Force the outbox service to throw inside the transaction — the
        // paid transition must roll back with it, leaving neither a 'paid'
        // row nor an orphaned intent.
        $this->mock(EmailDeliveryService::class, function ($mock) {
            $mock->shouldReceive('intent')->andThrow(new \RuntimeException('outbox unavailable'));
        });

        $this->postJson("/api/manager/payroll/{$payroll->id}/release", [
            'payment_method' => 'Cash',
        ], $this->auth($this->manager))->assertStatus(500);

        $this->assertSame('pending', $payroll->fresh()->status);
        $this->assertDatabaseCount('email_deliveries', 0);
    }

    public function test_release_without_account_user_sends_no_email(): void
    {
        $payroll = Payroll::create([
            'payroll_id' => 'PAY-P4-NOACCT',
            'user_id' => null,
            'employee_name' => 'Walk-in Worker',
            'department' => 'Operations',
            'position' => 'Staff',
            'base_salary' => 10000,
            'pay_period_start' => '2026-01-01',
            'pay_period_end' => '2026-01-15',
            'pay_period_label' => 'Jan 01 - Jan 15, 2026',
            'status' => 'pending',
            'gross_pay' => 10000,
            'net_pay' => 9500,
        ]);

        $this->postJson("/api/manager/payroll/{$payroll->id}/release", [
            'payment_method' => 'Cash',
        ], $this->auth($this->manager))->assertOk();

        $this->assertSame('paid', $payroll->fresh()->status);
        $this->assertDatabaseCount('email_deliveries', 0);
    }

    public function test_batch_remaining_cannot_exceed_received_quantity(): void
    {
        $item = InventoryItem::factory()->create(['stock' => 10]);
        $batch = InventoryBatch::create([
            'inventory_item_id' => $item->id,
            'batch_no' => 'LOT-P4',
            'received_date' => now(),
            'quantity' => 10,
            'remaining_quantity' => 10,
            'status' => 'active',
        ]);

        // 50 remaining on a 10-unit batch would fabricate 40 phantom units.
        $this->withHeaders($this->auth($this->inventoryStaff))
            ->putJson("/api/inventory/batches/{$batch->id}", ['quantity' => 50])
            ->assertStatus(422);

        $this->assertSame(10, (int) $batch->fresh()->remaining_quantity);
        $this->assertSame(10, (int) $item->fresh()->stock);
    }

    public function test_batch_adjustment_within_quantity_updates_item_stock(): void
    {
        $item = InventoryItem::factory()->create(['stock' => 10]);
        $batch = InventoryBatch::create([
            'inventory_item_id' => $item->id,
            'batch_no' => 'LOT-P4B',
            'received_date' => now(),
            'quantity' => 10,
            'remaining_quantity' => 10,
            'status' => 'active',
        ]);

        $this->withHeaders($this->auth($this->inventoryStaff))
            ->putJson("/api/inventory/batches/{$batch->id}", [
                'quantity' => 7,
                'reason' => 'Damaged units',
            ])->assertOk()->assertJsonPath('success', true);

        $this->assertSame(7, (int) $batch->fresh()->remaining_quantity);
        $this->assertSame(7, (int) $item->fresh()->stock);
        $this->assertDatabaseHas('inventory_logs', [
            'inventory_item_id' => $item->id,
            'movement_type' => 'batch_adjustment',
            'delta' => -3,
        ]);
    }
}
