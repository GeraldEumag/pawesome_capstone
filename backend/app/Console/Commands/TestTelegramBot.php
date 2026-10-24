<?php

namespace App\Console\Commands;

use App\Services\TelegramService;
use App\Services\NotificationTemplateService;
use App\Services\Chatbot\PremiumChatbotService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Config;

class TestTelegramBot extends Command
{
    protected $signature = 'telegram:test
                            {--chat-id= : Telegram chat ID to send test message to}
                            {--test=connectivity : Test type: connectivity, webhook, templates, chatbot}
                            {--token= : Override bot token for testing}';

    protected $description = 'Test Telegram bot configuration and functionality';

    public function handle(): int
    {
        $this->info('========================================');
        $this->info('   TELEGRAM BOT TESTING TOOL');
        $this->info('========================================');
        $this->newLine();

        $testType = $this->option('test') ?? 'connectivity';

        // Check configuration
        $this->checkConfiguration();

        return match ($testType) {
            'connectivity' => $this->testConnectivity(),
            'webhook' => $this->testWebhook(),
            'templates' => $this->testTemplates(),
            'chatbot' => $this->testChatbotIntegration(),
            default => $this->testConnectivity(),
        };
    }

    /**
     * Check Telegram configuration
     */
    private function checkConfiguration(): void
    {
        $this->info('1. CONFIGURATION CHECK');
        $this->newLine();

        $botToken = $this->option('token') ?? Config::get('services.telegram.bot_token');
        $webhookUrl = Config::get('services.telegram.webhook_url');
        $webhookSecret = Config::get('services.telegram.webhook_secret');

        if (empty($botToken)) {
            $this->error('   ❌ BOT TOKEN: Not configured');
            $this->line('      Set TELEGRAM_BOT_TOKEN in your .env file');
        } else {
            $this->info('   ✅ BOT TOKEN: Configured (' . substr($botToken, 0, 10) . '...)');
        }

        if (empty($webhookUrl)) {
            $this->warn('   ⚠️  WEBHOOK URL: Not configured');
            $this->line('      Set TELEGRAM_WEBHOOK_URL in your .env file');
        } else {
            $this->info('   ✅ WEBHOOK URL: ' . $webhookUrl);
        }

        if (empty($webhookSecret)) {
            $this->warn('   ⚠️  WEBHOOK SECRET: Not configured (optional but recommended)');
            $this->line('      Set TELEGRAM_WEBHOOK_SECRET in your .env file for security');
        } else {
            $this->info('   ✅ WEBHOOK SECRET: Configured');
        }

        $this->newLine();
    }

    /**
     * Test bot connectivity
     */
    private function testConnectivity(): int
    {
        $this->info('2. BOT CONNECTIVITY TEST');
        $this->newLine();

        $telegramService = app(TelegramService::class);

        // Get bot info
        $botInfo = $telegramService->getMe();

        if ($botInfo) {
            $this->info('   ✅ BOT CONNECTED SUCCESSFULLY');
            $this->newLine();
            $this->line('   Bot Name: ' . ($botInfo['first_name'] ?? 'N/A'));
            $this->line('   Username: @' . ($botInfo['username'] ?? 'N/A'));
            $this->line('   Can Join Groups: ' . ($botInfo['can_join_groups'] ? 'Yes' : 'No'));
            $this->line('   Supports Inline: ' . ($botInfo['supports_inline_queries'] ? 'Yes' : 'No'));
        } else {
            $this->error('   ❌ FAILED TO CONNECT TO BOT');
            $this->line('      Check your bot token and internet connection');
            return 1;
        }

        $this->newLine();

        // Send test message if chat ID provided
        $chatId = $this->option('chat-id');
        if ($chatId) {
            $this->info('3. SENDING TEST MESSAGE');
            $this->newLine();

            $testMessage = "🧪 *Test Message*\n\n" .
                "This is a test from Pawsitive Telegram Bot.\n\n" .
                "✅ Configuration verified\n" .
                "✅ Bot is working\n" .
                "✅ Message delivered\n\n" .
                "_Test completed at: " . now()->format('Y-m-d H:i:s') . "_";

            $success = $telegramService->sendMessage($chatId, $testMessage);

            if ($success) {
                $this->info('   ✅ TEST MESSAGE SENT SUCCESSFULLY');
                $this->line('      Chat ID: ' . $chatId);
            } else {
                $this->error('   ❌ FAILED TO SEND TEST MESSAGE');
                $this->line('      Check that the chat ID is correct and valid');
                return 1;
            }
        } else {
            $this->warn('   ⚠️  No chat ID provided. Use --chat-id=YOUR_CHAT_ID to send a test message.');
            $this->line('      To get your chat ID:');
            $this->line('      1. Message your bot on Telegram');
            $this->line('      2. Check the webhook logs for the chat ID');
        }

        $this->newLine();
        $this->info('========================================');
        $this->info('TEST COMPLETE');
        $this->info('========================================');

        return 0;
    }

