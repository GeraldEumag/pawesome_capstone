<?php

namespace App\Services\Chatbot;

use App\Models\Appointment;
use App\Models\ChatbotFaq;
use App\Models\ChatbotLog;
use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\Sale;
use App\Models\Service;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

class ChatbotService
{
    private AiChatbotService $aiService;
    private ?User $currentUser = null;

    public function __construct(
        private readonly RoleScopeService $roleScopeService,
        private readonly KnowledgeBaseService $knowledgeBaseService,
    ) {
        $this->aiService = new AiChatbotService();
    }

    public function welcome(?User $user): array
    {
        $config = $this->roleScopeService->getRoleConfig($user);
        $role = $this->roleScopeService->normalizeRole($user?->role);

        return [
            'message' => sprintf('Hello %s. %s', $config['label'], $config['welcome']),
            'intent' => 'welcome',
            'role' => $role,
            'scope' => $config['scope'],
            'suggestions' => $config['suggestions'],
        ];
    }

    public function respond(?User $user, string $message, string $channel = 'web'): array
    {
        $this->currentUser = $user;
        $role = $this->roleScopeService->normalizeRole($user?->role);
        $config = $this->roleScopeService->getRoleConfig($user);
        $intent = $this->detectIntent($message);
        $faqResponse = $this->faqResponse($message, $role);

        // HYBRID LOGIC: Determine response source
        if ($faqResponse && config('chatbot.hybrid_mode') === 'faq_first') {
            // Use FAQ if available
            $intent = 'faq';
            $response = $faqResponse;
        } elseif ($this->shouldUseAi($intent)) {
            // Use AI for eligible intents
            $response = $this->aiResponse($message, $role, $intent);
            $intent = $response['intent'] ?? $intent;
        } else {
            // Use rule-based for critical actions
            $response = match ($intent) {
                'hotel_booking' => $this->hotelBookingResponse($role),
                'booking_help' => $this->bookingResponse($role),
                'pricing' => $this->pricingResponse($role),
                'services' => $this->servicesResponse($role),
                'summary' => $this->summaryResponse($role),
                'navigation' => $this->navigationResponse($role),
                'logs' => $this->logsResponse($role),
                'role_help' => $this->roleHelpResponse($role, $config),
                'support' => $this->supportResponse($role),
                default => $this->aiResponse($message, $role, $intent), // Fallback to AI
            };
        }

        $log = ChatbotLog::create([
            'user_id' => $user?->id,
            'role' => $role,
            'channel' => $channel,
            'type' => $this->mapIntentToType($intent),
            'intent' => $intent,
            'scope' => $config['scope'],
            'message' => $message,
            'response' => $response['message'],
            'user_message' => $message,
            'bot_response' => $response['message'],
            'metadata' => [
                'suggestions' => $response['suggestions'] ?? [],
                'actions' => $response['actions'] ?? [],
                'source' => $response['source'] ?? 'rule_based',
            ],
        ]);

        return [
            'id' => $log->id,
            'reply' => $response['message'],
            'intent' => $intent,
            'role' => $role,
            'scope' => $config['scope'],
            'suggestions' => $response['suggestions'] ?? [],
            'actions' => $response['actions'] ?? [],
            'source' => $response['source'] ?? 'rule_based',
            'confidence' => $response['confidence'] ?? 1.0,
            'rich_content' => $response['rich_content'] ?? null,
            'metadata' => [
                'processing_time_ms' => defined('LARAVEL_START') 
                    ? round((microtime(true) - LARAVEL_START) * 1000, 2)
                    : 0,
                'context_used' => !empty($this->gatherLiveContext()),
                'ai_model' => $this->aiService->isEnabled() ? config('chatbot.ai_model') : null,
                'channel' => $channel,
                'requires_follow_up' => $response['requires_follow_up'] ?? false,
            ],
        ];
    }

    private function detectIntent(string $message): string
    {
        $normalized = strtolower($message);

        return match (true) {
            str_contains($normalized, 'summary') || str_contains($normalized, 'overview') || str_contains($normalized, 'stats') || str_contains($normalized, 'status') || str_contains($normalized, 'how many') || str_contains($normalized, 'revenue') || str_contains($normalized, 'low stock') || str_contains($normalized, 'appointments today') => 'summary',
            str_contains($normalized, 'hotel') || str_contains($normalized, 'pet hotel') || str_contains($normalized, 'boarding') || str_contains($normalized, 'room') || str_contains($normalized, 'stay') => 'hotel_booking',
            str_contains($normalized, 'book') || str_contains($normalized, 'appointment') || str_contains($normalized, 'schedule') => 'booking_help',
            str_contains($normalized, 'price') || str_contains($normalized, 'cost') || str_contains($normalized, 'rate') || str_contains($normalized, 'fee') => 'pricing',
            str_contains($normalized, 'service') || str_contains($normalized, 'groom') || str_contains($normalized, 'vet') || str_contains($normalized, 'boarding') => 'services',
            str_contains($normalized, 'where') || str_contains($normalized, 'navigate') || str_contains($normalized, 'dashboard') || str_contains($normalized, 'shortcut') => 'navigation',
            str_contains($normalized, 'log') || str_contains($normalized, 'chat history') || str_contains($normalized, 'analytics') => 'logs',
            str_contains($normalized, 'role') || str_contains($normalized, 'permission') || str_contains($normalized, 'what can i do') => 'role_help',
            str_contains($normalized, 'help') || str_contains($normalized, 'support') || str_contains($normalized, 'contact') => 'support',
            default => 'general',
        };
    }

