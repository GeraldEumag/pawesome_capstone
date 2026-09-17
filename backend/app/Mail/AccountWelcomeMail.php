<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class AccountWelcomeMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $token,
        public string $email,
        public string $name,
        public string $username,
        public string $role,
    ) {
    }

    public function build(): self
    {
        $url = config('app.frontend_url', 'http://localhost:3000')
            . '/forgot-password?email=' . urlencode($this->email)
            . '&token=' . urlencode($this->token);

        $expires = config('auth.passwords.users.expire', 60);

        return $this
            ->subject('Your Pawesome account is ready')
            ->view('emails.account-welcome')
            ->with([
                'name' => $this->name,
                'username' => $this->username,
                'role' => $this->role,
                'url' => $url,
                'expires' => $expires,
            ]);
    }
}
