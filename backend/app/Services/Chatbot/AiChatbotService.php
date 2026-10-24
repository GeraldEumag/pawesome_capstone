<?php

namespace App\Services\Chatbot;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * AI layer for the chatbot. Supports two providers selected by
 * chatbot.ai_provider:
 *
 *  - 'groq'   — OpenAI-compatible chat/completions at api.groq.com (default)
 *  - 'gemini' — Google Gemini generateContent (legacy path)
 *
 * Both paths fail soft: a provider error returns null so the caller falls
 * back to FAQ/rule-based responses. Groq accepts a comma-separated key pool
 * (CHATBOT_GROQ_API_KEYS); the last working key index is cached so a dead
 * key is not hit first on every request.
 */
class AiChatbotService
{
    private const KEY_INDEX_CACHE = 'chatbot_ai:provider_key_index';
    private const KEY_CACHE_TTL = 3600;

    private string $provider;
    /** @var string[] */
    private array $apiKeys;
    private string $model;
    private string $baseUrl;
    private int $timeout;
    private int $maxTokens;
    private bool $enabled;

    public function __construct()
    {
        $this->provider = (string) config('chatbot.ai_provider', 'groq');
        $this->timeout = (int) config('chatbot.ai_timeout', 30);
        $this->maxTokens = (int) config('chatbot.ai_max_tokens', 500);

        if ($this->provider === 'gemini') {
            $keys = [config('chatbot.ai_api_key')];
            $this->model = config('chatbot.ai_model', 'gemini-3.6-flash');
            $this->baseUrl = rtrim(config('chatbot.ai_base_url', 'https://generativelanguage.googleapis.com/v1beta'), '/');
        } else {
            $this->provider = 'groq';
            $keys = config('chatbot.groq_api_keys', []);
            $this->model = config('chatbot.groq_model', 'llama-3.3-70b-versatile');
            $this->baseUrl = rtrim(config('chatbot.groq_base_url', 'https://api.groq.com/openai/v1'), '/');
        }

        $this->apiKeys = array_values(array_unique(array_filter((array) $keys)));
        $this->enabled = (bool) config('chatbot.ai_enabled', false) && $this->apiKeys !== [];
    }

    /**
     * Check if AI is configured and available
     */
    public function isEnabled(): bool
    {
        return $this->enabled;
    }

    /**
     * Generate AI response using the configured provider.
     */
    public function generateResponse(string $message, string $role, array $context = [], array $history = []): ?array
    {
        if (!$this->enabled) {
            return null;
        }

        $systemPrompt = $this->buildSystemPrompt($role, $context);
        $aiMessage = $this->chatComplete($systemPrompt, $message, $this->maxTokens, 0.7, $history);

        if ($aiMessage === null) {
            return null;
        }

        return [
            'message' => trim($aiMessage),
            'suggestions' => $this->extractSuggestions($aiMessage),
            'source' => 'ai',
        ];
    }

    /**
     * Quick AI response for FAQ-style questions.
     */
    public function quickFaqResponse(string $message): ?string
    {
        if (!$this->enabled) {
            return null;
        }

        $store = config('store', []);
        $system = 'You are ' . ($store['assistant_name'] ?? 'Pawsitive') . ', the assistant for '
            . ($store['name'] ?? 'Pawesome Retreat Inc.') . ', a pet hotel and veterinary clinic.'
            . ' Answer briefly in 1-2 sentences, only questions about the store and its services —'
            . ' decline anything else and never invent details.'
            . ' Facts: address ' . ($store['address'] ?? '')
            . '; phone ' . ($store['phone'] ?? '')
            . '; email ' . ($store['email'] ?? '')
            . '; hours 10:00 AM–6:00 PM daily'
            . '; payments ' . ($store['payment_methods'] ?? 'GCash, Maya, cash') . '.';

        return $this->chatComplete($system, $message, 150, 0.5);
    }

    /**
     * Send one chat turn to the configured provider, failing over across the
     * key pool. Returns the assistant text or null when every key failed.
     */
    private function chatComplete(string $systemPrompt, string $userMessage, int $maxTokens, float $temperature, array $history = []): ?string
    {
        $count = count($this->apiKeys);
        $start = (int) Cache::get(self::KEY_INDEX_CACHE, 0);
        $errors = [];

        for ($n = 0; $n < $count; $n++) {
            $index = ($start + $n) % $count;
            try {
                $text = $this->provider === 'groq'
                    ? $this->groqChat($this->apiKeys[$index], $systemPrompt, $userMessage, $maxTokens, $temperature, $history)
                    : $this->geminiChat($this->apiKeys[$index], $systemPrompt, $userMessage, $maxTokens, $temperature, $history);
                if ($index !== $start) {
                    Cache::put(self::KEY_INDEX_CACHE, $index, self::KEY_CACHE_TTL);
                }
                return $text;
            } catch (\RuntimeException $e) {
                $errors[] = 'key#' . ($index + 1) . ': ' . $e->getMessage();
            } catch (\Throwable $e) {
                $errors[] = 'key#' . ($index + 1) . ': ' . $e->getMessage();
            }
        }

        Log::warning(ucfirst($this->provider) . ' chatbot request failed — ' . implode('; ', $errors));

        return null;
    }

