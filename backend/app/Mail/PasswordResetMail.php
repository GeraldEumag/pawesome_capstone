<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class PasswordResetMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $token,
        public string $email,
    ) {
    }

    public function build(): self
    {
        $url = config('app.frontend_url', 'http://localhost:3000')
            . '/forgot-password?email=' . urlencode($this->email)
            . '&token=' . urlencode($this->token);

        $expires = config('auth.passwords.users.expire', 60);

        return $this
            ->subject('Reset your Pawesome password')
            ->view('emails.password-reset')
            ->with([
                'url' => $url,
                'expires' => $expires,
            ]);
    }
}
