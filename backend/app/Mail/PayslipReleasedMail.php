<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PayslipReleasedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $employeeName,
        public readonly string $payPeriod,
        public readonly float  $netPay,
        public readonly string $payslipUrl,
        public readonly string $email,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            to: $this->email,
            subject: "Your Payslip for {$this->payPeriod} is Ready",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.payslip-released',
            with: [
                'employeeName' => $this->employeeName,
                'payPeriod'    => $this->payPeriod,
                'netPay'       => $this->netPay,
                'payslipUrl'   => $this->payslipUrl,
            ],
        );
    }
}