    /**
     * Test webhook configuration
     */
    private function testWebhook(): int
    {
        $this->info('2. WEBHOOK CONFIGURATION TEST');
        $this->newLine();

        $botToken = Config::get('services.telegram.bot_token');

        if (empty($botToken)) {
            $this->error('   ❌ Bot token not configured');
            return 1;
        }

        // Get current webhook info
        $apiUrl = "https://api.telegram.org/bot{$botToken}";
        $response = Http::post("{$apiUrl}/getWebhookInfo");

        if ($response->successful()) {
            $result = $response->json()['result'] ?? null;

            if ($result) {
                $this->info('   ✅ WEBHOOK INFO RETRIEVED');
                $this->newLine();
                $this->line('   URL: ' . ($result['url'] ?: 'Not set'));
                $this->line('   Has Custom Cert: ' . ($result['has_custom_certificate'] ? 'Yes' : 'No'));
                $this->line('   Pending Updates: ' . ($result['pending_update_count'] ?? 0));

                if (!empty($result['last_error_date'])) {
                    $this->error('   ⚠️  Last Error: ' . ($result['last_error_message'] ?? 'Unknown'));
                    $this->line('      Date: ' . date('Y-m-d H:i:s', $result['last_error_date']));
                }

                if (!empty($result['ip_address'])) {
                    $this->line('   IP Address: ' . $result['ip_address']);
                }

                if (!empty($result['max_connections'])) {
                    $this->line('   Max Connections: ' . $result['max_connections']);
                }
            }
        } else {
            $this->error('   ❌ Failed to get webhook info');
        }

        $this->newLine();
        $this->info('3. WEBHOOK SETUP INSTRUCTIONS');
        $this->newLine();
        $this->line('   To set up webhook:');
        $this->line('   1. Make sure your server is publicly accessible');
        $this->line('   2. Run: php artisan telegram:setup (if available)');
        $this->line('   3. Or use admin panel to set webhook');
        $this->line('   4. Webhook URL should point to: /api/telegram/webhook');
        $this->newLine();

        return 0;
    }

    /**
     * Test notification templates
     */
    private function testTemplates(): int
    {
        $this->info('2. NOTIFICATION TEMPLATES TEST');
        $this->newLine();

        $chatId = $this->option('chat-id');
        $telegramService = app(TelegramService::class);

        $templates = [
            NotificationTemplateService::TYPE_BOOKING_CREATED,
            NotificationTemplateService::TYPE_BOOKING_CONFIRMED,
            NotificationTemplateService::TYPE_APPOINTMENT_CREATED,
            NotificationTemplateService::TYPE_APPOINTMENT_CONFIRMED,
        ];

        $testData = [
            'pet_name' => 'Max (Test Pet)',
            'customer_name' => 'Test Customer',
            'check_in' => now()->addDay()->format('M d, Y'),
            'check_out' => now()->addDays(3)->format('M d, Y'),
            'room_type' => 'Deluxe Suite',
            'room_number' => '101',
            'nights' => 2,
            'total' => '₱2,400.00',
            'service' => 'Grooming & Spa',
            'veterinarian' => 'Dr. Smith',
            'date' => now()->addDay()->format('M d, Y'),
            'time' => '10:00 AM',
        ];

        foreach ($templates as $template) {
            $this->line("   Testing: {$template}");
            $message = NotificationTemplateService::generate($template, $testData, 'telegram');

            if ($chatId) {
                $success = $telegramService->sendMessage($chatId, $message);
                if ($success) {
                    $this->info("   ✅ Sent");
                } else {
                    $this->error("   ❌ Failed to send");
                }
            } else {
                $this->line("   (Preview - provide --chat-id to send)");
                $this->line("   " . str_replace("\n", "\n   ", substr($message, 0, 200)) . "...");
            }
            $this->newLine();
        }

        return 0;
    }

    /**
     * Test chatbot integration
     */
    private function testChatbotIntegration(): int
    {
        $this->info('2. CHATBOT INTEGRATION TEST');
        $this->newLine();

        $chatbotService = app(PremiumChatbotService::class);

        $testMessages = [
            'hello' => 'Greeting',
            'book hotel' => 'Hotel booking intent',
            'what are your hours' => 'FAQ lookup',
            'help' => 'Support intent',
        ];

        foreach ($testMessages as $message => $description) {
            $this->line("   Testing: \"{$message}\" ({$description})");

            try {
                $response = $chatbotService->respond(null, $message, 'telegram');

                $this->info("   ✅ Response received");
                $this->line("      Intent: " . ($response['intent'] ?? 'unknown'));
                $this->line("      Reply: " . substr($response['reply'], 0, 80) . "...");
                $this->line("      Source: " . ($response['source'] ?? 'unknown'));
            } catch (\Exception $e) {
                $this->error("   ❌ Error: " . $e->getMessage());
            }

            $this->newLine();
        }

        return 0;
    }
}
