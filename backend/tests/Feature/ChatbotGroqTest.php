<?php

namespace Tests\Feature;

use App\Services\Chatbot\AiChatbotService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// Pure service-level test — Http::fake + config only, no database needed.
class ChatbotGroqTest extends TestCase
{

    protected function setUp(): void
    {
        parent::setUp();
        Cache::forget('chatbot_ai:provider_key_index');
        config()->set('chatbot.ai_enabled', true);
    }

    private function groqOk(string $text = 'Hello! How can I help?'): array
    {
        return ['choices' => [['message' => ['content' => $text]]]];
    }

    public function test_groq_provider_sends_openai_compatible_request(): void
    {
        config()->set('chatbot.ai_provider', 'groq');
        config()->set('chatbot.groq_api_keys', ['gsk_test_key']);
        config()->set('chatbot.groq_model', 'openai/gpt-oss-120b');

        Http::fake(fn () => Http::response($this->groqOk(), 200));

        $result = (new AiChatbotService())->generateResponse('What are your hours?', 'customer');

        $this->assertNotNull($result);
        $this->assertSame('ai', $result['source']);
        $this->assertSame('Hello! How can I help?', $result['message']);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'api.groq.com/openai/v1/chat/completions')
                && $request->hasHeader('Authorization', 'Bearer gsk_test_key')
                && $request['model'] === 'openai/gpt-oss-120b';
        });
    }

    public function test_groq_key_pool_fails_over_to_backup(): void
    {
        config()->set('chatbot.ai_provider', 'groq');
        config()->set('chatbot.groq_api_keys', ['dead', 'alive']);

        Http::fake(fn ($request) => str_contains($request->header('Authorization')[0] ?? '', 'alive')
            ? Http::response($this->groqOk('backup works'), 200)
            : Http::response(['error' => 'rate limited'], 429));

        $result = (new AiChatbotService())->generateResponse('hi', 'customer');

        $this->assertSame('backup works', $result['message']);
    }

    public function test_gemini_provider_still_uses_generate_content(): void
    {
        config()->set('chatbot.ai_provider', 'gemini');
        config()->set('chatbot.ai_api_key', 'gem-key');
        config()->set('chatbot.ai_model', 'gemini-3.6-flash');

        Http::fake(fn () => Http::response([
            'candidates' => [['content' => ['parts' => [['text' => 'gemini answer']]]]],
        ], 200));

        $result = (new AiChatbotService())->generateResponse('hi', 'customer');

        $this->assertSame('gemini answer', $result['message']);
        Http::assertSent(fn ($request) =>
            str_contains($request->url(), 'generativelanguage.googleapis.com')
            && $request->hasHeader('x-goog-api-key', 'gem-key'));
    }

    public function test_disabled_without_key_returns_null(): void
    {
        config()->set('chatbot.ai_provider', 'groq');
        config()->set('chatbot.groq_api_keys', []);

        $service = new AiChatbotService();
        $this->assertFalse($service->isEnabled());
        $this->assertNull($service->generateResponse('hi', 'customer'));
        $this->assertNull($service->quickFaqResponse('hi'));
    }

    public function test_system_prompt_contains_store_profile_and_scope(): void
    {
        config()->set('chatbot.ai_provider', 'groq');
        config()->set('chatbot.groq_api_keys', ['k']);
        config()->set('store.address', 'San Isidro Village, Aldana, Pamplona Uno, Las Piñas, 1740 Metro Manila');
        config()->set('store.name', 'Pawesome Retreat Inc.');

        $captured = null;
        Http::fake(function ($request) use (&$captured) {
            $captured = $request['messages'][0]['content'] ?? '';
            return Http::response($this->groqOk(), 200);
        });

        (new AiChatbotService())->generateResponse('where are you?', 'customer');

        $this->assertStringContainsString('Las Piñas', $captured);
        $this->assertStringContainsString('Pawesome Retreat Inc.', $captured);
        $this->assertStringContainsString('SCOPE', $captured);
        $this->assertStringContainsString('270020371', $captured);
    }
}
