<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class CustomerNotificationMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $title,
        public string $body,
        public string $type = 'info',
    ) {
    }

    public function build(): self
    {
        return $this
            ->subject($this->title)
            ->view('emails.notification')
            ->with([
                'title' => $this->title,
                'body' => $this->body,
                'type' => $this->type,
            ]);
    }
}