    private function bookingResponse(string $role): array
    {
        $messages = [
            'customer' => 'I can guide you to customer bookings, pets, and appointment tools. Use the bookings page for confirmed scheduling and the chatbot for quick guidance.',
            'receptionist' => 'Receptionists can manage appointments, check-ins, hotel bookings, and customer inquiries. Start from the bookings or appointments pages for operational work.',
            'veterinary' => 'Veterinary staff can use the appointments and patient views for clinical scheduling. The chatbot is best used for navigation and workflow prompts.',
        ];

        return [
            'message' => $messages[$role] ?? 'Booking guidance is available through the role-specific booking and appointment modules in your dashboard.',
            'suggestions' => [
                'Show dashboard shortcuts',
                'What services are available?',
                'How do I contact support?',
            ],
            'actions' => $this->bookingActions($role),
        ];
    }

    private function hotelBookingResponse(string $role): array
    {
        // Get available rooms for quick info
        $availableRooms = HotelRoom::where('status', 'available')
            ->orderBy('daily_rate')
            ->limit(5)
            ->get(['room_number', 'type', 'size', 'daily_rate', 'capacity', 'amenities']);

        // Get occupancy stats
        $totalRooms = HotelRoom::count();
        $occupiedRooms = HotelRoom::where('status', 'occupied')->count();
        $occupancyRate = $totalRooms > 0 ? round(($occupiedRooms / $totalRooms) * 100) : 0;

        // Get current boarders count
        $activeBoarders = \App\Models\Boarding::where('status', 'checked_in')->count();

        // Build rich room list
        $roomList = [];
        foreach ($availableRooms as $room) {
            $roomList[] = [
                'room_number' => $room->room_number,
                'type' => $room->type,
                'size' => $room->size,
                'rate' => $room->daily_rate,
                'capacity' => $room->capacity,
                'amenities' => $room->amenities,
            ];
        }

        // Format room info for text
        $roomInfo = $availableRooms->isNotEmpty()
            ? $availableRooms->map(fn ($room) => "• {$room->type} (Room {$room->room_number}): ₱" . number_format($room->daily_rate, 2) . "/night - fits {$room->capacity} pets")
                ->implode("\n")
            : '❌ No rooms currently available. Please check back later.';

        $messages = [
            'customer' => "🏨 **Pet Hotel Booking**\n\n" .
                "We have **{$availableRooms->count()} rooms** available right now!\n\n" .
                "**Available Rooms:**\n{$roomInfo}\n\n" .
                "Our hotel is currently at **{$occupancyRate}% occupancy** with **{$activeBoarders} pets** enjoying their stay.\n\n" .
                "Would you like to check availability for your dates or view pricing?",

            'receptionist' => "🏨 **Hotel Status**\n\n" .
                "**Available Rooms:** {$availableRooms->count()}\n" .
                "**Occupancy Rate:** {$occupancyRate}%\n" .
                "**Current Boarders:** {$activeBoarders} pets\n\n" .
                "**Available Room Details:**\n{$roomInfo}\n\n" .
                "Manage check-ins, check-outs, and reservations from the Hotel Bookings page.",

            'manager' => "📊 **Hotel Summary**\n\n" .
                "**Current Status:**\n" .
                "• Available Rooms: {$availableRooms->count()}\n" .
                "• Occupied: {$occupiedRooms}\n" .
                "• Occupancy Rate: {$occupancyRate}%\n" .
                "• Active Boarders: {$activeBoarders} pets\n\n" .
                "View detailed occupancy and revenue stats on your dashboard.",

            'veterinary' => "🏥 **Boarding Overview**\n\n" .
                "**Current Boarders:** {$activeBoarders} pets in-house\n" .
                "**Available for Admission:** {$availableRooms->count()} rooms\n" .
                "**Hotel Occupancy:** {$occupancyRate}%\n\n" .
                "Review current boarders and their medical needs on your dashboard.",
        ];

        $actions = match ($role) {
            'customer' => [
                ['label' => '🔍 Check Availability', 'type' => 'workflow', 'workflow' => 'hotel_booking'],
                ['label' => '👁️ View Rooms', 'path' => '/customer/pet-hotel'],
                ['label' => '📅 My Bookings', 'path' => '/customer/bookings'],
            ],
            'receptionist' => [
                ['label' => '📋 Hotel Bookings', 'path' => '/receptionist/hotel-bookings'],
                ['label' => '➕ New Reservation', 'type' => 'workflow', 'workflow' => 'hotel_booking'],
                ['label' => '✅ Check-in/Out', 'path' => '/receptionist/hotel-bookings'],
            ],
            'manager' => [
                ['label' => '📊 Dashboard', 'path' => '/manager'],
                ['label' => '📈 Occupancy Report', 'path' => '/manager/reports'],
            ],
            'veterinary' => [
                ['label' => '🐾 Current Boarders', 'path' => '/veterinary/boardings'],
                ['label' => '📋 Medical Records', 'path' => '/veterinary/records'],
            ],
            default => [],
        };

        $richContent = [
            'type' => 'hotel_summary',
            'stats' => [
                'available_rooms' => $availableRooms->count(),
                'occupied_rooms' => $occupiedRooms,
                'occupancy_rate' => $occupancyRate,
                'active_boarders' => $activeBoarders,
                'total_rooms' => $totalRooms,
            ],
            'rooms' => $roomList,
            'occupancy_trend' => $occupancyRate > 80 ? 'high' : ($occupancyRate > 50 ? 'medium' : 'low'),
        ];

        return [
            'message' => $messages[$role] ?? "🏨 Pet Hotel services are available.\n\n**Available Rooms:**\n{$roomInfo}",
            'suggestions' => [
                'Check room availability',
                'What are the hotel rates?',
                'Book a hotel stay',
                'How many pets can stay?',
            ],
            'actions' => $actions,
            'rich_content' => $richContent,
            'source' => 'rule_based',
            'confidence' => 1.0,
        ];
    }

