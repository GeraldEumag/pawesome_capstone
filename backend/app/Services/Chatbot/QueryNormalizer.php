<?php

namespace App\Services\Chatbot;

/**
 * Shared text normalization for the chatbot.
 *
 * One implementation used by intent detection AND FAQ matching:
 *  - normalize(): lowercase, strip punctuation/emoji, collapse whitespace
 *  - expand():     normalized text + canonical English terms appended when a
 *                  Taglish/slang trigger is found (powers FAQ matching)
 *  - topics():     canonical topic set detected in a message (powers routing)
 *
 * The base synonym map lives in config/chatbot.php → synonyms; the canonical
 * topic triggers below extend it with the sprint's Taglish table.
 */
class QueryNormalizer
{
    /**
     * Canonical topic => trigger terms (single words or phrases).
     * A trigger present in the message adds the topic to topics() and its
     * expansion words to expand().
     */
    private const TOPIC_TRIGGERS = [
        'price' => ['magkano', 'presyo', 'rate', 'how much', 'hm', 'bayad magkano'],
        'location' => ['saan', 'nasaan', 'location', 'address', 'where', 'located'],
        'hours' => ['anong oras', 'oras', 'bukas ba', 'open ba', 'sarado', 'hours', 'open', 'close'],
        'book_appointment' => ['pa-book', 'magpa-appointment', 'magpa-schedule', 'paano mag-book', 'mag book', 'book', 'appointment', 'schedule', 'reserve'],
        'payment_status' => ['bayad', 'nabayaran', 'paid na ba', 'bayad na ba', 'na-verify na ba', 'payment', 'paid', 'magbayad'],
        'vaccination' => ['bakuna', 'vaccine', 'shots', 'vaccination', 'turok'],
        'pet_hotel' => ['pasyal', 'boarding', 'pet hotel', 'pa-alaga', 'overnight', 'hotel', 'stay', 'room'],
        'grooming' => ['ligo', 'grooming', 'gupit', 'groom', 'bath', 'haircut'],
        'medicine' => ['gamot', 'meds', 'reseta', 'medicine', 'prescription'],
        'today' => ['ngayon', 'ngayong araw', 'today', 'now'],
        'tomorrow' => ['bukas', 'tomorrow'],
        'availability' => ['ilan', 'ilang', 'available pa ba', 'available', 'meron', 'may stock'],
    ];

    /**
     * Canonical topic => words appended to the expanded text so English
     * FAQ keywords/questions match Taglish phrasing.
     */
    private const TOPIC_EXPANSIONS = [
        'price' => 'price cost rate fee how much',
        'location' => 'where location address directions located map',
        'hours' => 'hours time open close schedule operating when',
        'book_appointment' => 'book booking appointment schedule reserve',
        'payment_status' => 'payment pay paid status verification',
        'vaccination' => 'vaccine vaccination card requirement required',
        'pet_hotel' => 'boarding hotel room stay overnight check-in check-out',
        'grooming' => 'grooming groom bath haircut',
        'medicine' => 'medicine veterinary medical prescription',
        'today' => 'today appointments schedule',
        'tomorrow' => 'tomorrow schedule booking',
        'availability' => 'available availability stock inventory how many',
    ];

    /**
     * Lowercase, strip punctuation/emoji, collapse whitespace.
     */
    public static function normalize(string $text): string
    {
        $text = strtolower($text);
        $text = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $text);

        return trim((string) preg_replace('/\s+/', ' ', $text));
    }

    /**
     * Normalized text + canonical English expansions for every detected
     * synonym/Taglish trigger (config synonyms first, then topic triggers).
     */
    public static function expand(string $text): string
    {
        $normalized = self::normalize($text);
        if ($normalized === '') {
            return '';
        }

        $extra = '';
        foreach ((array) config('chatbot.synonyms', []) as $term => $canonical) {
            if (self::containsTerm($normalized, (string) $term)) {
                $extra .= ' ' . $canonical;
            }
        }

        foreach (self::topics($normalized) as $topic) {
            $extra .= ' ' . (self::TOPIC_EXPANSIONS[$topic] ?? '');
        }

        return $normalized . $extra;
    }

    /**
     * Canonical topics detected in the message (values like 'price',
     * 'pet_hotel', 'payment_status'). Input may be raw or normalized text.
     *
     * @return string[]
     */
    public static function topics(string $text): array
    {
        $normalized = self::normalize($text);
        if ($normalized === '') {
            return [];
        }

        $found = [];
        foreach (self::TOPIC_TRIGGERS as $topic => $triggers) {
            foreach ($triggers as $trigger) {
                if (self::containsTerm($normalized, $trigger)) {
                    $found[] = $topic;
                    break;
                }
            }
        }

        return $found;
    }

    /**
     * Whole-phrase containment for multi-word triggers, word-boundary
     * matching for single words — avoids 'pay' hitting inside 'replay'.
     */
    private static function containsTerm(string $haystack, string $term): bool
    {
        $term = self::normalize($term);
        if ($term === '') {
            return false;
        }

        if (str_contains($term, ' ')) {
            return str_contains($haystack, $term);
        }

        return (bool) preg_match('/\b' . preg_quote($term, '/') . '\b/u', $haystack);
    }
}
