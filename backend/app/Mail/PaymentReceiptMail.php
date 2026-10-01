<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class PaymentReceiptMail extends Mailable implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $receiptType,
        public array $receipt,
    ) {}

    public function build(): self
    {
        return $this
            ->subject('Your Pawesome payment receipt '.$this->receipt['receipt_number'])
            ->view('emails.payment-receipt')
            ->with([
                'receipt' => $this->receipt,
                'receiptType' => $this->receiptType,
            ]);
    }
}
