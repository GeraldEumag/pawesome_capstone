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
        $payroll = Payroll::create(array_merge([
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

        // markAsPaid() re-derives figures from attendance and requires
        // recorded approval — mirror the generate() + approve() path so this
        // fixture is a releasable payroll rather than a fabricated one.
        $payroll->calculatePayroll(true);
        $payroll->save();
        if ($status === 'pending' && $payroll->approved_by === null) {
            $payroll->update([
                'approved_by' => $this->manager->id,
                'approved_at' => now(),
            ]);
        }

        return $payroll;
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
        $payload = Crypt::decryptString($delivery->payload);
        $this->assertStringContainsString(
            \App\Mail\PayslipReleasedMail::class,
            $payload
        );
        // The serialized mailable carries authoritative payroll fields —
        // reference code and gross pay flow from the payroll row itself.
        $this->assertStringContainsString($payroll->payroll_id, $payload);

        /** @var \App\Mail\PayslipReleasedMail $mail */
        $mail = unserialize($payload);
        $this->assertSame((float) $payroll->fresh()->gross_pay, $mail->grossPay);
        $this->assertSame($payroll->pay_period_label, $mail->payslipData['pay_period']);
        $this->assertSame($this->employee->name, $mail->payslipData['employee']['name']);
    }

    public function test_payslip_mailable_renders_professional_layout(): void
    {
        $html = (new \App\Mail\PayslipReleasedMail(
            'Test <b>Employee</b>',
            'Jan 01 - Jan 15, 2026',
            11000.00,
            'payee@example.com',
            'PAYROLL-2026-001',
            '2026-01-15',
            'Bank Transfer',
            12500.00
        ))->render();

        // Paid status chip, net-pay hero, and peso formatting
        $this->assertStringContainsString('Paid', $html);
        $this->assertStringContainsString('Net Pay', $html);
        $this->assertStringContainsString('₱11,000.00', $html);

        // Authoritative payroll details
        $this->assertStringContainsString('Payroll reference', $html);
        $this->assertStringContainsString('PAYROLL-2026-001', $html);
        $this->assertStringContainsString('Gross pay', $html);
        $this->assertStringContainsString('₱12,500.00', $html);
        $this->assertStringContainsString('Bank Transfer', $html);
        $this->assertStringContainsString('Jan 15, 2026', $html);

        // The email directs the recipient to its attached PDF, not the login portal.
        $this->assertStringContainsString('confidential payroll information', $html);
        $this->assertStringContainsString('attached as a PDF', $html);
        $this->assertStringNotContainsString('View Payslip', $html);
        $this->assertStringNotContainsString('frontend.example', $html);

        // Dynamic values are Blade-escaped, not raw HTML
        $this->assertStringNotContainsString('<b>Employee</b>', $html);
        $this->assertStringContainsString('&lt;b&gt;Employee&lt;/b&gt;', $html);
    }

    public function test_payslip_mailable_renders_with_optional_fields_null(): void
    {
        $html = (new \App\Mail\PayslipReleasedMail(
            'Test Employee',
            'Jan 01 - Jan 15, 2026',
            11000.00,
            'payee@example.com'
        ))->render();

        // Core content still renders
        $this->assertStringContainsString('Net Pay', $html);
        $this->assertStringContainsString('₱11,000.00', $html);
        $this->assertStringContainsString('Jan 01 - Jan 15, 2026', $html);
        $this->assertStringContainsString('attached as a PDF', $html);
        $this->assertStringNotContainsString('View Payslip', $html);

        // Absent optional fields produce no empty detail rows
        $this->assertStringNotContainsString('Payroll reference', $html);
        $this->assertStringNotContainsString('Gross pay', $html);
        $this->assertStringNotContainsString('Payment method', $html);
        $this->assertStringNotContainsString('Paid on', $html);
    }

    public function test_payslip_email_attaches_a_pdf_named_with_payroll_reference(): void
    {
        $mail = new \App\Mail\PayslipReleasedMail(
            'Test Employee',
            'Jan 01 - Jan 15, 2026',
            11000.00,
            'payee@example.com',
            'PAY-2026-001',
            '2026-01-15',
            'Bank Transfer',
            12500.00,
            [
                'payroll_id' => 'PAY-2026-001',
                'pay_period' => 'Jan 01 - Jan 15, 2026',
                'employee' => ['name' => 'Test Employee'],
                'earnings' => ['gross_pay' => 12500],
                'deductions' => ['total_deductions' => 1500],
                'net_pay' => 11000,
            ]
        );

        $attachment = $mail->attachments()[0];
        $pdf = $attachment->attachWith(
            fn () => null,
            fn ($data) => $data()
        );

        $this->assertSame('Payslip-PAY-2026-001.pdf', $attachment->as);
        $this->assertSame('application/pdf', $attachment->mime);
        $this->assertStringStartsWith('%PDF-', $pdf);
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

    public function test_stale_figures_revert_to_draft_and_create_no_intent(): void
    {
        $payroll = $this->payrollFor($this->employee);

        // Figures edited after generation no longer match a fresh
        // recomputation — release must refuse and roll the row back to
        // draft so it is regenerated and re-approved, never paying stale
        // amounts.
        $payroll->update(['gross_pay' => 999999]);

        $this->postJson("/api/manager/payroll/{$payroll->id}/release", [
            'payment_method' => 'Cash',
        ], $this->auth($this->manager))->assertStatus(422);

        $this->assertSame('draft', $payroll->fresh()->status);
        $this->assertDatabaseCount('email_deliveries', 0);
    }

    public function test_release_without_account_user_sends_no_email(): void
    {
        // Unlinked (manual) row that has passed the maker-checker approval
        // gate: creator is $this->manager, approver is a different manager —
        // approve() writes approved_by, and markAsPaid() requires it for
        // unlinked rows before releasing payment.
        $approver = User::factory()->create(['role' => 'manager', 'is_active' => true]);

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
            'processed_by' => $this->manager->id,
            'approved_by' => $approver->id,
            'approved_at' => now(),
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
