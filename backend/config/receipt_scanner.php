<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Receipt Scanner (GCash / Maya proof auto-read)
    |--------------------------------------------------------------------------
    |
    | Reads uploaded payment proofs and extracts the reference number plus
    | supporting fields for cashier verification. The 'chain' lists readers
    | in priority order — 'vision' (Gemini) first, 'ocr' (local Tesseract /
    | pdftotext) as the offline fallback when the AI service is down or
    | disabled. Set 'chain' to ['ocr'] for a fully local deployment, or set
    | RECEIPT_SCANNER_ENABLED=false to keep the manual-only flow.
    |
    */

    'enabled' => env('RECEIPT_SCANNER_ENABLED', true),

    'chain' => array_values(array_filter(array_map(
        'trim',
        explode(',', env('RECEIPT_SCANNER_CHAIN', 'vision,ocr'))
    ))),

    'vision' => [
        'api_key' => env('RECEIPT_READER_API_KEY', env('CHATBOT_AI_API_KEY')),
        // Key pool — comma-separated backups tried in order when a key fails
        // (quota, revoked, expired). RECEIPT_READER_API_KEY is treated as the
        // first entry, so a single-key .env keeps working unchanged.
        'api_keys' => array_values(array_unique(array_filter(array_map('trim', array_merge(
            [(string) env('RECEIPT_READER_API_KEY', env('CHATBOT_AI_API_KEY'))],
            explode(',', (string) env('RECEIPT_READER_API_KEYS', ''))
        ))))),
        // Seconds to remember the last working key index so every scan
        // doesn't re-hit a dead key first.
        'key_cache_ttl' => (int) env('RECEIPT_READER_KEY_CACHE_TTL', 3600),
        'model' => env('RECEIPT_READER_MODEL', env('CHATBOT_AI_MODEL', 'gemini-3.6-flash')),
        'base_url' => env('RECEIPT_READER_BASE_URL', env('CHATBOT_AI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')),
        'timeout' => (int) env('RECEIPT_READER_TIMEOUT', 30),
        'max_tokens' => (int) env('RECEIPT_READER_MAX_TOKENS', 1200),
        // Extra attempts per key on overload/rate-limit (429, 5xx) or transport errors.
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
