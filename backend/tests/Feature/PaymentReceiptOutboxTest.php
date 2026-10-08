<?php

namespace Tests\Feature;

use App\Jobs\SendEmailDelivery;
use App\Mail\PaymentReceiptMail;
use App\Mail\CustomerNotificationMail;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\EmailDelivery;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\ServiceItemUsage;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * P5-B: payment receipts ride the durable outbox — payment success is
 * independent of email outcome, and receipts describe persisted settlement
 * data, never request/frontend input.
 */
class PaymentReceiptOutboxTest extends TestCase
{
    use RefreshDatabase;

    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['customer', 'receptionist', 'cashier', 'inventory', 'veterinary', 'admin'] as $role) {
            $this->users[$role] = User::factory()->create(['role' => $role]);
        }
        Mail::fake();
    }

    private function as(string $role): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $this->users[$role]->createToken('t')->plainTextToken]);
    }

    private function deliverPending(): void
    {
        EmailDelivery::where('status', EmailDelivery::STATUS_PENDING)
            ->pluck('id')
            ->each(fn ($id) => SendEmailDelivery::dispatchSync($id));
    }

    private function pendingBoarding(?Customer $customer = null): Boarding
    {
        $customer ??= Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        return Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'customer_email' => $customer->email,
            'customer_name' => $customer->name,
            'check_in' => now()->addDay()->toDateString(),
            'check_out' => now()->addDays(3)->toDateString(),
            'status' => 'approved',
            'payment_status' => 'pending',
            'payment_proof' => 'payment-proofs/proof.png',
        ]);
    }

    private function billableItem(Boarding $boarding, float $price = 100): ServiceItemUsage
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
            'is_paid' => false,
        ]);
    }

    private function pendingServiceRequest(array $overrides = []): ServiceRequest
    {
        return ServiceRequest::create(array_merge([
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
            'payment_reference' => 'GCASH-1',
            'payment_proof' => 'payment-proofs/proof.png',
        ], $overrides));
    }

    public function test_service_request_verify_delivers_receipt_via_outbox(): void
    {
        $sr = $this->pendingServiceRequest();

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$sr->id}/verify", [
            'type' => 'service_request', 'reference_number' => 'REF999888',
        ])->assertOk();

        $sr->refresh();
        $delivery = EmailDelivery::where('event_key', 'payment.receipt.service_request')->firstOrFail();
        $this->assertSame('service_request', $delivery->source_type);
        $this->assertSame($sr->id, $delivery->source_id);
        $this->assertSame('accepted', $delivery->fresh()->status);

        Mail::assertSent(PaymentReceiptMail::class, function ($mail) use ($sr) {
            return $mail->receipt['receipt_number'] === $sr->receipt_number
                && (float) $mail->receipt['total_amount'] === 500.0
                && (float) $mail->receipt['vat_amount'] === 53.57
                && str_contains($mail->render(), '-₱53.57')
                && $mail->receipt['service_name'] === 'Full Groom'
                && $mail->receipt['customer_email'] === $this->users['customer']->email;
        });
    }

    public function test_rejected_reference_is_emailed_and_customer_can_resubmit_with_new_reference(): void
    {
        Storage::fake('private');
        Storage::disk('private')->put('payment-proofs/old-proof.png', 'previous evidence');
        $sr = $this->pendingServiceRequest([
            'payment_status' => 'pending',
            'payment_reference' => 'OLD-REF-100',
            'payment_proof' => 'payment-proofs/old-proof.png',
        ]);

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$sr->id}/reject", [
            'type' => 'service_request',
            'rejection_reason' => 'Reference number does not match the transfer.',
        ])->assertOk();

        $delivery = EmailDelivery::where('event_key', 'payment.rejected')->firstOrFail();
        $this->deliverPending();
        Mail::assertSent(CustomerNotificationMail::class, function ($mail) {
            $details = $mail->content['details'] ?? [];
            return $mail->hasTo($this->users['customer']->email)
                && collect($details)->contains(fn ($row) => ($row['label'] ?? '') === 'Payment reference to correct'
                    && ($row['value'] ?? '') === 'OLD-REF-100');
        });
        $this->assertSame('accepted', $delivery->fresh()->status);

        $customer = $this->users['customer'];
        $customer->forceFill(['email_verified_at' => now()])->save();
        $this->withHeaders(['Authorization' => 'Bearer ' . $customer->createToken('resubmit')->plainTextToken])->post(
            "/api/customer/requests/{$sr->id}/payment-proof",
            [
                'payment_method' => 'gcash',
                'payment_reference' => 'NEW-REF-200',
                'payment_proof' => UploadedFile::fake()->create('replacement-proof.pdf', 20, 'application/pdf'),
            ]
        )->assertOk();

        $sr->refresh();
        $this->assertSame('pending', $sr->payment_status);
        $this->assertSame('NEW-REF-200', $sr->payment_reference);
        $this->assertTrue(Storage::disk('private')->exists('payment-proofs/old-proof.png'));
        $this->assertTrue(Storage::disk('private')->exists($sr->payment_proof));
    }

    public function test_boarding_verify_delivers_receipt_with_settlement_items(): void
    {
        $boarding = $this->pendingBoarding();
        $this->billableItem($boarding, 150);
        $this->billableItem($boarding, 50);

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF123456',
        ])->assertOk();

        $boarding->refresh();
        $delivery = EmailDelivery::where('event_key', 'payment.receipt.boarding')->firstOrFail();
        $this->assertSame('boarding', $delivery->source_type);

        Mail::assertSent(PaymentReceiptMail::class, function ($mail) use ($boarding) {
            return $mail->receipt['receipt_number'] === $boarding->receipt_number
                && (float) $mail->receipt['total_amount'] === 200.0
                && count($mail->receipt['items']) === 2
                && str_contains($mail->receipt['service_name'], 'Boarding');
        });
    }

    public function test_verify_failure_records_no_receipt_intent(): void
    {
        $boarding = $this->pendingBoarding();
        $this->billableItem($boarding, 100);

        Boarding::saving(fn () => throw new \RuntimeException('forced billing failure'));

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF123456',
        ])->assertStatus(500);

        $this->assertSame(0, EmailDelivery::count());
        Mail::assertNothingSent();
        $this->assertSame('pending', $boarding->fresh()->payment_status);
    }

    public function test_receipt_intent_dedups_on_same_receipt(): void
    {
        $sr = $this->pendingServiceRequest();

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$sr->id}/verify", [
            'type' => 'service_request', 'reference_number' => 'REF999888',
        ])->assertOk();

        // Simulate a duplicate producer call (retry/reconciliation) — the
        // occurrence key collapses it; no second intent, no second email.
        $sr->refresh();
        \App\Services\NotificationService::sendPaymentReceiptEmail(
            $sr->customer_email,
            'service_request',
            ['receipt_number' => $sr->receipt_number, 'total_amount' => 500],
            [
                'event_key' => 'payment.receipt.service_request',
                'occurrence_key' => "service_request:{$sr->id}:{$sr->receipt_number}",
            ]
        );

        $this->assertSame(1, EmailDelivery::where('event_key', 'payment.receipt.service_request')->count());
        Mail::assertSent(PaymentReceiptMail::class, 1);
    }

    public function test_opted_out_customer_gets_no_intent_but_payment_succeeds(): void
    {
        $customer = Customer::factory()->create([
            'notification_preferences' => ['email' => false],
        ]);
        $boarding = $this->pendingBoarding($customer);
        $this->billableItem($boarding, 100);

        Queue::fake();

        $this->as('cashier')->postJson("/api/cashier/payment-requests/{$boarding->id}/verify", [
            'type' => 'boarding', 'reference_number' => 'REF123456',
        ])->assertOk();

        $this->assertSame('paid', $boarding->fresh()->payment_status);
        $this->assertSame(0, EmailDelivery::count());
        Mail::assertNothingSent();
    }

    public function test_proof_submission_records_and_delivers_confirmation(): void
    {
        $sr = $this->pendingServiceRequest([
            'payment_status' => 'unpaid',
            'payment_method' => null,
            'payment_reference' => null,
            'payment_proof' => null,
        ]);

        $this->as('customer')->postJson("/api/customer/requests/{$sr->id}/payment-proof", [
            'payment_method' => 'cash',
        ])->assertOk();

        $delivery = EmailDelivery::where('event_key', 'payment.proof_submitted')->firstOrFail();
        $this->assertSame('service_request', $delivery->source_type);
        $this->assertSame($sr->id, $delivery->source_id);

        Mail::assertSent(CustomerNotificationMail::class, fn ($mail) => str_contains($mail->title, 'Payment Submitted'));
    }

    public function test_pos_checkout_emails_receipt_to_known_customer(): void
    {
        $product = InventoryItem::create([
            'sku' => 'RC-' . uniqid(), 'name' => 'Dog Food', 'category' => 'Food',
            'price' => 100, 'stock' => 10, 'reorder_level' => 1,
            'status' => 'active', 'is_sellable' => true,
        ]);
        $customer = Customer::create(['name' => 'POS Customer', 'email' => 'pos@example.com']);

        $this->as('cashier')->postJson('/api/cashier/pos/transaction', [
            'customer_id' => $customer->id,
            'items' => [
                ['item_id' => $product->id, 'item_type' => 'product', 'item_name' => 'Dog Food', 'quantity' => 2, 'unit_price' => 9999],
            ],
            'payment_method' => 'cash',
            'cash_received' => 10000,
        ])->assertOk();

        $delivery = EmailDelivery::where('event_key', 'payment.receipt.pos_sale')->firstOrFail();
        $this->assertSame('sale', $delivery->source_type);
        $this->assertSame($customer->id, $delivery->customer_id);

        Mail::assertSent(PaymentReceiptMail::class, function ($mail) {
            // Server-computed ₱200 (2 × 100), not the client's ₱9999.
            return (float) $mail->receipt['total_amount'] === 200.0
                && $mail->receipt['items'][0]['price'] === 100.0
                && $mail->receipt['customer_email'] === 'pos@example.com';
        });
    }

    public function test_pos_checkout_anonymous_records_no_intent(): void
    {
        $product = InventoryItem::create([
            'sku' => 'RC-' . uniqid(), 'name' => 'Dog Food', 'category' => 'Food',
            'price' => 100, 'stock' => 10, 'reorder_level' => 1,
            'status' => 'active', 'is_sellable' => true,
        ]);

        $this->as('cashier')->postJson('/api/cashier/pos/transaction', [
            'customer_id' => null,
            'items' => [
                ['item_id' => $product->id, 'item_type' => 'product', 'item_name' => 'Dog Food', 'quantity' => 1, 'unit_price' => 100],
            ],
            'payment_method' => 'cash',
            'cash_received' => 10000,
        ])->assertOk();

        $this->assertSame(0, EmailDelivery::count());
        Mail::assertNothingSent();
    }
}
