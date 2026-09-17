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
    // Get your free Gemini API key from: https://ai.google.dev
    'ai_enabled' => env('CHATBOT_AI_ENABLED', false),

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
];