    private function pricingResponse(string $role): array
    {
        $services = Service::query()
            ->orderBy('name')
            ->limit(6)
            ->get(['name', 'price']);

        if ($services->isEmpty()) {
            return [
                'message' => 'I could not find active service prices yet. Once service records are populated, I will answer with live backend pricing instead of static text.',
                'suggestions' => [
                    'Show services',
                    'Help me with bookings',
                    'Show dashboard summary',
                ],
            ];
        }

        $pricingText = $services
            ->map(fn (Service $service) => "{$service->name}: $" . number_format((float) $service->price, 2))
            ->implode(', ');

        return [
            'message' => "Current service pricing from the backend is {$pricingText}.",
            'suggestions' => [
                'Show services',
                'Help me with bookings',
                'Show dashboard summary',
            ],
            'actions' => [
                ['label' => 'Open services', 'path' => $role === 'customer' ? '/customer/bookings' : $this->basePathForRole($role)],
                ['label' => 'Look up appointments', 'type' => 'workflow', 'workflow' => 'appointment_lookup'],
            ],
        ];
    }

    private function servicesResponse(string $role): array
    {
        $services = Service::query()
            ->orderBy('name')
            ->limit(8)
            ->get(['name', 'description', 'price']);

        if ($services->isNotEmpty()) {
            $catalog = $services
                ->map(function (Service $service) {
                    $description = $service->description ?: 'Service available in the system';

                    return "{$service->name} ($" . number_format((float) $service->price, 2) . "): {$description}";
                })
                ->implode(' ');
        } else {
            $catalog = collect($this->knowledgeBaseService->serviceCatalog())
                ->map(fn (array $item) => "{$item['title']}: {$item['description']}")
                ->implode(' ');
        }

        return [
            'message' => "Available service areas include {$catalog}",
            'suggestions' => [
                'Book an appointment',
                'Show service prices',
                'Show dashboard summary',
            ],
            'actions' => [
                ['label' => 'Open dashboard home', 'path' => $this->basePathForRole($role)],
                ['label' => 'Create booking', 'type' => 'workflow', 'workflow' => 'create_booking'],
            ],
        ];
    }

