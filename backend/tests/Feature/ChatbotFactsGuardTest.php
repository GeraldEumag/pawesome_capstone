<?php

namespace Tests\Feature;

use App\Services\Chatbot\PremiumChatbotService;
use App\Support\StoreFacts;
use Tests\TestCase;

/**
 * M1 guard: no placeholder/hardcoded business facts may exist anywhere the
 * chatbot can quote them. Every contact, address and price a user sees must
 * come from config/store.php (StoreFacts) or the database.
 */
class ChatbotFactsGuardTest extends TestCase
{
    /** Strings that must never appear in user-facing code again. */
    private const BANNED = [
        '(555)',
        '555-',
        'pawsitive.com',
        '123 Pet Care',
        '8123-4567',
        '8987-6543',
        '8123-4568',
        'pawesome.ph',
        'feedback@pawesome',
        'complaints@pawesome',
        'Animal City',
        'Makati City',
        'yourdomain.com',
    ];

    public function test_no_banned_placeholder_facts_in_app_code(): void
    {
        $hits = [];

        // EvaluateChatbot cites banned strings in its `forbid` fixtures —
        // it is test data, not a user-facing source.
        $exempt = [str_replace('\\', '/', app_path('Console/Commands/EvaluateChatbot.php'))];

        foreach ($this->phpFiles(app_path()) as $file) {
            if (in_array(str_replace('\\', '/', $file), $exempt, true)) {
                continue;
            }
            $code = file_get_contents($file);
            foreach (self::BANNED as $banned) {
                if (str_contains($code, $banned)) {
                    $hits[] = "{$file} contains '{$banned}'";
                }
            }
        }

        $seedFile = database_path('seeders/ChatbotFaqSeeder.php');
        $seedCode = file_get_contents($seedFile);
        foreach (self::BANNED as $banned) {
            if (str_contains($seedCode, $banned)) {
                $hits[] = "{$seedFile} contains '{$banned}'";
            }
        }

        $this->assertSame([], $hits, "Placeholder store facts found:\n" . implode("\n", $hits));
    }

    public function test_public_message_uses_store_facts(): void
    {
        $contact = $this->postJson('/api/chatbot/public/message', ['message' => 'how do I contact you?']);
        $contact->assertOk();
        $this->assertStringContainsString(StoreFacts::phone(), $contact->json('reply'));
        $this->assertStringContainsString(StoreFacts::email(), $contact->json('reply'));

        $location = $this->postJson('/api/chatbot/public/message', ['message' => 'where are you located?']);
        $location->assertOk();
        $this->assertStringContainsString('Las Piñas', $location->json('reply'));

        $emergency = $this->postJson('/api/chatbot/public/message', ['message' => 'emergency vet needed']);
        $emergency->assertOk();
        $this->assertStringContainsString(StoreFacts::phone(), $emergency->json('reply'));
        $this->assertStringNotContainsString('24/7', $emergency->json('reply'));
    }

    public function test_premium_handlers_use_store_facts(): void
    {
        // Guest user → respond() skips logging, no DB write needed.
        $service = new PremiumChatbotService(
            new \App\Services\Chatbot\RoleScopeService(),
            new \App\Services\Chatbot\KnowledgeBaseService(),
        );

        foreach (['emergency vet help', 'phone number please', 'where is the clinic located'] as $q) {
            $res = $service->respond(null, $q, 'test');
            $reply = $res['reply'] ?? '';
            foreach (self::BANNED as $banned) {
                $this->assertStringNotContainsString($banned, $reply, "Reply to '{$q}' contains banned fact '{$banned}'");
            }
        }

        $emergency = $service->respond(null, 'emergency', 'test');
        $this->assertStringContainsString(StoreFacts::phone(), $emergency['reply']);

        $location = $service->respond(null, 'where are you located', 'test');
        $this->assertStringContainsString(StoreFacts::address(), $location['reply']);
    }

    /** @return string[] */
    private function phpFiles(string $dir): array
    {
        $files = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir));
        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }
        return $files;
    }
}
