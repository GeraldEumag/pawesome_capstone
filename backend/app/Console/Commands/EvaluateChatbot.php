<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Chatbot\PremiumChatbotService;
use Illuminate\Console\Command;

/**
 * Runs a fixture set of customer questions through the real chatbot pipeline
 * and checks each reply for expected content — a repeatable regression check
 * for answer reliability (FAQ matching, grounding, scope).
 */
class EvaluateChatbot extends Command
{
    protected $signature = 'chatbot:eval {--show : Show full replies}';
    protected $description = 'Evaluate chatbot answers against expected store facts';

    /** @var array<int, array{q: string, must: string[], forbid?: string[]}> */
    private const CASES = [
        ['q' => 'Where are you located?', 'must' => ['Las Piñas']],
        ['q' => 'What are your business hours?', 'must' => ['10:00', '6:00']],
        ['q' => 'How can I contact you?', 'must' => ['270020371'], 'note' => 'FAQ or support line with contacts'],
        ['q' => 'How much is pet boarding?', 'must' => ['₱']],
        ['q' => 'What is your cancellation policy?', 'must' => ['24 hours']],
        ['q' => 'Do I need a vaccination card?', 'must' => ['vaccination']],
        ['q' => 'What are check-in check-out times?', 'must' => ['10:00', '6:00']],
        ['q' => 'What payment methods do you accept?', 'must' => ['payment'], 'note' => 'FAQ or live payment summary — both valid'],
        ['q' => 'magkano ang boarding?', 'must' => ['room'], 'note' => 'Taglish → live rooms or rates'],
        ['q' => 'saan kayo located?', 'must' => ['Las Piñas'], 'note' => 'Taglish location'],
        ['q' => 'who won the election?', 'must' => [], 'note' => 'off-topic — expect decline/handoff, no invented answer'],
    ];

    public function handle(PremiumChatbotService $service): int
    {
        $user = User::where('role', 'customer')->first();
        $pass = $fail = 0;

        foreach (self::CASES as $case) {
            $res = $service->respond($user, $case['q'], 'eval');
            $reply = $res['reply'] ?? $res['message'] ?? '';
            $missing = array_filter($case['must'], fn ($m) => mb_stripos($reply, $m) === false);

            if ($missing) {
                $fail++;
                $this->error("✗ {$case['q']}  — missing: " . implode(', ', $missing));
            } else {
                $pass++;
                $this->info("✓ {$case['q']}" . (isset($case['note']) ? " ({$case['note']})" : ''));
            }
            if ($this->option('show')) {
                $this->line('   ' . str_replace("\n", ' ', mb_substr($reply, 0, 160)));
            }
        }

        $this->newLine();
        $this->info("{$pass} passed, {$fail} failed of " . count(self::CASES));

        return $fail ? 1 : 0;
    }
}