    private function summaryResponse(string $role): array
    {
        $today = Carbon::today();

        return match ($role) {
            'admin' => [
                'message' => sprintf(
                    'Admin summary: %d total users, %d active users, %d customers, %d appointments today, $%s revenue today, and %d low-stock items.',
                    User::count(),
                    User::where('is_active', true)->count(),
                    Customer::count(),
                    Appointment::whereDate('scheduled_at', $today)->count(),
                    number_format((float) Sale::whereDate('created_at', $today)->sum('amount'), 2),
                    InventoryItem::whereColumn('stock', '<=', 'reorder_level')->count(),
                ),
                'suggestions' => [
                    'Show chatbot log summary',
                    'Help me navigate reports',
                    'Show service prices',
                ],
                'actions' => [
                    ['label' => 'Open admin reports', 'path' => '/admin/reports'],
                    ['label' => 'Search inventory', 'type' => 'workflow', 'workflow' => 'inventory_search'],
                ],
            ],
            'manager' => [
                'message' => sprintf(
                    'Manager summary: %d staff accounts, %d active staff, %d appointments today, %d completed appointments, and $%s revenue this month.',
                    User::whereIn('role', ['receptionist', 'veterinary', 'vet_tech', 'inventory', 'cashier'])->count(),
                    User::whereIn('role', ['receptionist', 'veterinary', 'vet_tech', 'inventory', 'cashier'])->where('is_active', true)->count(),
                    Appointment::whereDate('scheduled_at', $today)->count(),
                    Appointment::where('status', 'completed')->count(),
                    number_format((float) Sale::whereMonth('created_at', $today->month)->sum('amount'), 2),
                ),
                'suggestions' => [
                    'Give me manager shortcuts',
                    'Help me navigate staff reports',
                    'Show services',
                ],
                'actions' => [
                    ['label' => 'Open manager reports', 'path' => '/manager/reports'],
                    ['label' => 'Search inventory', 'type' => 'workflow', 'workflow' => 'inventory_search'],
                ],
            ],
            'receptionist' => [
                'message' => sprintf(
                    'Reception summary: %d appointments today, %d pending appointments, %d confirmed appointments, %d total customers, and %d pets in the system.',
                    Appointment::whereDate('scheduled_at', $today)->count(),
                    Appointment::where('status', 'scheduled')->count(),
                    Appointment::where('status', 'confirmed')->count(),
                    Customer::count(),
                    Pet::count(),
                ),
                'suggestions' => [
                    'Help me with bookings',
                    'What can I answer for customers?',
                    'Show service prices',
                ],
                'actions' => [
                    ['label' => 'Open appointments', 'path' => '/receptionist/appointments'],
                    ['label' => 'Look up appointments', 'type' => 'workflow', 'workflow' => 'appointment_lookup'],
                ],
            ],
            'veterinary' => [
                'message' => sprintf(
                    'Veterinary summary: %d appointments today, %d pending appointments, %d completed appointments, and %d patient records.',
                    Appointment::whereDate('scheduled_at', $today)->count(),
                    Appointment::where('status', 'scheduled')->count(),
                    Appointment::where('status', 'completed')->count(),
                    Pet::count(),
                ),
                'suggestions' => [
                    'Show veterinary shortcuts',
                    'Help me navigate appointments',
                    'Show services',
                ],
                'actions' => [
                    ['label' => 'Open vet appointments', 'path' => '/veterinary/appointments'],
                    ['label' => 'Look up appointments', 'type' => 'workflow', 'workflow' => 'appointment_lookup'],
                ],
            ],
            'cashier' => [
                'message' => sprintf(
                    'Cashier summary: $%s sales today from %d transactions, $%s sales this month, and %d pending payment-related appointments.',
                    number_format((float) Sale::whereDate('created_at', $today)->sum('amount'), 2),
                    Sale::whereDate('created_at', $today)->count(),
                    number_format((float) Sale::whereMonth('created_at', $today->month)->sum('amount'), 2),
                    Appointment::where('status', 'confirmed')->count(),
                ),
                'suggestions' => [
                    'Show cashier shortcuts',
                    'Help me find transactions',
                    'Show service prices',
                ],
                'actions' => [
                    ['label' => 'Open transactions', 'path' => '/cashier/transactions'],
                    ['label' => 'Look up appointments', 'type' => 'workflow', 'workflow' => 'appointment_lookup'],
                ],
            ],
            'inventory' => [
                'message' => sprintf(
                    'Inventory summary: %d total items, %d low-stock items, %d out-of-stock items, and stock value of $%s.',
                    InventoryItem::count(),
                    InventoryItem::whereColumn('stock', '<=', 'reorder_level')->count(),
                    InventoryItem::where('stock', 0)->count(),
                    number_format((float) (InventoryItem::selectRaw('COALESCE(SUM(stock * price), 0) as total')->value('total') ?? 0), 2),
                ),
                'suggestions' => [
                    'Show inventory shortcuts',
                    'How do I monitor low stock?',
                    'Show dashboard summary',
                ],
                'actions' => [
                    ['label' => 'Open stock page', 'path' => '/inventory/stock'],
                    ['label' => 'Search inventory', 'type' => 'workflow', 'workflow' => 'inventory_search'],
                ],
            ],
            'customer' => [
                'message' => sprintf(
                    'Customer summary: there are %d service offerings, %d available pet records in the system, and I can guide you to bookings, pets, payments, and support.',
                    Service::count(),
                    Pet::count(),
                ),
                'suggestions' => [
                    'Book an appointment',
                    'Show service prices',
                    'What are your hours?',
                ],
                'actions' => [
                    ['label' => 'Open my bookings', 'path' => '/customer/bookings'],
                    ['label' => 'Create booking', 'type' => 'workflow', 'workflow' => 'create_booking'],
                    ['label' => 'Look up appointments', 'type' => 'workflow', 'workflow' => 'appointment_lookup'],
                ],
            ],
            default => [
                'message' => 'I can provide live system summaries once you are authenticated into a role-based dashboard.',
                'suggestions' => [
                    'What can you help with?',
                    'Show me available services',
                    'How do I contact support?',
                ],
            ],
        };
    }

