<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Chatbot\PremiumChatbotService;
use App\Services\Chatbot\RoleScopeService;
use App\Services\Chatbot\KnowledgeBaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TelegramBotController extends Controller
{
    private string $botToken;
    private string $apiUrl;
    private ?string $webhookSecret;

    private PremiumChatbotService $chatbotService;

    public function __construct(
        RoleScopeService $roleScopeService,
        KnowledgeBaseService $knowledgeBaseService,
    ) {
        $this->chatbotService = new PremiumChatbotService($roleScopeService, $knowledgeBaseService);
        $this->botToken = config('services.telegram.bot_token') ?? '';
        $this->apiUrl = $this->botToken !== ''
            ? "https://api.telegram.org/bot{$this->botToken}"
            : '';
        $this->webhookSecret = config('services.telegram.webhook_secret');
    }

    /**
     * Handle incoming webhook from Telegram
     * Supports optional secret token verification for security
     */
    public function webhook(Request $request): JsonResponse
    {
        // Webhook must authenticate whenever the bot is configured — otherwise
        // forged updates could invoke the bot under a linked user's identity.
        if ($this->botToken !== '' && empty($this->webhookSecret)) {
            Log::warning('Telegram webhook rejected: bot configured without webhook secret');
            return response()->json(['ok' => false, 'error' => 'Webhook not configured'], 503);
        }

        // Verify webhook secret token if configured
        if ($this->webhookSecret) {
            $headerToken = $request->header('X-Telegram-Bot-Api-Secret-Token');
            if (!hash_equals((string) $this->webhookSecret, (string) $headerToken)) {
                Log::warning('Telegram webhook rejected: invalid secret token', [
                    'ip' => $request->ip(),
                    'header_token' => $headerToken ? 'present' : 'missing',
                ]);
                return response()->json(['ok' => false, 'error' => 'Unauthorized'], 401);
            }
        }

        $update = $request->all();

        // Log for debugging (limit size)
        Log::info('Telegram webhook received', [
            'update_id' => $update['update_id'] ?? null,
            'type' => $this->getUpdateType($update),
        ]);

        // Check if it's a message or callback query
        if (isset($update['message'])) {
            $this->handleMessage($update['message']);
        } elseif (isset($update['callback_query'])) {
            $this->handleCallbackQuery($update['callback_query']);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Get the type of update for logging
     */
    private function getUpdateType(array $update): string
    {
        return match (true) {
            isset($update['message']) => 'message',
            isset($update['callback_query']) => 'callback_query',
            isset($update['edited_message']) => 'edited_message',
            isset($update['channel_post']) => 'channel_post',
            isset($update['my_chat_member']) => 'my_chat_member',
            default => 'unknown',
        };
    }

    /**
     * Handle text messages
     */
    private function handleMessage(array $message): void
    {
        $chatId = $message['chat']['id'];
        $text = $message['text'] ?? '';
        $from = $message['from'];

        // Find or create linked user
        $user = $this->findOrCreateUser($from, $chatId);

        // Handle commands
        if (str_starts_with($text, '/')) {
            $this->handleCommand($chatId, $text, $user);
            return;
        }

        // Regular message - use ChatbotService
        $response = $this->chatbotService->respond(
            $user,
            $text,
            'telegram'
        );

        $this->sendMessage($chatId, $response['reply'], $response['suggestions'] ?? []);
    }

    /**
     * Handle callback queries (inline button clicks)
     */
    private function handleCallbackQuery(array $callbackQuery): void
    {
        $chatId = $callbackQuery['message']['chat']['id'];
        $data = $callbackQuery['data'];
        $from = $callbackQuery['from'];

        // Acknowledge the callback
        $this->answerCallbackQuery($callbackQuery['id']);

        $user = User::where('telegram_chat_id', $chatId)->first();

        // Handle specific actions
        match ($data) {
            'book_hotel' => $this->sendHotelBookingFlow($chatId, $user),
            'view_appointments' => $this->sendAppointments($chatId, $user),
            'check_rooms' => $this->sendRoomAvailability($chatId),
            'help' => $this->sendHelp($chatId),
            default => $this->sendMessage($chatId, 'Action not recognized. Try /help'),
        };
    }

    /**
     * Handle bot commands
     */
    private function handleCommand(int $chatId, string $text, ?User $user): void
    {
        $command = explode(' ', $text)[0];

        match ($command) {
            '/start' => $this->handleStart($chatId, $user),
            '/help' => $this->sendHelp($chatId),
            '/book' => $this->sendHotelBookingFlow($chatId, $user),
            '/rooms' => $this->sendRoomAvailability($chatId),
            '/appointments' => $this->sendAppointments($chatId, $user),
            '/pets' => $this->sendPets($chatId, $user),
            '/link' => $this->sendLinkInstructions($chatId, $user),
            '/status' => $this->sendStatus($chatId, $user),
            default => $this->sendMessage($chatId, 'Unknown command. Try /help'),
        };
    }

    /**
     * Handle /start command
     */
    private function handleStart(int $chatId, ?User $user): void
    {
        if (!$user) {
            $message = "👋 Welcome to Pawsitive!\n\n" .
                "I'm your pet hotel assistant on Telegram.\n\n" .
                "🔗 To get started, please link your account:\n" .
                "1. Login to: " . rtrim((string) config('app.frontend_url'), '/') . "/dashboard\n" .
                    "2. Go to Profile → Link Telegram\n" .
                "3. Or use: /link <your_token>\n\n" .
                "Once linked, you can:\n" .
                "🏨 Book hotel stays\n" .
                "📅 Check appointments\n" .
                "🐾 View your pets\n\n" .
                "Try /help for all commands!";
        } else {
            $welcome = $this->chatbotService->welcome($user);
            $message = "👋 Welcome back, {$user->name}!\n\n" .
                $welcome['reply'] . "\n\n" .
                "What would you like to do?";
        }

        $keyboard = [
            [
                ['text' => '🏨 Book Hotel', 'callback_data' => 'book_hotel'],
                ['text' => '📅 Appointments', 'callback_data' => 'view_appointments'],
            ],
            [
                ['text' => '🏨 Check Rooms', 'callback_data' => 'check_rooms'],
                ['text' => '❓ Help', 'callback_data' => 'help'],
            ],
        ];

        $this->sendMessage($chatId, $message, [], $keyboard);
    }

    /**
     * Send help message
     */
    private function sendHelp(int $chatId): void
    {
        $message = "🐾 *Pawsitive Bot Commands*\n\n" .
            "*Booking & Services:*\n" .
            "/book - Book a hotel stay\n" .
            "/rooms - Check room availability\n" .
            "/appointments - View your appointments\n\n" .
            "*Your Account:*\n" .
            "/pets - List your pets\n" .
            "/status - Check your account status\n" .
            "/link - Link your Telegram to account\n\n" .
            "*General:*\n" .
            "/start - Welcome message\n" .
            "/help - Show this help\n\n" .
            "Or just chat with me naturally!";

        $this->sendMessage($chatId, $message, [], []);
    }

    /**
     * Send hotel booking flow
     */
    private function sendHotelBookingFlow(int $chatId, ?User $user): void
    {
        if (!$user) {
            $this->sendLinkRequired($chatId);
            return;
        }

        $response = $this->chatbotService->respond($user, 'hotel', 'telegram');

        $keyboard = [];
        if (isset($response['actions'])) {
            foreach ($response['actions'] as $action) {
                if ($action['type'] === 'workflow') {
                    $keyboard[] = [
                        ['text' => $action['label'], 'url' => config('app.frontend_url') . '/customer/pet-hotel']
                    ];
                }
            }
        }

        $this->sendMessage($chatId, $response['reply'], $response['suggestions'] ?? [], $keyboard);
    }

    /**
     * Send room availability
     */
    private function sendRoomAvailability(int $chatId): void
    {
        $rooms = \App\Models\HotelRoom::where('status', 'available')
            ->orderBy('daily_rate')
            ->get();

        if ($rooms->isEmpty()) {
            $this->sendMessage($chatId, "😔 No rooms available at the moment.");
            return;
        }

        $message = "🏨 *Available Rooms*\n\n";
        foreach ($rooms as $room) {
            $message .= "📍 Room {$room->room_number} ({$room->type})\n" .
                "   Size: {$room->size} | Capacity: {$room->capacity} pets\n" .
                "   Rate: ₱" . number_format($room->daily_rate, 2) . "/night\n\n";
        }

        $keyboard = [
            [['text' => '📅 Book Now', 'callback_data' => 'book_hotel']],
        ];

        $this->sendMessage($chatId, $message, [], $keyboard);
    }

    /**
     * Send user's appointments
     */
    private function sendAppointments(int $chatId, ?User $user): void
    {
        if (!$user) {
            $this->sendLinkRequired($chatId);
            return;
        }

        $customer = \App\Models\Customer::where('email', $user->email)->first();
        if (!$customer) {
            $this->sendMessage($chatId, "No customer profile found.");
            return;
        }

        $appointments = \App\Models\Appointment::where('customer_id', $customer->id)
            ->where('scheduled_at', '>=', now())
            ->orderBy('scheduled_at')
            ->take(5)
            ->get();

        if ($appointments->isEmpty()) {
            $this->sendMessage($chatId, "📅 No upcoming appointments.\n\nUse the web dashboard to book one!");
            return;
        }

        $message = "📅 *Your Upcoming Appointments*\n\n";
        foreach ($appointments as $apt) {
            $message .= "🐾 {$apt->pet?->name} - {$apt->service?->name}\n" .
                "📆 " . $apt->scheduled_at->format('M j, Y g:i A') . "\n" .
                "   Status: " . ucfirst($apt->status) . "\n\n";
        }

        $this->sendMessage($chatId, $message);
    }

    /**
     * Send user's pets
     */
    private function sendPets(int $chatId, ?User $user): void
    {
        if (!$user) {
            $this->sendLinkRequired($chatId);
            return;
        }

        $customer = \App\Models\Customer::where('email', $user->email)->first();
        if (!$customer) {
            $this->sendMessage($chatId, "No customer profile found.");
            return;
        }

        $pets = \App\Models\Pet::where('customer_id', $customer->id)->get();

        if ($pets->isEmpty()) {
            $this->sendMessage($chatId, "🐾 No pets registered yet.\n\nAdd your pets on the web dashboard!");
            return;
        }

        $message = "🐾 *Your Pets*\n\n";
        foreach ($pets as $pet) {
            $message .= "• {$pet->name} ({$pet->species}" .
                ($pet->breed ? " - {$pet->breed}" : "") . ")\n";
        }

        $this->sendMessage($chatId, $message);
    }

    /**
     * Send account status
     */
    private function sendStatus(int $chatId, ?User $user): void
    {
        if (!$user) {
            $this->sendLinkRequired($chatId);
            return;
        }

        $customer = \App\Models\Customer::where('email', $user->email)->first();

        $activeBookings = 0;
        if ($customer) {
            $activeBookings = \App\Models\Boarding::where('customer_id', $customer->id)
                ->where('status', 'checked_in')
                ->count();
        }

        $message = "👤 *Account Status*\n\n" .
            "Name: {$user->name}\n" .
            "Role: " . ucfirst($user->role) . "\n" .
            "📱 Telegram: Linked ✅\n\n";

        if ($customer) {
            $message .= "🏨 Active Boardings: {$activeBookings}\n";
        }

        $message .= "\n✅ Your account is active!";

        $this->sendMessage($chatId, $message);
    }

    /**
     * Send link instructions
     */
    private function sendLinkInstructions(int $chatId, ?User $user): void
    {
        if ($user) {
            $this->sendMessage($chatId, "✅ Your Telegram is already linked to account: {$user->email}");
            return;
        }

        $message = "🔗 *Link Your Account*\n\n" .
            "Option 1: Web Dashboard\n" .
            "1. Login: " . rtrim((string) config('app.frontend_url'), '/') . "/dashboard\n" .
            "2. Go to Profile → Link Telegram\n\n" .
            "Option 2: Token (coming soon)\n" .
            "Use: /link YOUR_TOKEN\n\n" .
            "Once linked, you'll receive notifications here!";

        $this->sendMessage($chatId, $message);
    }

    /**
     * Send "link required" message
     */
    private function sendLinkRequired(int $chatId): void
    {
        $message = "🔐 *Account Link Required*\n\n" .
            "Please link your Telegram to your Pawsitive account first.\n\n" .
            "Use /link for instructions.";

        $keyboard = [
            [['text' => '🔗 Link Account', 'callback_data' => 'link']],
        ];

        $this->sendMessage($chatId, $message, [], $keyboard);
    }

    /**
     * Find or create user based on Telegram info
     */
    private function findOrCreateUser(array $from, int $chatId): ?User
    {
        // First try to find by telegram_chat_id
        $user = User::where('telegram_chat_id', $chatId)->first();

        if ($user) {
            return $user;
        }

        // Try to find by username if provided
        if (isset($from['username'])) {
            // Could match by username if stored
        }

        // Return null - user needs to link account
        return null;
    }

    /**
     * Send message to Telegram
     */
    private function sendMessage(int $chatId, string $text, array $suggestions = [], array $keyboard = []): void
    {
        $params = [
            'chat_id' => $chatId,
            'text' => $text,
            'parse_mode' => 'Markdown',
        ];

        // Add inline keyboard if provided
        if (!empty($keyboard)) {
            $params['reply_markup'] = json_encode([
                'inline_keyboard' => $keyboard,
            ]);
        }
        // Add suggestion buttons (show them as reply keyboard)
        elseif (!empty($suggestions)) {
            $keyboardButtons = array_map(fn ($s) => ['text' => $s], $suggestions);
            $params['reply_markup'] = json_encode([
                'keyboard' => array_chunk($keyboardButtons, 2),
                'resize_keyboard' => true,
                'one_time_keyboard' => true,
            ]);
        }

        try {
            Http::post("{$this->apiUrl}/sendMessage", $params);
        } catch (\Exception $e) {
            Log::error('Telegram send message failed: ' . $e->getMessage());
        }
    }

    /**
     * Answer callback query
     */
    private function answerCallbackQuery(string $callbackQueryId): void
    {
        try {
            Http::post("{$this->apiUrl}/answerCallbackQuery", [
                'callback_query_id' => $callbackQueryId,
            ]);
        } catch (\Exception $e) {
            Log::error('Telegram answer callback failed: ' . $e->getMessage());
        }
    }

    /**
     * Set webhook URL with optional secret token
     */
    public function setWebhook(): JsonResponse
    {
        $webhookUrl = config('services.telegram.webhook_url');

        if (empty($webhookUrl)) {
            return response()->json([
                'error' => 'Webhook URL not configured. Set TELEGRAM_WEBHOOK_URL in .env',
            ], 400);
        }

        $params = ['url' => $webhookUrl];

        // Add secret token for webhook verification if configured
        if ($this->webhookSecret) {
            $params['secret_token'] = $this->webhookSecret;
        }

        try {
            $response = Http::post("{$this->apiUrl}/setWebhook", $params);
            $result = $response->json();

            return response()->json([
                'success' => $result['ok'] ?? false,
                'description' => $result['description'] ?? null,
                'webhook_url' => $webhookUrl,
                'secret_token_set' => !empty($this->webhookSecret),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get webhook info for debugging
     */
    public function getWebhookInfo(): JsonResponse
    {
        try {
            $response = Http::post("{$this->apiUrl}/getWebhookInfo");
            $result = $response->json();

            return response()->json([
                'success' => $result['ok'] ?? false,
                'result' => $result['result'] ?? null,
                'bot_configured' => !empty($this->botToken),
                'webhook_url_configured' => !empty(config('services.telegram.webhook_url')),
                'secret_token_configured' => !empty($this->webhookSecret),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Remove webhook
     */
    public function removeWebhook(): JsonResponse
    {
        try {
            $response = Http::post("{$this->apiUrl}/deleteWebhook");
            return response()->json($response->json());
        } catch (\Exception $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Send notification to specific user
     */
    public function notifyUser(int $userId, string $message): bool
    {
        $user = User::find($userId);

        if (!$user || !$user->telegram_chat_id) {
            return false;
        }

        $this->sendMessage($user->telegram_chat_id, $message);
        return true;
    }
}
