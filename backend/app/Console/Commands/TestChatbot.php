<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;
use App\Services\Chatbot\AiChatbotService;
use App\Services\Chatbot\PremiumChatbotService;

class TestChatbot extends Command
{
    protected $signature = 'chatbot:test';
    protected $description = 'Test chatbot AI functionality';

    public function handle(): int
    {
        $this->info('========================================');
        $this->info('   CHATBOT DEBUG - Why AI Not Working');
        $this->info('========================================');
        $this->newLine();

        $provider = env('CHATBOT_AI_PROVIDER', 'groq');

        // Check raw .env values
        $this->info('1. RAW ENV VALUES FROM .env FILE:');
        $this->line('   CHATBOT_AI_ENABLED=' . env('CHATBOT_AI_ENABLED', 'NOT SET'));
        $this->line('   CHATBOT_AI_PROVIDER=' . $provider);
        $groqKey = env('CHATBOT_GROQ_API_KEY');
        $this->line('   CHATBOT_GROQ_API_KEY=' . ($groqKey ? substr($groqKey, 0, 8) . '...' : 'NOT SET'));
        $this->line('   CHATBOT_GROQ_MODEL=' . env('CHATBOT_GROQ_MODEL', 'NOT SET (default openai/gpt-oss-120b)'));
        $apiKey = env('CHATBOT_AI_API_KEY');
        $this->line('   CHATBOT_AI_API_KEY=' . ($apiKey ? substr($apiKey, 0, 10) . '...' : 'NOT SET'));
        $this->line('   CHATBOT_AI_MODEL=' . env('CHATBOT_AI_MODEL', 'NOT SET'));
        $this->line('   CHATBOT_HYBRID_MODE=' . env('CHATBOT_HYBRID_MODE', 'NOT SET'));
        $this->newLine();

        // Check config values
        $this->info('2. CONFIG VALUES (after Laravel loads):');
        $this->line('   chatbot.ai_enabled=' . (Config::get('chatbot.ai_enabled') ? 'true' : 'false'));
        $this->line('   chatbot.ai_provider=' . Config::get('chatbot.ai_provider'));
        $this->line('   chatbot.groq_api_keys=' . count(Config::get('chatbot.groq_api_keys', [])) . ' key(s) configured');
        $this->line('   chatbot.groq_model=' . Config::get('chatbot.groq_model'));
        $cfgKey = Config::get('chatbot.ai_api_key');
        $this->line('   chatbot.ai_api_key=' . ($cfgKey ? 'SET (' . strlen($cfgKey) . ' chars)' : 'NOT SET'));
        $this->line('   chatbot.hybrid_mode=' . Config::get('chatbot.hybrid_mode'));
        $this->newLine();

        // Check AI service
        $this->info('3. AI SERVICE STATUS:');
        $aiService = new AiChatbotService();
        $this->line('   aiService->isEnabled()=' . ($aiService->isEnabled() ? 'true' : 'false'));
        $this->newLine();

        // Check intent routing
        $this->info('4. INTENT ROUTING CHECK (for hello):');
        $chatbotService = app(PremiumChatbotService::class);
        $intent = 'greeting';
        $aiEligible = Config::get('chatbot.ai_eligible_intents') ?? [];
        $ruleBased = Config::get('chatbot.rule_based_intents') ?? [];
        $this->line('   Intent detected: ' . $intent);
        $this->line('   In ai_eligible_intents? ' . (in_array($intent, $aiEligible) ? 'YES' : 'NO'));
        $this->line('   In rule_based_intents? ' . (in_array($intent, $ruleBased) ? 'YES (blocks AI)' : 'NO'));
        $this->line('   AI should be used? ' . ($aiService->isEnabled() && in_array($intent, $aiEligible) ? 'YES' : 'NO'));
        $this->newLine();

        // Test actual response
        $this->info('5. TEST ACTUAL CHATBOT RESPONSE:');
        $this->line('   Sending: Hello');
        
        try {
            $response = $chatbotService->respond(null, 'Hello', 'cli');
            $this->line('   Response received!');
            $this->line('   Reply: ' . substr($response['reply'] ?? '', 0, 100) . '...');
            $this->line('   Source: ' . ($response['metadata']['source'] ?? $response['source'] ?? 'unknown'));
            
            if (isset($response['source']) && $response['source'] === 'ai') {
                $this->info('   ✅ AI IS WORKING!');
            } else {
                $this->error('   ❌ AI NOT USED (source is not ai)');
                $this->line('   Debug: intent=' . ($response['intent'] ?? 'unknown'));
            }
        } catch (\Exception $e) {
            $this->error('   ❌ ERROR: ' . $e->getMessage());
        }

        $this->newLine();
        $this->info('========================================');
        $this->info('FIX: Add these lines to your .env file:');
        $this->info('========================================');
        $this->line('CHATBOT_AI_ENABLED=true');
        $this->line('CHATBOT_AI_PROVIDER=groq');
        $this->line('CHATBOT_GROQ_API_KEY=gsk_YOUR_KEY_HERE   # https://console.groq.com');
        $this->line('CHATBOT_GROQ_MODEL=openai/gpt-oss-120b');
        $this->line('CHATBOT_HYBRID_MODE=faq_first');
        $this->newLine();
        $this->line('Then run: php artisan config:clear');
        $this->info('========================================');

        return 0;
    }
}
