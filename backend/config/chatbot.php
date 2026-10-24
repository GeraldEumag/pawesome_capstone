<?php

return [
    /*
    |--------------------------------------------------------------------------
    | AI Chatbot Configuration
    |--------------------------------------------------------------------------
    |
    | Configure the AI-powered features of the chatbot. When enabled, the
    | chatbot will use AI for general questions while keeping rule-based
    | responses for critical actions like bookings.
    |
    */

    // AI Chatbot Configuration (Optional - enables AI-powered responses)
    'ai_enabled' => env('CHATBOT_AI_ENABLED', false),

    // AI provider: 'groq' (OpenAI-compatible, default) or 'gemini'.
    'ai_provider' => env('CHATBOT_AI_PROVIDER', 'groq'),

    // Groq (https://console.groq.com) — OpenAI-compatible chat completions.
    'groq_api_key' => env('CHATBOT_GROQ_API_KEY', null),
    // Optional comma-separated backup keys, tried in order on failure.
    'groq_api_keys' => array_values(array_unique(array_filter(array_map('trim', array_merge(
        [(string) env('CHATBOT_GROQ_API_KEY', '')],
        explode(',', (string) env('CHATBOT_GROQ_API_KEYS', ''))
    ))))),
    // Model: openai/gpt-oss-120b (balanced), llama-3.1-8b-instant (cheap/fast),
    // openai/gpt-oss-120b (larger).
    'groq_model' => env('CHATBOT_GROQ_MODEL', 'openai/gpt-oss-120b'),
    'groq_base_url' => env('CHATBOT_GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),

    // Google Gemini API Key (free tier available at https://ai.google.dev)
    'ai_api_key' => env('CHATBOT_AI_API_KEY', null),

    // Model: gemini-3.6-flash (fast/cheap) or gemini-3.6-pro (powerful)
    'ai_model' => env('CHATBOT_AI_MODEL', 'gemini-3.6-flash'),

    // Google Gemini API endpoint
    'ai_base_url' => env('CHATBOT_AI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),

    // Timeout for AI requests in seconds
    'ai_timeout' => env('CHATBOT_AI_TIMEOUT', 30),

    // Maximum tokens for AI responses
    'ai_max_tokens' => env('CHATBOT_AI_MAX_TOKENS', 500),

    /*
    |--------------------------------------------------------------------------
    | Intent Routing Configuration
    |--------------------------------------------------------------------------
    |
    | Define which intents should use rule-based responses vs AI.
    | Critical actions (bookings) use rules for reliability.
    | General questions use AI for natural conversation.
    |
    */

    // Intents that ALWAYS use rule-based responses (critical actions)
    'rule_based_intents' => [
        'create_booking',
        'cancel_booking',
        'modify_booking',
        'payment',
        'hotel_booking',
        'check_in',
        'check_out',
        'summary',
        'pricing',
        'services',
    ],

    // Intents eligible for AI responses (general questions, advice, help)
    'ai_eligible_intents' => [
        'general',
        'faq',
        'help',
        'advice',
        'unknown',
        'greeting',
        'goodbye',
    ],

    // If no intent detected, use AI if enabled (true) or fallback response (false)
    'ai_for_unknown_intents' => true,

    /*
    |--------------------------------------------------------------------------
    | Hybrid Behavior
    |--------------------------------------------------------------------------
    |
    | When both FAQ and AI are available:
    | - 'faq_first': Check database FAQs first, fallback to AI
    * - 'ai_first': Use AI first (faster but costs more)
    | - 'smart': Use FAQ for exact matches, AI for everything else
    |
    */
    'hybrid_mode' => env('CHATBOT_HYBRID_MODE', 'faq_first'),

    /*
    |--------------------------------------------------------------------------
    | FAQ Matching
    |--------------------------------------------------------------------------
    |
    | Synonym/Taglish expansion for KnowledgeBaseService::findAnswer().
    | A term found in the customer message adds its canonical English words
    | to the searched text so Tagalog/Taglish phrasing hits English FAQs.
    |
    */
    'synonyms' => [
        'magkano' => 'price cost rate how much',
        'presyo' => 'price cost rate',
        'paano' => 'how',
        'pano' => 'how',
        'saan' => 'where location address',
        'nasaan' => 'where location address',
        'bayad' => 'payment pay',
        'bayaran' => 'payment pay',
        'oras' => 'hours time open schedule',
        'pwede' => 'can',
        'puwede' => 'can',
        'alisin' => 'cancel cancellation',
        'kansel' => 'cancel cancellation',
        'bakuna' => 'vaccine vaccination',
        'turok' => 'vaccine vaccination',
        'libre' => 'free cancellation',
        'bukas' => 'open hours',
        'sarado' => 'close closed hours',
        'gabi' => 'hours time night',
        'umaga' => 'hours time morning',
        'groom' => 'grooming bath',
        'ligo' => 'grooming bath',
        'hotel' => 'boarding hotel room stay',
        'mag book' => 'book booking reserve',
        'kunin' => 'pickup check-out',
        'iwan' => 'drop-off check-in boarding',
        'emergency' => 'emergency urgent',
        'agad' => 'urgent emergency',
        'pagkain' => 'food supplies store',
        'gamot' => 'medicine veterinary medical',
        'tulong' => 'help support',
        'salamat' => 'thank',
    ],

    // Conversation memory: how many recent turns to feed the AI.
    'memory_turns' => (int) env('CHATBOT_MEMORY_TURNS', 4),

    /*
    |--------------------------------------------------------------------------
    | Feature Flags
    |--------------------------------------------------------------------------
    |
    | Every new behavior ships behind a flag so it can be switched off
    | without a deploy — the rule/FAQ path keeps working either way.
    |
    */

    // Inject role-scoped live system context into the AI prompt.
    'context_enabled' => env('CHATBOT_CONTEXT_ENABLED', true),

    // Allow the AI to call read-only server-side tools (Groq function calling).
    'tools_enabled' => env('CHATBOT_TOOLS_ENABLED', true),

    // Let the PUBLIC landing bot use the AI — off by default to control cost.
    'public_ai_enabled' => env('CHATBOT_PUBLIC_AI_ENABLED', false),

    // Days to keep chatbot_logs rows before chatbot:prune-logs deletes them.
    'log_retention_days' => (int) env('CHATBOT_LOG_RETENTION_DAYS', 90),
];
