<?php

namespace App\Services\Chatbot;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AiChatbotService
{
    private ?string $apiKey;
    private string $model;
    private string $baseUrl;
    private int $timeout;
    private int $maxTokens;
    private bool $enabled;

    public function __construct()
    {
        $this->apiKey = config('chatbot.ai_api_key');
        // Gemini models: gemini-3.6-flash (fast/cheap), gemini-3.6-pro (powerful)
        $this->model = config('chatbot.ai_model', 'gemini-3.6-flash');
        $this->baseUrl = config('chatbot.ai_base_url', 'https://generativelanguage.googleapis.com/v1beta');
        $this->timeout = (int) config('chatbot.ai_timeout', 30);
        $this->maxTokens = (int) config('chatbot.ai_max_tokens', 500);
        $this->enabled = config('chatbot.ai_enabled', false) && !empty($this->apiKey);
    }

    /**
     * Check if AI is configured and available
     */
    public function isEnabled(): bool
    {
        return $this->enabled;
    }

    /**
     * Generate AI response using Google Gemini API
     */
    public function generateResponse(string $message, string $role, array $context = []): ?array
    {
        if (!$this->enabled) {
            return null;
        }

        try {
            $systemPrompt = $this->buildSystemPrompt($role, $context);
            
            // Gemini API endpoint — key sent via header so it never lands in URLs or logs
            $endpoint = "{$this->baseUrl}/models/{$this->model}:generateContent";

            $response = Http::withHeaders([
                'Content-Type' => 'application/json',
                'x-goog-api-key' => $this->apiKey,
            ])->timeout($this->timeout)->post($endpoint, [
                'contents' => [
                    [
                        'role' => 'user',
                        'parts' => [
                            ['text' => $systemPrompt . "\n\nUser question: " . $message]
                        ]
                    ]
                ],
                'generationConfig' => [
                    'temperature' => 0.7,
                    'maxOutputTokens' => $this->maxTokens,
                    'topP' => 0.95,
                    'topK' => 40,
                ],
                'safetySettings' => [
                    [
                        'category' => 'HARM_CATEGORY_HARASSMENT',
                        'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'
                    ],
                    [
                        'category' => 'HARM_CATEGORY_HATE_SPEECH',
                        'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'
                    ],
                    [
                        'category' => 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                        'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'
                    ],
                    [
                        'category' => 'HARM_CATEGORY_DANGEROUS_CONTENT',
                        'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'
                    ],
                ],
            ]);

            if ($response->successful()) {
                $data = $response->json();
                
                // Extract text from Gemini response structure
                $candidates = $data['candidates'] ?? [];
                if (!empty($candidates) && isset($candidates[0]['content']['parts'][0]['text'])) {
                    $aiMessage = $candidates[0]['content']['parts'][0]['text'];
                    
                    return [
                        'message' => trim($aiMessage),
                        'suggestions' => $this->extractSuggestions($aiMessage),
                        'source' => 'ai',
                    ];
                }
            }

            Log::warning('Gemini API returned unsuccessful response', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            
            return null;

        } catch (\Exception $e) {
            Log::error('Gemini API error: ' . $e->getMessage(), [
                'exception' => $e,
            ]);
            return null;
        }
    }

    /**
     * Build system prompt based on role and context
     */
    private function buildSystemPrompt(string $role, array $context): string
    {
        $basePrompt = "You are Pawsitive, a helpful AI assistant for a Pet Hotel and Veterinary Management System called 'Pawesome'.\n\n";
        
        $rolePrompts = [
            'customer' => "The user is a CUSTOMER. Help them with:\n" .
                "- Pet hotel boarding bookings and inquiries\n" .
                "- Veterinary appointment questions\n" .
                "- Service pricing and availability\n" .
                "- Their pet's care and wellness\n" .
                "- Account and profile questions\n" .
                "Be friendly, empathetic, and professional. Guide them to use the dashboard features when appropriate.",
            
            'receptionist' => "The user is a RECEPTIONIST. Help them with:\n" .
                "- Managing appointments and check-ins/check-outs\n" .
                "- Hotel room bookings and availability\n" .
                "- Customer inquiries and walk-ins\n" .
                "- Daily operations and scheduling\n" .
                "Be efficient, clear, and operational-focused.",
            
            'veterinary' => "The user is VETERINARY STAFF. Help them with:\n" .
                "- Patient care and medical records\n" .
                "- Current boarders and their needs\n" .
                "- Appointment scheduling and follow-ups\n" .
                "- Medical terminology and procedures\n" .
                "Be professional, precise, and medically appropriate.",
            
            'manager' => "The user is a MANAGER. Help them with:\n" .
                "- Reports and analytics\n" .
                "- Staff and resource management\n" .
                "- Hotel occupancy and revenue\n" .
                "- Business operations and KPIs\n" .
                "Be data-driven, strategic, and concise.",
            
            'admin' => "The user is an ADMIN. Help them with:\n" .
                "- System administration and user management\n" .
                "- Configuration and settings\n" .
                "- Logs and troubleshooting\n" .
                "- Complete system overview\n" .
                "Be technical, comprehensive, and direct.",
            
            'default' => "Help the user with general questions about pet care, our services, and how to use the system.",
        ];

        $prompt = $basePrompt . ($rolePrompts[$role] ?? $rolePrompts['default']);

        // Add live context if available (rich format from gatherLiveContext)
        if (!empty($context)) {
            $prompt .= "\n\nCURRENT SYSTEM CONTEXT:\n";

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
                $prompt .= "- Business hours: " . ($s['business_hours'] ?? 'Mon-Sat 9AM-6PM, Sun 10AM-4PM') . "\n";
            }
        }

        $prompt .= "\n\nGUIDELINES:\n" .
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

    /**
     * Quick AI response for FAQ-style questions using Gemini
     */
    public function quickFaqResponse(string $message): ?string
    {
        if (!$this->enabled) {
            return null;
        }

        try {
            $endpoint = "{$this->baseUrl}/models/{$this->model}:generateContent";

            $response = Http::withHeaders([
                'Content-Type' => 'application/json',
                'x-goog-api-key' => $this->apiKey,
            ])->timeout(15)->post($endpoint, [
                'contents' => [
                    [
                        'role' => 'user',
                        'parts' => [
                            ['text' => "You are a helpful pet hotel assistant for Pawsitive. Answer briefly in 1-2 sentences.\n\nQuestion: {$message}"]
                        ]
                    ]
                ],
                'generationConfig' => [
                    'temperature' => 0.5,
                    'maxOutputTokens' => 150,
                ],
            ]);

            if ($response->successful()) {
                $data = $response->json();
                $candidates = $data['candidates'] ?? [];
                if (!empty($candidates) && isset($candidates[0]['content']['parts'][0]['text'])) {
                    return trim($candidates[0]['content']['parts'][0]['text']);
                }
            }

            return null;

        } catch (\Exception $e) {
            Log::error('Gemini quick response error: ' . $e->getMessage());
            return null;
        }
    }
}
