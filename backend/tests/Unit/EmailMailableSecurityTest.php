<?php

namespace Tests\Unit;

use App\Mail\AccountWelcomeMail;
use App\Mail\EmailVerificationMail;
use App\Mail\PasswordResetMail;
use App\Mail\PaymentReceiptMail;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Tests\TestCase;

class EmailMailableSecurityTest extends TestCase
{
    public function test_token_bearing_mailables_mark_queued_payloads_for_encryption(): void
    {
        $mailables = [
            new EmailVerificationMail('verification-token', 'verify@example.com', 'Verify User'),
            new PasswordResetMail('reset-token', 'reset@example.com'),
            new AccountWelcomeMail('welcome-token', 'welcome@example.com', 'Welcome User', 'welcome', 'cashier'),
        ];

        foreach ($mailables as $mailable) {
            $this->assertInstanceOf(ShouldBeEncrypted::class, $mailable);
        }
    }

    public function test_order_receipt_renders_database_authoritative_items_and_totals(): void
    {
        $html = (new PaymentReceiptMail('customer_order', [
            'receipt_number' => 'REC-TEST-1',
            'customer_name' => '<Test Customer>',
            'customer_email' => 'test@example.com',
            'total_amount' => '120.00',
            'payment_method' => 'GCash',
            'payment_reference' => 'REF123456',
            'paid_at' => now(),
            'items' => [[
                'product_name' => 'Persisted Item',
                'quantity' => 2,
                'price' => '60.00',
                'subtotal' => '120.00',
            ]],
        ]))->render();

        $this->assertStringContainsString('REC-TEST-1', $html);
        $this->assertStringContainsString('Persisted Item', $html);
        $this->assertStringContainsString('120.00', $html);
        $this->assertStringContainsString('&lt;Test Customer&gt;', $html);
        $this->assertStringNotContainsString('test@example.com', $html);
    }

    public function test_service_receipt_renders_only_existing_service_fields(): void
    {
        $html = (new PaymentReceiptMail('service_request', [
            'receipt_number' => 'SR-REC-TEST-1',
            'customer_name' => 'Test Customer',
            'pet_name' => 'Bantay',
            'service_name' => 'Grooming',
            'service_date' => '2026-09-27',
            'total_amount' => '850.50',
            'payment_method' => 'GCash',
            'payment_reference' => 'REF123456',
            'paid_at' => now(),
        ]))->render();

        $this->assertStringContainsString('SR-REC-TEST-1', $html);
        $this->assertStringContainsString('Bantay', $html);
        $this->assertStringContainsString('Grooming', $html);
        $this->assertStringContainsString('850.50', $html);
    }
}
