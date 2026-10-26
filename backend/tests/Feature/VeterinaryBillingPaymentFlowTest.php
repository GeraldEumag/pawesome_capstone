<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\PaymentSettlement;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\ServiceBillingPaymentRequest;
use App\Models\ServiceItemUsage;
use App\Models\User;
use App\Services\ServiceBillingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class VeterinaryBillingPaymentFlowTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'role' => $role,
            'is_active' => true,
            'email_verified_at' => now(),
        ], $attributes));
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('vet-billing-test')->plainTextToken];
    }

    private function customerWithAppointment(): array
    {
        $user = $this->user('customer');
        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'email' => $user->email,
            'name' => $user->name,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create([
            'name' => 'Veterinary Consultation',
            'category' => 'Consultation',
            'price' => 500,
            'is_active' => true,
        ]);
        $appointment = Appointment::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'scheduled_at' => now()->addDay(),
            'status' => 'approved',
            'payment_status' => 'paid',
            'price' => 500,
            'base_amount' => 500,
            'total_amount' => 500,
            'amount_paid' => 500,
            'balance_due' => 0,
        ]);

        return [$user, $customer, $pet, $appointment];
    }

    private function addCharge(Appointment $appointment, User $vet, float $amount = 300, string $description = 'Additional treatment'): ServiceItemUsage
    {
        $this->actingAs($vet);
        $result = ServiceBillingService::addBillingItem([
            'service_type' => 'veterinary',
            'service_id' => $appointment->id,
            'item_type' => ServiceItemUsage::ITEM_MANUAL_CHARGE,
            'description' => $description,
            'quantity' => 1,
            'unit_price' => $amount,
        ]);

        $this->assertTrue($result['success']);
        return ServiceItemUsage::where('service_type', 'veterinary')
            ->where('service_id', $appointment->id)
            ->where('description', $description)
            ->latest('id')
            ->firstOrFail();
    }

    public function test_customer_sees_full_additional_balance_and_can_request_cashier_collection(): void
    {
        [$customerUser, $customer, , $appointment] = $this->customerWithAppointment();
        $vet = $this->user('veterinary');
        $charge = $this->addCharge($appointment, $vet, 300);

        $this->withHeaders($this->headers($customerUser))
            ->getJson('/api/customer/billing')
            ->assertOk()
            ->assertJsonPath('invoices.0.appointment_id', $appointment->id)
            ->assertJsonPath('invoices.0.balance_due', 300)
            ->assertJsonPath('invoices.0.payment_available', true)
            ->assertJsonFragment(['description' => 'Additional treatment']);

        $response = $this->withHeaders($this->headers($customerUser))
            ->postJson("/api/customer/billing/veterinary/{$appointment->id}/cashier-payment", []);

        $response->assertCreated()
            ->assertJsonPath('payment_request.payment_channel', 'cashier')
            ->assertJsonPath('payment_request.amount_due', 300);

        $paymentRequestId = $response->json('payment_request.id');
        $this->assertSame(ServiceBillingPaymentRequest::STATUS_AWAITING_CASHIER, ServiceBillingPaymentRequest::findOrFail($paymentRequestId)->status);
        $this->assertFalse((bool) $charge->fresh()->is_paid);

        $this->withHeaders($this->headers($this->user('cashier')))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->assertJsonFragment([
                'payable_type' => 'service_billing_payment',
                'id' => $paymentRequestId,
                'amount' => 300,
            ]);
    }

    public function test_cashier_settlement_records_actual_method_and_settles_the_full_balance_once(): void
    {
        [$customerUser, , , $appointment] = $this->customerWithAppointment();
        $vet = $this->user('veterinary');
        $cashier = $this->user('cashier');
        $charge = $this->addCharge($appointment, $vet, 275);

        $created = $this->withHeaders($this->headers($customerUser))
            ->postJson("/api/customer/billing/veterinary/{$appointment->id}/cashier-payment", [])
            ->assertCreated();
        $paymentRequestId = $created->json('payment_request.id');

        $verifyPayload = [
            'type' => 'service_billing_payment',
            'payment_method' => 'cash',
            'cash_received' => 300,
            'cashier_remarks' => 'Counter collection',
        ];
        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$paymentRequestId}/verify", $verifyPayload)
            ->assertOk()
            ->assertJsonPath('payment_status', 'paid')
            ->assertJsonPath('payment_method', 'cash')
            ->assertJsonPath('amount', 275);

        $this->assertTrue((bool) $charge->fresh()->is_paid);
        $this->assertSame('paid', $appointment->fresh()->payment_status);
        $this->assertDatabaseHas('payment_settlements', [
            'settleable_type' => 'service_billing_payment',
            'settleable_id' => $paymentRequestId,
            'amount' => 275,
            'payment_method' => 'cash',
        ]);
        $this->assertSame(1, PaymentSettlement::where('settleable_type', 'service_billing_payment')
            ->where('settleable_id', $paymentRequestId)
            ->count());
        $this->withHeaders($this->headers($customerUser))
            ->getJson("/api/customer/billing/payment-requests/{$paymentRequestId}/receipt")
            ->assertOk()
            ->assertJsonPath('receipt.total_amount', 275);

        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$paymentRequestId}/verify", $verifyPayload)
            ->assertUnprocessable();
        $this->assertSame(1, PaymentSettlement::where('settleable_type', 'service_billing_payment')
            ->where('settleable_id', $paymentRequestId)
            ->count());
    }

    public function test_counter_collection_can_record_gcash_and_maya_with_a_reference(): void
    {
        $cashier = $this->user('cashier');
        $vet = $this->user('veterinary');

        foreach (['gcash', 'maya'] as $method) {
            [$customerUser, , , $appointment] = $this->customerWithAppointment();
            $this->addCharge($appointment, $vet, 150, "Counter {$method} charge");
            $created = $this->withHeaders($this->headers($customerUser))
                ->postJson("/api/customer/billing/veterinary/{$appointment->id}/cashier-payment", [])
                ->assertCreated();
            $paymentRequestId = $created->json('payment_request.id');
            $reference = strtoupper($method) . '-REF-150';

            $this->withHeaders($this->headers($cashier))
                ->postJson("/api/cashier/payment-requests/{$paymentRequestId}/verify", [
                    'type' => 'service_billing_payment',
                    'payment_method' => $method,
                    'reference_number' => $reference,
                ])
                ->assertOk()
                ->assertJsonPath('payment_method', $method);

            $this->assertDatabaseHas('payment_settlements', [
                'settleable_type' => 'service_billing_payment',
                'settleable_id' => $paymentRequestId,
                'payment_method' => $method,
                'reference_number' => $reference,
            ]);
        }
    }

    public function test_online_billing_accepts_only_gcash_or_maya_and_sends_proof_to_cashier(): void
    {
        Storage::fake('private');
        [$customerUser, , , $appointment] = $this->customerWithAppointment();
        $vet = $this->user('veterinary');
        $cashier = $this->user('cashier');
        $charge = $this->addCharge($appointment, $vet, 325);

        $invalid = $this->withHeaders($this->headers($customerUser))
            ->postJson("/api/customer/billing/veterinary/{$appointment->id}/online-payment", [
                'payment_method' => 'cash',
                'payment_reference' => 'CASH-123456',
            ]);
        $invalid->assertUnprocessable();

        $submitted = $this->withHeaders($this->headers($customerUser))
            ->post("/api/customer/billing/veterinary/{$appointment->id}/online-payment", [
                'payment_method' => 'maya',
                'payment_reference' => 'MAYA-REF-325',
                'payment_proof' => UploadedFile::fake()->create('maya-proof.jpg', 5, 'image/jpeg'),
            ]);
        $submitted->assertCreated()
            ->assertJsonPath('payment_request.payment_channel', 'online')
            ->assertJsonPath('payment_request.payment_method', 'maya');

        $paymentRequestId = $submitted->json('payment_request.id');
        $paymentRequest = ServiceBillingPaymentRequest::findOrFail($paymentRequestId);
        $this->assertSame(ServiceBillingPaymentRequest::STATUS_PENDING_VERIFICATION, $paymentRequest->status);
        Storage::disk('private')->assertExists($paymentRequest->payment_proof);
        $this->assertFalse((bool) $charge->fresh()->is_paid);

        $this->withHeaders($this->headers($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->assertJsonFragment([
                'payable_type' => 'service_billing_payment',
                'id' => $paymentRequestId,
                'payment_method' => 'maya',
                'payment_status' => 'pending',
            ]);

        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$paymentRequestId}/verify", [
                'type' => 'service_billing_payment',
                'payment_method' => 'maya',
                'reference_number' => 'MAYA-REF-325',
            ])
            ->assertOk()
            ->assertJsonPath('payment_status', 'paid');

        $this->assertTrue((bool) $charge->fresh()->is_paid);
        $this->assertDatabaseHas('payment_settlements', [
            'settleable_type' => 'service_billing_payment',
            'settleable_id' => $paymentRequestId,
            'payment_method' => 'maya',
            'reference_number' => 'MAYA-REF-325',
        ]);
    }

    public function test_linked_service_request_proof_route_cannot_duplicate_an_additional_invoice(): void
    {
        [$customerUser, $customer, $pet, $appointment] = $this->customerWithAppointment();
        $vet = $this->user('veterinary');
        $serviceRequest = ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'vet',
            'service_name' => 'Veterinary Consultation',
            'request_date' => now()->addDay()->toDateString(),
            'request_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'online',
            'price' => 500,
        ]);
        $appointment->update(['service_request_id' => $serviceRequest->id]);
        $this->addCharge($appointment, $vet, 300);

        $this->withHeaders($this->headers($customerUser))
            ->post("/api/customer/requests/{$serviceRequest->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'BASE-REF-123',
                'payment_proof' => UploadedFile::fake()->create('base-proof.pdf', 10, 'application/pdf'),
            ])
            ->assertStatus(409)
            ->assertJsonPath('billing_url', '/customer/payments');
    }

    public function test_invoice_ownership_is_enforced_and_new_charges_stale_open_requests(): void
    {
        [$ownerUser, , , $appointment] = $this->customerWithAppointment();
        [$otherUser] = $this->customerWithAppointment();
        $vet = $this->user('veterinary');
        $cashier = $this->user('cashier');
        $this->addCharge($appointment, $vet, 300, 'Initial additional treatment');

        $this->withHeaders($this->headers($otherUser))
            ->getJson('/api/customer/billing')
            ->assertOk()
            ->assertJsonCount(0, 'invoices');

        $this->withHeaders($this->headers($otherUser))
            ->postJson("/api/customer/billing/veterinary/{$appointment->id}/cashier-payment", [])
            ->assertNotFound();

        $created = $this->withHeaders($this->headers($ownerUser))
            ->postJson("/api/customer/billing/veterinary/{$appointment->id}/cashier-payment", [])
            ->assertCreated();
        $paymentRequestId = $created->json('payment_request.id');

        $this->addCharge($appointment, $vet, 125, 'Late additional treatment');
        $this->assertSame(ServiceBillingPaymentRequest::STATUS_STALE, ServiceBillingPaymentRequest::findOrFail($paymentRequestId)->status);

        $this->withHeaders($this->headers($cashier))
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->assertJsonMissing(['id' => $paymentRequestId, 'payable_type' => 'service_billing_payment']);

        $this->withHeaders($this->headers($cashier))
            ->postJson("/api/cashier/payment-requests/{$paymentRequestId}/verify", [
                'type' => 'service_billing_payment',
                'payment_method' => 'cash',
                'cash_received' => 300,
            ])
            ->assertUnprocessable();

        $this->withHeaders($this->headers($ownerUser))
            ->getJson('/api/customer/billing')
            ->assertOk()
            ->assertJsonPath('invoices.0.balance_due', 425)
            ->assertJsonPath('invoices.0.payment_available', true);
    }
}
