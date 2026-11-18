<?php

namespace App\Listeners;

use Illuminate\Mail\Events\MessageSending;
use Symfony\Component\Mime\Address;

/**
 * Applies the global Reply-To from config/mail.php to every outgoing
 * message that does not already define one — a single point covering all
 * mailables, present and future. A mailable's own replyTo() always wins.
 */
class ApplyMailReplyTo
{
    public function handle(MessageSending $event): void
    {
        $address = config('mail.reply_to.address');
        if (!$address || $event->message->getReplyTo()) {
            return;
        }

        $event->message->replyTo(
            new Address($address, (string) config('mail.reply_to.name', ''))
        );
    }
}