    /**
     * Groq OpenAI-compatible chat completion.
     *
     * @throws \RuntimeException on transport/HTTP/malformed responses
     */
    private function groqChat(string $apiKey, string $systemPrompt, string $userMessage, int $maxTokens, float $temperature, array $history = []): string
    {
        $messages = [['role' => 'system', 'content' => $systemPrompt]];
        // Prior turns — each entry: ['role' => 'user'|'assistant', 'content' => …]
        foreach ($history as $turn) {
            $role = ($turn['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
            $content = trim((string) ($turn['content'] ?? ''));
            if ($content !== '') {
                $messages[] = ['role' => $role, 'content' => mb_substr($content, 0, 1000)];
            }
        }
        $messages[] = ['role' => 'user', 'content' => $userMessage];

        $response = Http::withHeaders([
            'Content-Type' => 'application/json',
            'Authorization' => 'Bearer ' . $apiKey,
        ])->timeout($this->timeout)->post("{$this->baseUrl}/chat/completions", [
            'model' => $this->model,
            'messages' => $messages,
            'max_tokens' => $maxTokens,
            'temperature' => $temperature,
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException("HTTP {$response->status()}");
        }

        $text = $response->json('choices.0.message.content');
        if (!is_string($text) || trim($text) === '') {
            throw new \RuntimeException('returned no content.');
        }

        return $text;
    }

    /**
     * Google Gemini generateContent call (key via header, never in the URL).
     *
     * @throws \RuntimeException on transport/HTTP/malformed responses
     */
    private function geminiChat(string $apiKey, string $systemPrompt, string $userMessage, int $maxTokens, float $temperature, array $history = []): string
    {
        // Gemini path has no native multi-turn here — append prior turns as text.
        $historyText = '';
        foreach ($history as $turn) {
            $speaker = ($turn['role'] ?? '') === 'assistant' ? 'Assistant' : 'Customer';
            $content = trim((string) ($turn['content'] ?? ''));
            if ($content !== '') {
                $historyText .= "{$speaker}: " . mb_substr($content, 0, 500) . "\n";
            }
        }
        $userContent = ($historyText !== '' ? "Previous messages:\n{$historyText}\n" : '')
            . "User question: " . $userMessage;

        $response = Http::withHeaders([
            'Content-Type' => 'application/json',
            'x-goog-api-key' => $apiKey,
        ])->timeout($this->timeout)->post("{$this->baseUrl}/models/{$this->model}:generateContent", [
            'contents' => [
                [
                    'role' => 'user',
                    'parts' => [
                        ['text' => $systemPrompt . "\n\n" . $userContent]
                    ]
                ]
            ],
            'generationConfig' => [
                'temperature' => $temperature,
                'maxOutputTokens' => $maxTokens,
                'topP' => 0.95,
                'topK' => 40,
            ],
            'safetySettings' => [
                ['category' => 'HARM_CATEGORY_HARASSMENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                ['category' => 'HARM_CATEGORY_HATE_SPEECH', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                ['category' => 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                ['category' => 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
            ],
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException("HTTP {$response->status()}");
        }

        $text = $response->json('candidates.0.content.parts.0.text');
        if (!is_string($text) || trim($text) === '') {
            throw new \RuntimeException('returned no content.');
        }

        return $text;
    }

    /**
     * Build system prompt based on role and context
     */
    private function buildSystemPrompt(string $role, array $context): string
    {
        $store = config('store', []);
        $storeName = $store['name'] ?? 'Pawesome Retreat Inc.';

        $basePrompt = "You are " . ($store['assistant_name'] ?? 'Pawsitive') . ", the AI assistant of {$storeName} — a pet hotel and veterinary clinic. You answer through the Pawesome management system's chat widget.\n\n";

        $rolePrompts = [
            'customer' => "The user is a CUSTOMER of {$storeName}. Help them with:\n" .
                "- Pet hotel boarding bookings and inquiries\n" .
                "- Veterinary appointment questions\n" .
                "- Service pricing and availability\n" .
                "- Payments (GCash/Maya receipts, counter cash)\n" .
                "- Their pet's care and wellness\n" .
                "- Account and profile questions\n" .
                "Be friendly, empathetic, and professional. Guide them to use the dashboard features when appropriate.",

            'receptionist' => "The user is a RECEPTIONIST at {$storeName}. Help them with:\n" .
                "- Managing appointments and check-ins/check-outs\n" .
                "- Hotel room bookings and availability\n" .
                "- Customer inquiries and walk-ins\n" .
                "- Daily operations and scheduling\n" .
                "Be efficient, clear, and operational-focused.",

            'veterinary' => "The user is VETERINARY STAFF at {$storeName}. Help them with:\n" .
                "- Patient care and medical records\n" .
                "- Current boarders and their needs\n" .
                "- Appointment scheduling and follow-ups\n" .
                "- Medical terminology and procedures\n" .
                "Be professional, precise, and medically appropriate.",

            'manager' => "The user is a MANAGER at {$storeName}. Help them with:\n" .
                "- Reports and analytics\n" .
                "- Staff and resource management\n" .
                "- Hotel occupancy and revenue\n" .
                "- Business operations and KPIs\n" .
                "Be data-driven, strategic, and concise.",

            'admin' => "The user is an ADMIN at {$storeName}. Help them with:\n" .
                "- System administration and user management\n" .
                "- Configuration and settings\n" .
                "- Logs and troubleshooting\n" .
                "- Complete system overview\n" .
                "Be technical, comprehensive, and direct.",

            'default' => "Help the user with questions about {$storeName}, its services, and how to use the system.",
        ];

        $prompt = $basePrompt . ($rolePrompts[$role] ?? $rolePrompts['default']);

        // Store profile — the chatbot's ground truth for business questions.
        $prompt .= "\n\nSTORE PROFILE:\n";
        $prompt .= "- Business name: {$storeName}\n";
        $prompt .= "- Address: " . ($store['address'] ?? 'n/a') . "\n";
        $prompt .= "- Phone: " . ($store['phone'] ?? 'n/a') . "  Email: " . ($store['email'] ?? 'n/a') . "\n";
        $prompt .= "- Facebook: " . ($store['facebook'] ?? 'n/a') . "  Instagram: " . ($store['instagram'] ?? 'n/a') . "\n";
        try {
            $hours = \App\Support\StoreHours::label() . ' every day';
        } catch (\Throwable) {
            $hours = '10:00 AM–6:00 PM every day';
        }
        $prompt .= "- Operating hours: {$hours}\n";
        $prompt .= "- Boarding check-in / check-out: " . ($store['checkin_window'] ?? 'during operating hours') . "\n";
        $prompt .= "- Cancellation: " . ($store['cancellation'] ?? 'contact reception') . "\n";
        $prompt .= "- Payments accepted: " . ($store['payment_methods'] ?? 'GCash, Maya, cash') . "\n";
        $prompt .= "- Boarding requirement: " . ($store['vaccination_policy'] ?? 'a verified vaccination card') . "\n";

        // Ground truth prices — fail-soft so a DB blip never breaks the bot.
        try {
            $services = \App\Models\Service::where('is_active', true)->orderBy('name')->get(['name', 'price']);
            if ($services->isNotEmpty()) {
                $prompt .= "- Service prices (authoritative):\n";
                foreach ($services as $svc) {
                    $prompt .= "  • {$svc->name}: ₱" . number_format((float) $svc->price, 2) . "\n";
                }
            }
            $rooms = \DB::table('hotel_rooms')->whereNull('deleted_at')->orderBy('daily_rate')->get(['name', 'type', 'daily_rate']);
            if ($rooms->isNotEmpty()) {
                $prompt .= "- Boarding rates per night (authoritative):\n";
                foreach ($rooms as $room) {
                    $prompt .= "  • {$room->name} ({$room->type}): ₱" . number_format((float) $room->daily_rate, 2) . "\n";
                }
            }
        } catch (\Throwable) {
            // Pricing block optional — FAQ + store profile still cover basics.
        }


        // Add live context if available (rich format from gatherLiveContext)
        if (!empty($context)) {
            $prompt .= "\nCURRENT SYSTEM CONTEXT:\n";

            // Hotel information
            if (isset($context['hotel'])) {
                $h = $context['hotel'];
                $prompt .= "🏨 HOTEL:\n";
                $prompt .= "- Available rooms: " . ($h['rooms_available_count'] ?? 'N/A') . "\n";
                $prompt .= "- Occupancy rate: " . ($h['occupancy_rate'] ?? 'N/A') . "\n";
                if (!empty($h['rooms_available_details'])) {
                    $prompt .= "- Room options:\n";
                    foreach (array_slice($h['rooms_available_details'], 0, 3) as $room) {
                        $prompt .= "  • {$room['type']} ({$room['room']}): {$room['rate']}/night, fits {$room['capacity']} pets\n";
                    }
                }
            }

            // Current boarders
            if (isset($context['current_boarders'])) {
                $cb = $context['current_boarders'];
                $prompt .= "\n🐾 CURRENT BOARDERS: " . ($cb['count'] ?? 0) . " pets\n";
                if (!empty($cb['boarders'])) {
                    foreach (array_slice($cb['boarders'], 0, 3) as $b) {
                        $prompt .= "  • {$b['pet_name']} ({$b['pet_species']}) - Room {$b['room']}\n";
                    }
                }
            }

            // Today's appointments
            if (isset($context['today_appointments'])) {
                $ta = $context['today_appointments'];
                $prompt .= "\n📅 TODAY'S APPOINTMENTS: " . ($ta['count'] ?? 0) . "\n";
                if (!empty($ta['appointments'])) {
                    foreach (array_slice($ta['appointments'], 0, 3) as $a) {
                        $prompt .= "  • {$a['time']} - {$a['service']} for {$a['pet']} ({$a['status']})\n";
                    }
                }
            }

            // Services and pricing
            if (isset($context['services']) && !empty($context['services'])) {
                $prompt .= "\n💰 SERVICES:\n";
                foreach (array_slice($context['services'], 0, 2, true) as $category => $services) {
                    $prompt .= "- " . ucfirst($category) . ":\n";
                    foreach (array_slice($services, 0, 3) as $svc) {
                        $prompt .= "  • {$svc['name']}: {$svc['price']}\n";
                    }
                }
            }

            // Financial info
            if (isset($context['financial'])) {
                $f = $context['financial'];
                $prompt .= "\n💵 FINANCIAL:\n";
                $prompt .= "- Today's revenue: " . ($f['today_revenue'] ?? 'N/A') . "\n";
            }

            // System info
            if (isset($context['system'])) {
                $s = $context['system'];
                $prompt .= "\n⏰ SYSTEM:\n";
                $prompt .= "- Current time: " . ($s['current_datetime'] ?? now()->format('l, F j, Y g:i A')) . "\n";
            }
        }

        $prompt .= "\n\nSCOPE — answer only for {$storeName}:\n" .
            "- Answer questions about {$storeName} only: its services, prices, bookings, boarding, payments, store policies, this app, and the customer's own pets.\n" .
            "- For anything else (other businesses, news, general knowledge, homework, code), politely decline and steer back to store topics.\n" .
            "- Never invent prices, services, or policies — if unsure, say so and point to reception ({$store['phone']} / {$store['email']}).\n" .
            "- Never give medical diagnoses or drug dosages; advise booking a veterinary consultation.\n";

        $prompt .= "\nGUIDELINES:\n" .
            "- Keep responses concise (2-3 sentences max for simple questions)\n" .
            "- For booking requests, suggest using the booking workflow\n" .
            "- If you don't know something, say so and suggest contacting support\n" .
            "- Use a warm, professional tone appropriate for a pet care business\n" .
            "- Currency is Philippine Peso (₱)";

        return $prompt;
    }

    /**
     * Extract suggested follow-up questions from AI response
     */
    private function extractSuggestions(string $message): array
    {
        $suggestions = [];

        // Common suggestion patterns based on message content
        if (stripos($message, 'hotel') !== false || stripos($message, 'boarding') !== false) {
            $suggestions[] = 'Book a hotel stay';
            $suggestions[] = 'Check room availability';
        }
        if (stripos($message, 'appointment') !== false || stripos($message, 'vet') !== false) {
            $suggestions[] = 'Schedule an appointment';
            $suggestions[] = 'View my appointments';
        }
        if (stripos($message, 'price') !== false || stripos($message, 'cost') !== false || stripos($message, 'rate') !== false) {
            $suggestions[] = 'View service pricing';
        }
        if (stripos($message, 'pet') !== false) {
            $suggestions[] = 'View my pets';
        }

        // Add generic helpful suggestions
        if (count($suggestions) < 3) {
            $suggestions[] = 'Show dashboard summary';
        }
        if (count($suggestions) < 3) {
            $suggestions[] = 'How do I contact support?';
        }

        return array_slice($suggestions, 0, 3);
    }
}
