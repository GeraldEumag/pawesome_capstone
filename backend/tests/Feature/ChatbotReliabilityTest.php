<?php

namespace Tests\Feature;

use App\Models\ChatbotFaq;
use App\Models\ChatbotLog;
use App\Models\Customer;
use App\Models\User;
use App\Services\Chatbot\KnowledgeBaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChatbotReliabilityTest extends TestCase
{
    use RefreshDatabase;

    private function kb(): KnowledgeBaseService
    {
        return new KnowledgeBaseService();
    }

    private function seedFaq(string $q, string $a, array $kw = [], string $scope = 'general'): void
    {
        ChatbotFaq::create([
            'question' => $q, 'answer' => $a, 'keywords' => $kw,
            'scope' => $scope, 'is_active' => true, 'sort_order' => 1,
        ]);
    }

    public function test_find_answer_uses_real_scope_column(): void
    {
        $this->seedFaq('What are your business hours?', 'Open 10AM-6PM daily.', ['hours', 'open']);
        $hit = $this->kb()->findAnswer('what time do you open', 'customer');
        $this->assertSame('Open 10AM-6PM daily.', $hit['answer']);
    }

    public function test_taglish_question_matches_english_faq(): void
    {
        $this->seedFaq('Where are you located?', 'Las Piñas address here.', ['location', 'address']);
        $hit = $this->kb()->findAnswer('saan kayo located?', 'customer');
        $this->assertSame('Las Piñas address here.', $hit['answer']);
    }

    public function test_ambiguous_message_returns_null_not_wrong_faq(): void
    {
        $this->seedFaq('What are your business hours?', 'hours ans', ['hours']);
        $this->seedFaq('What payment methods do you accept?', 'pay ans', ['payment']);
        $this->assertNull($this->kb()->findAnswer('hello there', 'customer'));
    }

    public function test_role_scoped_faq_only_shows_for_that_role(): void
    {
        $this->seedFaq('Admin thing?', 'admin ans', ['admin-only-kw'], 'admin');
        $this->assertNull($this->kb()->findAnswer('tell me the admin-only-kw', 'customer'));
        $this->assertSame('admin ans', $this->kb()->findAnswer('tell me the admin-only-kw', 'admin')['answer']);
    }

    public function test_history_for_builds_turn_pairs(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        Customer::factory()->create(['user_id' => $user->id]);
        ChatbotLog::create(['user_id' => $user->id, 'role' => 'customer', 'channel' => 'web', 'intent' => 'g', 'message' => 'hi', 'user_message' => 'hi', 'bot_response' => 'hello']);
        ChatbotLog::create(['user_id' => $user->id, 'role' => 'customer', 'channel' => 'web', 'intent' => 'g', 'message' => 'hours?', 'user_message' => 'hours?', 'bot_response' => '10-6']);

        $history = $this->kb()->historyFor($user);
        $this->assertCount(4, $history);
        $this->assertSame('user', $history[0]['role']);
        $this->assertSame('assistant', $history[1]['role']);
        $this->assertSame('10-6', $history[3]['content']);
    }
}
