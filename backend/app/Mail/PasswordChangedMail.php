<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class PasswordChangedMail extends Mailable implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $email,
        public string $name,
    ) {
    }

    public function build(): self
    {
        return $this
            ->subject('Your Pawesome password was changed')
            ->view('emails.password-changed')
            ->text('emails.text.password-changed')
            ->with([
                'name' => $this->name,
                'email' => $this->email,
            ]);
    }
}
