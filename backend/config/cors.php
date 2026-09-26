<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => array_filter(array_map('trim', explode(',', env(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://127.0.0.1:3000,http://127.0.0.1:5173,http://localhost:5173'
    )))),

    // Dev convenience: local origins on any port (e.g. browser-preview proxies
    // like http://127.0.0.1:56304) — never matches real deployed origins.
    'allowed_origins_patterns' => [
        '#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#',
    ],

    'allowed_headers' => ['Authorization', 'Content-Type', 'Accept', 'Origin', 'X-Requested-With', 'X-CSRF-TOKEN', 'X-Kiosk-Pin'],

    'supports_credentials' => env('CORS_SUPPORTS_CREDENTIALS', true),
];