    private function navigationResponse(string $role): array
    {
        $destinations = [
            'admin' => ['Users' => '/admin/users', 'Reports' => '/admin/reports', 'Chatbot Logs' => '/admin/chatbot'],
            'manager' => ['Overview' => '/manager', 'Reports' => '/manager/reports', 'Staff' => '/manager/staff'],
            'receptionist' => ['Appointments' => '/receptionist/appointments', 'Bookings' => '/receptionist/bookings', 'Customers' => '/receptionist/customers'],
            'veterinary' => ['Appointments' => '/veterinary/appointments', 'History' => '/veterinary/history', 'Profile' => '/veterinary/profile'],
            'cashier' => ['Transactions' => '/cashier/transactions', 'Reports' => '/cashier/reports', 'POS' => '/cashier/pos'],
            'inventory' => ['Products' => '/inventory/products', 'Stock' => '/inventory/stock', 'Reports' => '/inventory/reports'],
            'customer' => ['Bookings' => '/customer/bookings', 'Pets' => '/customer/pets', 'Store' => '/customer/store'],
        ];

        $items = collect($destinations[$role] ?? ['Dashboard' => $this->basePathForRole($role)])
            ->map(fn (string $path, string $label) => "{$label} ({$path})")
            ->implode(', ');

        return [
            'message' => "Here are useful {$role} routes: {$items}.",
            'suggestions' => [
                'What can I do in my role?',
                'Help me with bookings',
                'Show service areas',
            ],
        ];
    }

    private function logsResponse(string $role): array
    {
        if ($role !== 'admin') {
            return [
                'message' => 'Chatbot logs and analytics are restricted to admins, but your conversations are still being tracked for support and reporting.',
                'suggestions' => [
                    'What can I do in my role?',
                    'Help me navigate',
                    'Contact support',
                ],
            ];
        }

        return [
            'message' => 'Admins can review chatbot summaries, per-user conversations, and unanswered usage patterns from the Chatbot Logs dashboard.',
            'suggestions' => [
                'Show chatbot log summary',
                'Help me navigate reports',
                'What can admins do with the chatbot?',
            ],
            'actions' => [
                ['label' => 'Open chatbot logs', 'path' => '/admin/chatbot'],
            ],
        ];
    }

    private function roleHelpResponse(string $role, array $config): array
    {
        return [
            'message' => sprintf(
                'Your current role is %s. The chatbot scope for this role is %s and it focuses on %s',
                $config['label'],
                $config['scope'],
                $config['welcome']
            ),
            'suggestions' => $config['suggestions'],
            'actions' => [
                ['label' => 'Open dashboard', 'path' => $this->basePathForRole($role)],
            ],
        ];
    }

    private function supportResponse(string $role): array
    {
        $faq = $this->knowledgeBaseService->faq();

        return [
            'message' => "{$faq['contact']} {$faq['booking']}",
            'suggestions' => [
                'Show dashboard shortcuts',
                'Book an appointment',
                'Show dashboard summary',
            ],
            'actions' => [
                ['label' => 'Open profile', 'path' => $this->routeForRole($role, 'profile')],
                ['label' => 'Look up appointments', 'type' => 'workflow', 'workflow' => 'appointment_lookup'],
            ],
        ];
    }

    private function generalResponse(string $role, array $config): array
    {
        return [
            'message' => "I am your shared {$config['label']} assistant. {$config['welcome']}",
            'suggestions' => $config['suggestions'],
            'actions' => [
                ['label' => 'Open dashboard', 'path' => $this->basePathForRole($role)],
                ...$this->generalActions($role),
            ],
        ];
    }

    private function faqResponse(string $message, string $role): ?array
    {
        $normalized = strtolower($message);
        $faqs = ChatbotFaq::query()
            ->where('is_active', true)
            ->whereIn('scope', ['general', $role])
            ->orderBy('sort_order')
            ->get();

        foreach ($faqs as $faq) {
            $question = strtolower($faq->question);
            $keywords = collect($faq->keywords ?? [])->map(fn ($keyword) => strtolower($keyword));
            $matchesQuestion = str_contains($normalized, $question) || str_contains($question, $normalized);
            $matchesKeyword = $keywords->contains(fn ($keyword) => $keyword !== '' && str_contains($normalized, $keyword));

            if ($matchesQuestion || $matchesKeyword) {
                return [
                    'message' => $faq->answer,
                    'suggestions' => [
                        'Show dashboard summary',
                        'Help me navigate',
                        'What services are available?',
                    ],
                ];
            }
        }

        return null;
    }

