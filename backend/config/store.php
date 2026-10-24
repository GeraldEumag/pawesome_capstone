<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Pawesome Retreat Inc. — Public Store Profile
    |--------------------------------------------------------------------------
    |
    | Ground-truth business facts injected into the chatbot's system prompt
    | and reused anywhere a customer-facing answer needs the store's public
    | details. Operating hours are NOT here — they are read live from the
    | store_* settings via App\Support\StoreHours.
    |
    */

    'name' => env('STORE_NAME', 'Pawesome Retreat Inc.'),
    'assistant_name' => env('STORE_ASSISTANT_NAME', 'Pawsitive'),

    'address' => env('STORE_ADDRESS', 'San Isidro Village, Aldana, Pamplona Uno, Las Piñas, 1740 Metro Manila'),

    'phone' => env('STORE_PHONE', '270020371'),
    'email' => env('STORE_EMAIL', 'pawesomeretreat24@gmail.com'),
    'facebook' => env('STORE_FACEBOOK', 'https://www.facebook.com/PawesomeRetreat'),
    'instagram' => env('STORE_INSTAGRAM', 'https://www.instagram.com/pawesomeretreat'),

    // Boarding drop-off/pick-up happens any time inside operating hours.
    'checkin_window' => env('STORE_CHECKIN_WINDOW', 'any time during operating hours'),

    // Cancellation policy shown to customers by the chatbot.
    'cancellation' => env('STORE_CANCELLATION', 'Free cancellation up to 24 hours before the check-in date or appointment time.'),

    'payment_methods' => 'GCash and Maya online (upload the payment receipt — it is scanned automatically), or cash at the counter for walk-in bookings',

    'vaccination_policy' => 'A vaccination card must be uploaded when booking boarding, and reception must verify it before the booking can be approved.',

];
