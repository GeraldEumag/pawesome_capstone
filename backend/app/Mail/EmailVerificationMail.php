<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class EmailVerificationMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $token,
        public string $email,
        public string $name,
    ) {
    }

    public function build(): self
    {
        $url = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:3000'))
            . '/verify-email?token=' . urlencode($this->token)
            . '&email=' . urlencode($this->email);

        return $this
            ->subject('Verify your Pawesome email address')
            ->view('emails.verify')
            ->with([
                'name' => $this->name,
                'url' => $url,
            ]);
    }
}