    private function bookingActions(string $role): array
    {
        $actions = [
            ['label' => 'Open bookings', 'path' => $this->routeForRole($role, 'bookings')],
            ['label' => 'Look up appointments', 'type' => 'workflow', 'workflow' => 'appointment_lookup'],
        ];

        if ($role === 'customer') {
            $actions[] = ['label' => 'Create booking', 'type' => 'workflow', 'workflow' => 'create_booking'];
        }

        return $actions;
    }

    private function generalActions(string $role): array
    {
        return match ($role) {
            'customer' => [
                ['label' => 'Create booking', 'type' => 'workflow', 'workflow' => 'create_booking'],
                ['label' => 'Look up appointments', 'type' => 'workflow', 'workflow' => 'appointment_lookup'],
            ],
            'admin', 'inventory', 'manager' => [
                ['label' => 'Search inventory', 'type' => 'workflow', 'workflow' => 'inventory_search'],
            ],
            default => [
                ['label' => 'Look up appointments', 'type' => 'workflow', 'workflow' => 'appointment_lookup'],
            ],
        };
    }

    private function mapIntentToType(string $intent): string
    {
        return match ($intent) {
            'booking_help' => 'booking',
            default => 'general',
        };
    }

    private function basePathForRole(string $role): string
    {
        return match ($role) {
            'admin' => '/admin',
            'manager' => '/manager',
            'receptionist' => '/receptionist',
            'veterinary' => '/veterinary',
            'cashier' => '/cashier',
            'inventory' => '/inventory',
            'customer' => '/customer',
            default => '/dashboard',
        };
    }

    private function routeForRole(string $role, string $section): string
    {
        $routes = [
            'admin' => [
                'profile' => '/admin/profile',
                'bookings' => '/admin',
            ],
            'manager' => [
                'profile' => '/manager/profile',
                'bookings' => '/manager',
            ],
            'receptionist' => [
                'profile' => '/receptionist/profile',
                'bookings' => '/receptionist/bookings',
            ],
            'veterinary' => [
                'profile' => '/veterinary/profile',
                'bookings' => '/veterinary/appointments',
            ],
            'cashier' => [
                'profile' => '/cashier/profile',
                'bookings' => '/cashier/transactions',
            ],
            'inventory' => [
                'profile' => '/inventory/profile',
                'bookings' => '/inventory/stock',
            ],
            'customer' => [
                'profile' => '/customer/profile',
                'bookings' => '/customer/bookings',
            ],
        ];

        return $routes[$role][$section] ?? $this->basePathForRole($role);
    }

    /**
     * Determine if this intent should use AI response
     */
    private function shouldUseAi(string $intent): bool
    {
        // If AI is not enabled, never use it
        if (!$this->aiService->isEnabled()) {
            return false;
        }

        // Critical actions always use rule-based
        if (in_array($intent, config('chatbot.rule_based_intents', []), true)) {
            return false;
        }

        // AI-eligible intents
        if (in_array($intent, config('chatbot.ai_eligible_intents', []), true)) {
            return true;
        }

        // For unknown intents, check config
        return config('chatbot.ai_for_unknown_intents', true);
    }

    /**
     * Generate AI-powered response with live context
     */
    private function aiResponse(string $message, string $role, string $intent): array
    {
        // Gather live context for AI
        $context = $this->gatherLiveContext();

        // Try AI first
        $aiResponse = $this->aiService->generateResponse($message, $role, $context, $this->knowledgeBaseService->historyFor($this->currentUser));

        if ($aiResponse) {
            return array_merge($aiResponse, [
                'intent' => $intent,
                'actions' => [],
            ]);
        }

        // Fallback to rule-based general response if AI fails
        $config = $this->roleScopeService->getRoleConfig(null);
        return $this->generalResponse($role, $config);
    }

