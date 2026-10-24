<?php

namespace App\Support;

/**
 * Single source of truth for public business facts used by the chatbot.
 *
 * Everything reads from config/store.php (STORE_* envs) plus StoreHours for
 * operating hours. Nothing here may invent channels — when a dedicated
 * feedback/complaints contact does not exist, callers must use the main
 * email/phone instead of making one up.
 */
class StoreFacts
{
    public static function name(): string
    {
        return (string) config('store.name', 'Pawesome Retreat Inc.');
    }

    public static function assistantName(): string
    {
        return (string) config('store.assistant_name', 'Pawsitive');
    }

    public static function address(): string
    {
        return (string) config('store.address', '');
    }

    public static function phone(): string
    {
        return (string) config('store.phone', '');
    }

    public static function email(): string
    {
        return (string) config('store.email', '');
    }

    public static function facebook(): string
    {
        return (string) config('store.facebook', '');
    }

    public static function instagram(): string
    {
        return (string) config('store.instagram', '');
    }

    public static function hours(): string
    {
        try {
            return StoreHours::label() . ' every day';
        } catch (\Throwable) {
            return '10:00 AM–6:00 PM every day';
        }
    }

    public static function checkinWindow(): string
    {
        return (string) config('store.checkin_window', 'any time during operating hours');
    }

    public static function cancellation(): string
    {
        return (string) config('store.cancellation', 'contact reception');
    }

    public static function paymentMethods(): string
    {
        return (string) config('store.payment_methods', 'GCash, Maya, cash');
    }

    public static function vaccinationPolicy(): string
    {
        return (string) config('store.vaccination_policy', 'a verified vaccination card');
    }

    /**
     * Pre-formatted contact block shared by chatbot replies and AI prompts.
     * Only real config values — never placeholders.
     */
    public static function contactsBlock(): string
    {
        $lines = [
            'Phone: ' . self::phone(),
            'Email: ' . self::email(),
            'Address: ' . self::address(),
        ];

        if (self::facebook() !== '') {
            $lines[] = 'Facebook: ' . self::facebook();
        }
        if (self::instagram() !== '') {
            $lines[] = 'Instagram: ' . self::instagram();
        }

        return implode("\n", $lines);
    }

    /**
     * Every value that is allowed to appear in a bot reply as a "fact" —
     * used by the answer validator to detect invented contacts.
     *
     * @return string[]
     */
    public static function allowedContactValues(): array
    {
        return array_values(array_filter([
            self::phone(),
            self::email(),
            self::address(),
            self::facebook(),
            self::instagram(),
            self::name(),
        ]));
    }
}
