<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\PaymentSettlement;
use App\Models\Pet;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Support\ReceiptBreakdown;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Rev 6: receipts render backend-authoritative VAT + payment breakdown —
 * the frontend never recomputes financial totals.
 */
class ReceiptBreakdownTest extends TestCase
{
    use RefreshDatabase;

    public function test_breakdown_extracts_vat_inclusive_amount(): void
    {
        $b = ReceiptBreakdown::build(1120.00, [
            ['method' => 'gcash', 'amount' => 1120.00, 'reference_number' => 'REF-1'],
        ]);

        $this->assertSame(120.00, $b['vat_amount']);
        $this->assertSame(1000.00, $b['net_amount']);
        $this->assertSame(1120.00, $b['total']);
        $this->assertSame(1120.00, $b['amount_paid']);
        $this->assertSame(0.00, $b['balance_due']);
        $this->assertCount(1, $b['payments']);
        $this->assertSame('gcash', $b['payments'][0]['method']);
    }

    public function test_partial_payments_leave_the_correct_balance(): void
    {
        $b = ReceiptBreakdown::build(1120.00, [
            ['method' => 'cash', 'amount' => 500.00],
            ['method' => 'gcash', 'amount' => 300.00],
        ]);

        $this->assertSame(800.00, $b['amount_paid']);
        $this->assertSame(320.00, $b['balance_due']);
        $this->assertCount(2, $b['payments']);
    }

    public function test_voided_settlements_are_refunds_not_payments(): void
    {
        $b = ReceiptBreakdown::build(1000.00, [
            ['method' => 'cash', 'amount' => 1000.00],
        ], 0, [
            ['amount' => 1000.00, 'status' => 'voided', 'reason' => 'Corrected entry'],
        ]);

        $this->assertSame(1000.00, $b['amount_paid']);
        $this->assertSame(0.00, $b['balance_due']);
        $this->assertSame(1000.00, $b['amount_refunded']);
        $this->assertCount(1, $b['refunds']);
    }

    public function test_service_request_receipt_returns_backend_breakdown(): void
    {
        $customerUser = User::factory()->customer()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $serviceRequest = ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'customer_name' => 'Receipt Customer',
            'customer_email' => 'receipt@example.test',
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'grooming',
            'service_name' => 'Full Groom',
            'request_date' => Carbon::today()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
            'payment_method' => 'gcash',
            'payment_reference' => 'GC-9988',
            'receipt_number' => 'SR-REC-TEST-1',
            'total_amount' => 1120.00,
            'paid_at' => now(),
        ]);

        // Ledger settlement written by the verification path.
        PaymentSettlement::create([
            'settleable_type' => 'service_request',
            'settleable_id' => $serviceRequest->id,
            'customer_id' => $customer->id,
            'amount' => 1120.00,
            'payment_method' => 'gcash',
            'reference_number' => 'GC-9988',
            'receipt_number' => 'SR-REC-TEST-1',
            'paid_at' => now(),
            'idempotency_key' => 'test:settlement:1',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $customerUser->createToken('t')->plainTextToken,
        ])->getJson("/api/customer/requests/{$serviceRequest->id}/receipt");

        $response->assertOk()
            ->assertJsonPath('receipt.breakdown.payments.0.method', 'gcash')
            ->assertJsonPath('receipt.breakdown.payments.0.reference_number', 'GC-9988');

        $b = $response->json('receipt.breakdown');
        $this->assertEquals(120.0, $b['vat_amount']);
        $this->assertEquals(1120.0, $b['total']);
        $this->assertEquals(1120.0, $b['amount_paid']);
        $this->assertEquals(0.0, $b['balance_due']);
    }

    public function test_legacy_paid_request_uses_record_fallback_for_breakdown(): void
    {
        $customerUser = User::factory()->customer()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $serviceRequest = ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'customer_name' => 'Legacy Customer',
            'customer_email' => 'legacy@example.test',
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'request_type' => 'vet',
            'service_name' => 'Consult',
            'request_date' => Carbon::today()->toDateString(),
            'status' => 'approved',
            'payment_status' => 'paid',
            'payment_method' => 'cash',
            'receipt_number' => 'SR-REC-LEGACY-1',
            'total_amount' => 560.00,
            'paid_at' => now(),
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $customerUser->createToken('t')->plainTextToken,
        ])->getJson("/api/customer/requests/{$serviceRequest->id}/receipt");

        $response->assertOk()
            ->assertJsonPath('receipt.breakdown.payments.0.method', 'cash');

        $b = $response->json('receipt.breakdown');
        $this->assertEquals(60.0, $b['vat_amount']);
        $this->assertEquals(560.0, $b['amount_paid']);
        $this->assertEquals(0.0, $b['balance_due']);
    }
}