    /**
     * Gather live system data for AI context - MAXIMUM CAPABILITY VERSION
     */
    private function gatherLiveContext(): array
    {
        $context = [];

        try {
            // ========== HOTEL & BOARDING ==========
            // Available rooms with details
            $availableRooms = HotelRoom::where('status', 'available')
                ->select('room_number', 'type', 'size', 'daily_rate', 'capacity', 'features')
                ->orderBy('daily_rate')
                ->take(10)
                ->get();

            $context['hotel'] = [
                'rooms_available_count' => $availableRooms->count(),
                'rooms_available_details' => $availableRooms->map(fn($r) => [
                    'room' => $r->room_number,
                    'type' => $r->type,
                    'size' => $r->size,
                    'rate' => '₱' . number_format($r->daily_rate, 2),
                    'capacity' => $r->capacity,
                    'features' => $r->features,
                ])->toArray(),
                'rooms_occupied' => HotelRoom::where('status', 'occupied')->count(),
                'rooms_maintenance' => HotelRoom::where('status', 'maintenance')->count(),
                'total_rooms' => HotelRoom::count(),
                'occupancy_rate' => round((HotelRoom::where('status', 'occupied')->count() / max(HotelRoom::count(), 1)) * 100, 1) . '%',
            ];

            // Current boarders with pet details
            $activeBoarders = \App\Models\Boarding::with(['pet', 'customer', 'room'])
                ->where('status', 'checked_in')
                ->orderBy('check_in_date')
                ->take(10)
                ->get();

            $context['current_boarders'] = [
                'count' => $activeBoarders->count(),
                'boarders' => $activeBoarders->map(fn($b) => [
                    'pet_name' => $b->pet?->name,
                    'pet_species' => $b->pet?->species,
                    'customer' => $b->customer?->first_name . ' ' . $b->customer?->last_name,
                    'room' => $b->room?->room_number,
                    'check_in' => $b->check_in_date?->format('M j, Y'),
                    'check_out' => $b->check_out_date?->format('M j, Y'),
                    'nights' => $b->check_in_date ? now()->diffInDays($b->check_in_date) : 0,
                ])->toArray(),
            ];

            // ========== APPOINTMENTS ==========
            $todayAppointments = Appointment::with(['customer', 'pet', 'service'])
                ->whereDate('scheduled_at', today())
                ->orderBy('scheduled_at')
                ->get();

            $context['today_appointments'] = [
                'count' => $todayAppointments->count(),
                'confirmed' => $todayAppointments->where('status', 'confirmed')->count(),
                'pending' => $todayAppointments->where('status', 'pending')->count(),
                'completed' => $todayAppointments->where('status', 'completed')->count(),
                'appointments' => $todayAppointments->map(fn($a) => [
                    'time' => $a->scheduled_at?->format('g:i A'),
                    'customer' => $a->customer?->first_name,
                    'pet' => $a->pet?->name,
                    'service' => $a->service?->name,
                    'status' => $a->status,
                ])->toArray(),
            ];

            // Upcoming appointments (next 7 days)
            $upcomingAppointments = Appointment::whereBetween('scheduled_at', [now(), now()->addDays(7)])
                ->count();
            $context['upcoming_appointments_week'] = $upcomingAppointments;

            // ========== SERVICES & PRICING ==========
            $services = Service::select('name', 'price', 'duration', 'description', 'category')
                ->where('is_active', true)
                ->orderBy('category')
                ->get()
                ->groupBy('category');

            $context['services'] = $services->map(fn($categoryServices) =>
                $categoryServices->map(fn($s) => [
                    'name' => $s->name,
                    'price' => '₱' . number_format($s->price, 2),
                    'duration' => $s->duration . ' min',
                ])->toArray()
            )->toArray();

            // ========== INVENTORY ==========
            $lowStock = InventoryItem::where('quantity', '<=', 10)
                ->select('name', 'quantity', 'unit')
                ->take(5)
                ->get();

            $context['inventory'] = [
                'total_items' => InventoryItem::count(),
                'low_stock_count' => InventoryItem::where('quantity', '<=', 10)->count(),
                'low_stock_items' => $lowStock->map(fn($i) => [
                    'name' => $i->name,
                    'quantity' => $i->quantity . ' ' . $i->unit,
                ])->toArray(),
            ];

            // ========== CUSTOMERS & PETS ==========
            $context['customers'] = [
                'total_customers' => \App\Models\Customer::count(),
                'total_pets' => \App\Models\Pet::count(),
                'new_customers_this_month' => \App\Models\Customer::whereMonth('created_at', now()->month)->count(),
            ];

            // ========== FINANCIAL METRICS ==========
            $todayRevenue = \App\Models\Boarding::whereDate('created_at', today())
                ->sum('total_price');

            $context['financial'] = [
                'today_revenue' => '₱' . number_format($todayRevenue, 2),
                'unpaid_boardings' => \App\Models\Boarding::where('payment_status', 'unpaid')->count(),
                'partial_payments' => \App\Models\Boarding::where('payment_status', 'partial')->count(),
            ];

            // ========== SYSTEM HEALTH ==========
            $context['system'] = [
                'current_datetime' => now()->format('l, F j, Y g:i A'),
                'business_hours' => \App\Support\StoreHours::label() . ' every day (closed on public holidays)',
                'next_holiday' => $this->getNextHoliday(),
            ];

        } catch (\Exception $e) {
            // Silently fail - context is optional
            Log::warning('Context gathering error: ' . $e->getMessage());
        }

        return $context;
    }

