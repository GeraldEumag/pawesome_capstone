<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Receipt Scanner (GCash / Maya proof auto-read)
    |--------------------------------------------------------------------------
    |
    | Reads uploaded payment proofs and extracts the reference number plus
    | supporting fields for cashier verification. The 'chain' lists readers
    | in priority order: 'vision'/'openrouter' (OpenRouter, free models only),
    | 'gemini' (Google Gemini), 'ocr' (local Tesseract/pdftotext). First
    | success wins; e.g. 'vision,gemini,ocr' tries OpenRouter, then Gemini,
    | then local OCR. Set 'chain' to ['ocr'] for a fully local deployment, or
    | RECEIPT_SCANNER_ENABLED=false to keep the manual-only flow.
    |
    */

    'enabled' => env('RECEIPT_SCANNER_ENABLED', true),

    'chain' => array_values(array_filter(array_map(
        'trim',
        explode(',', env('RECEIPT_SCANNER_CHAIN', 'vision,ocr'))
    ))),

    'vision' => [
        'api_key' => env('OPENROUTER_API_KEY'),
        // Optional backup keys are tried in order after the primary key fails.
        'api_keys' => array_values(array_unique(array_filter(array_map('trim', array_merge(
            [(string) env('OPENROUTER_API_KEY', '')],
            explode(',', (string) env('OPENROUTER_API_KEYS', ''))
        ))))),
        'key_cache_ttl' => (int) env('RECEIPT_READER_KEY_CACHE_TTL', 3600),
        'model' => env('OPENROUTER_MODEL', 'openrouter/free'),
        // Optional comma-separated free-model fallbacks tried by OpenRouter in
        // order after OPENROUTER_MODEL fails. Paid entries are dropped.
        'models' => array_values(array_filter(array_map('trim',
            explode(',', (string) env('OPENROUTER_MODELS', ''))))),
        'base_url' => env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        'http_referer' => env('OPENROUTER_HTTP_REFERER', env('APP_URL', '')),
        'app_name' => env('OPENROUTER_APP_NAME', env('APP_NAME', 'Pawesome')),
        'timeout' => (int) env('RECEIPT_READER_TIMEOUT', 30),
        'max_tokens' => (int) env('RECEIPT_READER_MAX_TOKENS', 1200),
        // Extra attempts per key on overload/rate-limit (429, 5xx) or transport errors.
        'retries' => (int) env('RECEIPT_READER_RETRIES', 2),
    ],

    // Google Gemini alternative — enable via RECEIPT_SCANNER_CHAIN=gemini(,ocr).
    'gemini' => [
        'api_key' => env('RECEIPT_READER_API_KEY', env('CHATBOT_AI_API_KEY')),
        'api_keys' => array_values(array_unique(array_filter(array_map('trim', array_merge(
            [(string) env('RECEIPT_READER_API_KEY', env('CHATBOT_AI_API_KEY'))],
            explode(',', (string) env('RECEIPT_READER_API_KEYS', ''))
        ))))),
        'key_cache_ttl' => (int) env('RECEIPT_READER_KEY_CACHE_TTL', 3600),
        'model' => env('RECEIPT_READER_MODEL', env('CHATBOT_AI_MODEL', 'gemini-3.6-flash')),
        'base_url' => env('RECEIPT_READER_BASE_URL', env('CHATBOT_AI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')),
        'timeout' => (int) env('RECEIPT_READER_TIMEOUT', 30),
        'max_tokens' => (int) env('RECEIPT_READER_MAX_TOKENS', 1200),
        'retries' => (int) env('RECEIPT_READER_RETRIES', 2),
    ],

    'ocr' => [
        'tesseract_path' => env('OCR_TESSERACT_PATH', ''),
        'pdftotext_path' => env('OCR_PDFTOTEXT_PATH', 'pdftotext'),
        'psm' => (int) env('OCR_TESSERACT_PSM', 6),
        'timeout' => (int) env('OCR_TIMEOUT', 60),
    ],

    /*
    |--------------------------------------------------------------------------
    | Validation thresholds (starting values — tune from receipt-metrics)
    |--------------------------------------------------------------------------
    */

    'thresholds' => [
        // Confidence needed for the reference to show 'green' to the cashier.
        'green' => (float) env('RECEIPT_CONFIDENCE_GREEN', 0.90),
        // Below this the read is treated as unusable → manual entry.
        'review' => (float) env('RECEIPT_CONFIDENCE_REVIEW', 0.70),
    ],

    // Receipt paid_at must fall within this many days of the payable's
    // creation (and never in the future).
    'date_window_days' => (int) env('RECEIPT_DATE_WINDOW_DAYS', 7),

    // Max receipts a single payable may accumulate before uploads are refused.
    'max_uploads_per_payable' => (int) env('RECEIPT_MAX_UPLOADS_PER_PAYABLE', 15),

    // dHash hamming distance at/below which two images are "similar".
    'phash_max_distance' => (int) env('RECEIPT_PHASH_MAX_DISTANCE', 6),

    // Reader/prompt version stamped on every extraction row so accuracy can
    // be compared across prompt or model changes.
    'reader_version' => env('RECEIPT_READER_VERSION', 'v1'),

];
