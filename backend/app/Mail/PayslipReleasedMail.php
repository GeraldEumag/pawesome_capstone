<?php

namespace App\Mail;

use App\Services\Payroll\PayslipPdfService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PayslipReleasedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $employeeName,
        public readonly string $payPeriod,
        public readonly float $netPay,
        public readonly string $email,
        public readonly ?string $payrollRef = null,
        public readonly ?string $paidAt = null,
        public readonly ?string $paymentMethod = null,
        public readonly ?float $grossPay = null,
        public readonly array $payslipData = [],
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            to: $this->email,
            subject: "[Pawesome] Payslip Ready — {$this->payPeriod}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.payslip-released',
            text: 'emails.text.payslip-released',
            with: [
                'employeeName' => $this->employeeName,
                'payPeriod' => $this->payPeriod,
                'netPay' => $this->netPay,
                'payrollRef' => $this->payrollRef,
                'paidAt' => $this->paidAt,
                'paymentMethod' => $this->paymentMethod,
                'grossPay' => $this->grossPay,
            ],
        );
    }

    public function attachments(): array
    {
        $reference = preg_replace('/[^A-Za-z0-9._-]/', '-', $this->payrollRef ?: 'payslip');

        return [
            Attachment::fromData(
                fn () => app(PayslipPdfService::class)->render($this->payslipData),
                "Payslip-{$reference}.pdf"
            )->withMime('application/pdf'),
        ];
    }
}
