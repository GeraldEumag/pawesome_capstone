<?php

namespace Tests\Unit;

use App\Mail\AccountWelcomeMail;
use App\Mail\EmailVerificationMail;
use App\Mail\PasswordResetMail;
use App\Mail\PaymentReceiptMail;
use App\Mail\PayslipReleasedMail;
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

    public function test_payslip_email_attaches_a_pdf_without_a_login_link(): void
    {
        $mail = new PayslipReleasedMail(
            'Test Employee',
            'Nov 1 - Nov 15, 2026',
            15250.00,
            'employee@example.com',
            'PAY-2026-001',
            '2026-11-16',
            'Bank Transfer',
            18500.00,
            [
                'company_name' => 'Pawesome Retreat Inc.',
                'payslip_date' => '2026-11-19',
                'payroll_id' => 'PAY-2026-001',
                'pay_period' => 'Nov 1 - Nov 15, 2026',
                'period_factor' => 0.5,
                'employee' => [
                    'name' => 'Test Employee',
                    'id' => 'TEST-001',
                    'department' => 'Operations',
                    'position' => 'Cashier',
                    'employment_type' => 'Regular',
                    'rate_type' => 'Monthly',
                ],
                'earnings' => [
                    'base_salary' => 15000,
                    'monthly_base_salary' => 30000,
                    'overtime_pay' => 500,
                    'rest_day_pay' => 0,
                    'rest_day_ot_pay' => 0,
                    'regular_holiday_pay' => 500,
                    'special_holiday_pay' => 500,
                    'regular_holiday_ot_pay' => 250,
                    'special_holiday_ot_pay' => 250,
                    'night_differential' => 0,
                    'bonus' => 0,
                    'allowances' => 1500,
                    'non_taxable_allowances' => 0,
                    'commission' => 0,
                    'other_earnings' => 0,
                    'gross_pay' => 18500,
                ],
                'deductions' => [
                    'sss' => 1000,
                    'philhealth' => 500,
                    'pagibig' => 200,
                    'tax' => 800,
                    'salary_loan' => 500,
                    'cash_advance' => 250,
                    'other_deductions' => 0,
                    'late_deductions' => 0,
                    'absent_deductions' => 0,
                    'undertime_deductions' => 0,
                    'total_deductions' => 3250,
                ],
                'employer_shares' => ['sss_er' => 1000, 'philhealth_er' => 500, 'pagibig_er' => 200],
                'attendance' => [
                    'working_days' => 11,
                    'present_days' => 9,
                    'absent_days' => 0,
                    'paid_leave_days' => 2,
                    'vacation_leave_days' => 1,
                    'sick_leave_days' => 1,
                    'regular_hours' => 72,
                    'overtime_hours' => 4,
                    'undertime_minutes' => 0,
                    'incomplete_punch_days' => 0,
                ],
                'net_pay' => 15250,
                'payment_date' => '2026-11-16',
                'payment_method' => 'Bank Transfer',
                'payment_reference' => 'TRX-TEST-001',
                'status' => 'paid',
            ]
        );
        $mail = unserialize(serialize($mail));

        $html = $mail->render();
        $pdfHtml = view('pdf.payslip', ['payslip' => $mail->payslipData])->render();
        $attachment = $mail->attachments()[0];
        $pdf = $attachment->attachWith(
            fn () => null,
            fn ($data) => $data()
        );

        $this->assertStringContainsString('attached as a PDF', $html);
        $this->assertStringNotContainsString('View Payslip', $html);
        $this->assertStringContainsString('Overtime pay', $pdfHtml);
        $this->assertStringContainsString('₱1,000.00', $pdfHtml);
        $this->assertStringContainsString('Regular holiday pay', $pdfHtml);
        $this->assertStringContainsString('Special holiday pay', $pdfHtml);
        $this->assertStringContainsString('Regular holiday overtime', $pdfHtml);
        $this->assertStringContainsString('Special holiday overtime', $pdfHtml);
        $this->assertStringNotContainsString('Bonus', $pdfHtml);
        $this->assertStringContainsString('SSS contribution', $pdfHtml);
        $this->assertStringContainsString('Employer contributions', $pdfHtml);
        $this->assertStringContainsString('Employer SSS share', $pdfHtml);
        $this->assertStringContainsString('Undertime minutes', $pdfHtml);
        $this->assertStringContainsString('Vacation leave:', $pdfHtml);
        $this->assertStringContainsString('Sick leave:', $pdfHtml);
        $this->assertStringContainsString('Vacation leave:</strong> 1 days', $pdfHtml);
        $this->assertStringContainsString('Sick leave:</strong> 1 days', $pdfHtml);
        $this->assertStringContainsString('TRX-TEST-001', $pdfHtml);
        $this->assertSame('Payslip-PAY-2026-001.pdf', $attachment->as);
        $this->assertSame('application/pdf', $attachment->mime);
        $this->assertStringStartsWith('%PDF-', $pdf);
    }

    public function test_order_receipt_renders_database_authoritative_items_and_totals(): void
    {
        $html = (new PaymentReceiptMail('customer_order', [
            'receipt_number' => 'REC-TEST-1',
            'customer_name' => '<Test Customer>',
            'customer_email' => 'test@example.com',
            'total_amount' => '120.00',
            'vat_amount' => '12.86',
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
        $this->assertStringContainsString('VAT 12% (included)', $html);
        $this->assertStringContainsString('TOTAL (VAT INCLUDED)', $html);
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
