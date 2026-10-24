<?php

namespace App\Services\Chatbot;

use App\Models\ChatbotFaq;
use Illuminate\Support\Facades\Cache;

class KnowledgeBaseService
{
    public function serviceCatalog(): array
    {
        return [
            'grooming' => [
                'title' => 'Grooming',
                'description' => 'Bathing, coat trimming, nail care, and hygiene packages for pets.',
            ],
            'veterinary' => [
                'title' => 'Veterinary',
                'description' => 'Checkups, vaccinations, consultations, and clinic support.',
            ],
            'boarding' => [
                'title' => 'Boarding',
                'description' => 'Pet hotel and supervised boarding stays with care monitoring.',
            ],
            'store' => [
                'title' => 'Store',
                'description' => 'Pet supplies, food, accessories, and wellness products.',
            ],
        ];
    }

    public function faq(): array
    {
        return [
            'hours' => 'Business hours are typically managed from the dashboard configuration, but the current bot can guide users to bookings, services, and support pages right away.',
            'contact' => 'You can direct users to the support and profile sections for contact information, booking follow-up, and account help.',
            'booking' => 'Bookings are handled through customer booking flows and receptionist scheduling tools. The chatbot can guide users to the correct module before automating more steps later.',
            'pricing' => 'Service prices come from the services module, so the chatbot should answer from backend service data instead of hardcoded frontend text.',
        ];
    }

    /**
     * Find the best FAQ answer for a customer message.
     *
     * Scores each active FAQ by keyword hits (weight 2) + question-word
     * overlap (weight 1) against the normalized, synonym-expanded message.
     * Requires a minimum score and a margin over the runner-up so ambiguous
     * phrasing falls through to the AI instead of guessing the wrong FAQ.
     * Never throws — a knowledge-base failure must not break the message path.
     */
    public function findAnswer(string $message, string $role): ?array
    {
        try {
            // Scope column values: 'general' | 'all' | a role name.
            $faqs = Cache::remember("chatbot_faqs_{$role}", 600, function () use ($role) {
                return ChatbotFaq::where('is_active', true)
                    ->whereIn('scope', ['general', 'all', $role])
                    ->orderBy('sort_order')
                    ->get();
            });
        } catch (\Throwable) {
            return null;
        }

        $haystack = $this->normalize($message);
        if ($haystack === '') {
            return null;
        }

        $best = null;
        $bestScore = 0;
        $secondScore = 0;

        foreach ($faqs as $faq) {
            $score = 0;

            // Keyword hits are the strongest signal (weight 2 each).
            foreach ((array) ($faq->keywords ?? []) as $keyword) {
                $kw = $this->normalize((string) $keyword);
                if ($kw !== '' && str_contains($haystack, $kw)) {
                    $score += 2;
                }
            }

            // Question-word overlap (weight 1 each, words >3 chars).
            foreach (preg_split('/\s+/', $this->normalize($faq->question)) ?: [] as $word) {
                if (strlen($word) > 3 && str_contains($haystack, $word)) {
                    $score += 1;
                }
            }

            if ($score > $bestScore) {
                $secondScore = $bestScore;
                $bestScore = $score;
                $best = $faq;
            } elseif ($score > $secondScore) {
                $secondScore = $score;
            }
        }

        // Threshold + margin: at least one keyword or two question-word hits,
        // and the winner must clearly beat the runner-up.
        if ($best && $bestScore >= 2 && $bestScore > $secondScore) {
            return [
                // Legacy rows may contain literal '\n' from single-quoted
                // seed strings — convert to real newlines at read time.
                'answer' => str_replace('\\n', "\n", $best->answer),
                'related' => $best->related_questions ?? [],
                'match_score' => $bestScore,
                'faq_id' => $best->id,
            ];
        }

        return null;
    }

    /**
     * Recent conversation turns for a user, oldest → newest, shaped as
     * [{role: 'user'|'assistant', content}] for the AI history window.
     * Never throws — history is an enhancement, not a requirement.
     */
    public function historyFor(?\App\Models\User $user, string $channel = 'web'): array
    {
        if (!$user) {
            return [];
        }

        try {
            $turns = (int) config('chatbot.memory_turns', 4);
            $logs = \App\Models\ChatbotLog::where('user_id', $user->id)
                ->latest('id')
                ->limit($turns)
                ->get(['user_message', 'bot_response']);

            $history = [];
            foreach ($logs->reverse() as $log) {
                if ($log->user_message) {
                    $history[] = ['role' => 'user', 'content' => $log->user_message];
                }
                if ($log->bot_response) {
                    // Feed the AI short plain-text turns — markdown/emoji dumps
                    // teach it to emit the same formatting.
                    $plain = trim(preg_replace('/\s+/', ' ', preg_replace('/[*_#>`•]/u', '', $log->bot_response)));
                    $history[] = ['role' => 'assistant', 'content' => mb_substr($plain, 0, 400)];
                }
            }
            return $history;
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * Normalize text for matching: shared QueryNormalizer (lowercase,
     * punctuation-free, collapsed whitespace, synonym/Taglish expansion).
     */
    private function normalize(string $text): string
    {
        return QueryNormalizer::expand($text);
    }
}
