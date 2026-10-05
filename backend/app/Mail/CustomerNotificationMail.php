<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class CustomerNotificationMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    /**
     * Structured content keys (all optional): customer_name, intro,
     * details ([{label, value}…]), status, status_type, cta_url,
     * cta_label, closing, subject.
     */
    public function __construct(
        public string $title,
        public string $body,
        public string $type = 'info',
        public ?array $content = null,
    ) {
    }

    public function build(): self
    {
        return $this
            ->subject($this->content['subject'] ?? "[Pawesome] {$this->title}")
            ->view('emails.notification')
            ->text('emails.text.notification')
            ->with([
                'title' => $this->title,
                'body' => $this->body,
                'type' => $this->type,
                'content' => $this->content ?? [],
            ]);
    }
}