    /**
     * Get next upcoming holiday or special date
     */
    private function getNextHoliday(): ?string
    {
        $holidays = [
            '01-01' => 'New Year\'s Day',
            '02-14' => 'Valentine\'s Day',
            '12-25' => 'Christmas Day',
            '12-31' => 'New Year\'s Eve',
        ];

        $today = now()->format('m-d');

        foreach ($holidays as $date => $name) {
            if ($date >= $today) {
                return $name . ' (' . $date . ')';
            }
        }

        return null;
    }

    /**
     * Process complex multi-step user intents
     */
    public function processComplexIntent(?User $user, string $message, array $conversationHistory = []): array
    {
        $intent = $this->detectIntent($message);
        $role = $this->roleScopeService->normalizeRole($user?->role);

        // Handle complex booking workflows
        if (str_contains($intent, 'booking')) {
            return $this->handleBookingWorkflow($user, $message, $intent, $conversationHistory);
        }

        // Handle FAQ with context
        if ($intent === 'faq' || $intent === 'general') {
            return $this->handleSmartFaq($user, $message, $role);
        }

        // Default to standard respond
        return $this->respond($user, $message);
    }

    /**
     * Smart FAQ handler with knowledge base search
     */
    private function handleSmartFaq(?User $user, string $message, string $role): array
    {
        // First try exact FAQ match
        $faqResponse = $this->knowledgeBaseService->findAnswer($message, $role);

        if ($faqResponse) {
            return [
                'reply' => $faqResponse['answer'],
                'intent' => 'faq',
                'suggestions' => $faqResponse['related'] ?? [],
                'actions' => [],
                'source' => 'knowledge_base',
            ];
        }

        // Fallback to AI
        return $this->aiResponse($message, $role, 'general');
    }

    /**
     * Handle complex booking workflow with state management
     */
    private function handleBookingWorkflow(?User $user, string $message, string $intent, array $history): array
    {
        $role = $this->roleScopeService->normalizeRole($user?->role);

        // Analyze conversation history for context
        $extractedDates = $this->extractDatesFromMessage($message);
        $extractedPets = $this->extractPetReferences($message, $user);

        $context = array_merge(
            $this->gatherLiveContext(),
            [
                'requested_dates' => $extractedDates,
                'mentioned_pets' => $extractedPets,
                'conversation_stage' => $this->determineConversationStage($history),
            ]
        );

        // Use AI with full context for intelligent booking assistance
        $aiResponse = $this->aiService->generateResponse($message, $role, $context, $this->knowledgeBaseService->historyFor($this->currentUser));

        if ($aiResponse) {
            // Add booking-specific actions
            $aiResponse['actions'] = [
                ['label' => 'Check Availability', 'type' => 'workflow', 'workflow' => 'hotel_booking'],
                ['label' => 'View Hotel Rooms', 'path' => '/customer/pet-hotel'],
            ];

            return array_merge($aiResponse, [
                'intent' => $intent,
                'source' => 'ai_enhanced',
            ]);
        }

        return $this->hotelBookingResponse($role);
    }

    /**
     * Extract dates from natural language message
     */
    private function extractDatesFromMessage(string $message): array
    {
        $dates = [];
        $message = strtolower($message);

        // Pattern: "next week", "this weekend", "tomorrow", "in 3 days"
        if (str_contains($message, 'tomorrow')) {
            $dates['check_in'] = now()->addDay()->format('Y-m-d');
        }
        if (str_contains($message, 'next week')) {
            $dates['check_in'] = now()->addWeek()->startOfWeek()->format('Y-m-d');
        }
        if (str_contains($message, 'this weekend')) {
            $dates['check_in'] = now()->next(now()->dayOfWeek >= 5 ? 6 : 5)->format('Y-m-d');
        }

        // Extract specific date mentions
        if (preg_match('/(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i', $message, $matches)) {
            $month = date('n', strtotime($matches[2]));
            $day = $matches[1];
            $dates['check_in'] = now()->setDate(now()->year, $month, $day)->format('Y-m-d');
        }

        return $dates;
    }

    /**
     * Extract pet references from message
     */
    private function extractPetReferences(string $message, ?User $user): array
    {
        if (!$user) {
            return [];
        }

        $pets = [];
        $customer = \App\Models\Customer::where('email', $user->email)->first();

        if ($customer) {
            $userPets = \App\Models\Pet::where('customer_id', $customer->id)->pluck('name')->toArray();

            foreach ($userPets as $petName) {
                if (stripos($message, $petName) !== false) {
                    $pets[] = $petName;
                }
            }
        }

        return $pets;
    }

    /**
     * Determine conversation stage based on history
     */
    private function determineConversationStage(array $history): string
    {
        $turns = count($history);

        if ($turns === 0) {
            return 'initial';
        } elseif ($turns <= 2) {
            return 'gathering_info';
        } elseif ($turns <= 4) {
            return 'clarifying';
        } else {
            return 'ready_to_book';
        }
    }
}
