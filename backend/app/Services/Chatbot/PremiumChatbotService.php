<?php

namespace App\Services\Chatbot;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\ChatbotFaq;
use App\Models\ChatbotLog;
use App\Models\Customer;
use App\Models\CustomerOrder;
use App\Models\HotelRoom;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\Sale;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Premium Chatbot Service - Professional Grade
 * 
 * Features:
 * - Advanced NLP intent detection
 * - Context-aware responses
 * - Rich content with emojis and formatting
 * - Proactive suggestions
 * - Multi-turn conversation support
 * - Professional tone across all roles
 */
class PremiumChatbotService
{
    private AiChatbotService $aiService;
    private array $conversationContext = [];
    
    public function __construct(
        private readonly RoleScopeService $roleScopeService,
        private readonly KnowledgeBaseService $knowledgeBaseService,
    ) {
        $this->aiService = new AiChatbotService();
    }

    /**
     * Premium Welcome Message
     */
    public function welcome(?User $user): array
    {
        $config = $this->roleScopeService->getRoleConfig($user);
        $role = $this->roleScopeService->normalizeRole($user?->role);
        
        $greetings = [
            'admin' => "👋 Welcome back, Administrator! Ready to manage Pawesome operations?",
            'manager' => "👋 Hello, Manager! Let's review today's business performance.",
            'cashier' => "👋 Good day! I'm here to help with POS and transactions.",
            'receptionist' => "👋 Welcome! Ready to assist with appointments and check-ins?",
            'veterinary' => "👋 Hello, Doctor! Accessing medical records and appointments.",
            'customer' => "🐾 Welcome to Pawesome! How can I help you and your pet today?",
            'guest' => "🐾 Welcome to Pawesome Pet Services! How may I assist you?",
        ];
        
        return [
            'reply' => $greetings[$role] ?? $greetings['guest'],
            'intent' => 'welcome',
            'role' => $role,
            'scope' => $config['scope'],
            'suggestions' => $this->getWelcomeSuggestions($role),
            'rich_content' => $this->getWelcomeRichContent($role),
            'actions' => $this->getQuickActions($role),
            'source' => 'rule_based',
            'confidence' => 1.0,
            'metadata' => [
                'timestamp' => now()->toIso8601String(),
                'session_id' => uniqid('chat_', true),
            ],
        ];
    }

    /**
     * Premium Response Handler
     */
    public function respond(?User $user, string $message, string $channel = 'web', array $sessionContext = []): array
    {
        $role = $this->roleScopeService->normalizeRole($user?->role);
        $config = $this->roleScopeService->getRoleConfig($user);
        $intent = $this->detectSystemIntent($message, $sessionContext);

        if ($intent !== 'legacy_general') {
            $response = $this->systemAssistantResponse($user, $role, $intent, $message, $sessionContext);
            $formattedResponse = $this->formatResponse($response, $role, $channel, $intent);
            $this->storeContext($user?->id, $intent, $message, $formattedResponse);

            return $formattedResponse;
        }

        $intent = $this->detectIntentAdvanced($message);
        
        // Check FAQ first for precise answers
        $faqResponse = $this->enhancedFaqResponse($message, $role);
        if ($faqResponse && $faqResponse['confidence'] > 0.8) {
            return $this->formatResponse($faqResponse, $role, $channel, $intent);
        }
        
        // Get contextual response based on intent
        $response = match ($intent) {
            'greeting' => $this->greetingResponse($role, $user),
            'farewell' => $this->farewellResponse($role),
            'gratitude' => $this->gratitudeResponse($role),
            'summary' => $this->premiumSummaryResponse($role),
            'hotel_booking' => $this->premiumHotelResponse($role),
            'booking_help' => $this->premiumBookingResponse($role),
            'pricing' => $this->premiumPricingResponse($role),
            'services' => $this->premiumServicesResponse($role),
            'inventory' => $this->premiumInventoryResponse($role, $message),
            'navigation' => $this->premiumNavigationResponse($role),
            'support' => $this->premiumSupportResponse($role),
            'emergency' => $this->emergencyResponse($role),
            'operating_hours' => $this->operatingHoursResponse($role),
            'location' => $this->locationResponse($role),
            'contact' => $this->contactResponse($role),
            'feedback' => $this->feedbackResponse($role),
            'complaint' => $this->complaintResponse($role),
            default => $this->defaultResponse($role, $message),
        };

        $formattedResponse = $this->formatResponse($response, $role, $channel, $intent);

        // Store context for follow-up (with full response for logging)
        $this->storeContext($user?->id, $intent, $message, $formattedResponse);

        return $formattedResponse;
    }

    /**
     * Advanced Intent Detection with NLP Patterns
     */
    private function detectIntentAdvanced(string $message): string
    {
        $normalized = strtolower(trim($message));
        
        // Greeting patterns
        if (preg_match('/^(hi|hello|hey|good\s+(morning|afternoon|evening)|greetings)/i', $normalized)) {
            return 'greeting';
        }
        
        // Farewell patterns
        if (preg_match('/(bye|goodbye|see\s+you|farewell|thanks?\s*(bye)?)/i', $normalized)) {
            return 'farewell';
        }
        
        // Gratitude patterns
        if (preg_match('/(thank|thanks?|appreciate|grateful)/i', $normalized)) {
            return 'gratitude';
        }
        
        // Emergency patterns
        if (preg_match('/(emergency|urgent|critical|help\s*now|my\s*pet\s*is\s*sick)/i', $normalized)) {
            return 'emergency';
        }
        
        // Operating hours
        if (preg_match('/(hours?|open|close|time|when.*open|business\s*hours|operating)/i', $normalized)) {
            return 'operating_hours';
        }
        
        // Location
        if (preg_match('/(where|location|address|direction|find\s*you|located)/i', $normalized)) {
            return 'location';
        }
        
        // Contact
        if (preg_match('/(contact|call|phone|number|email|reach)/i', $normalized)) {
            return 'contact';
        }
        
        // Inventory search
        if (preg_match('/(stock|available|have\s*you.*(food|toy|shampoo|medicine|product)|do\s*you\s*have|inventory)/i', $normalized)) {
            return 'inventory';
        }
        
        // Pricing
        if (preg_match('/(how\s*much|price|cost|rate|fee|charge|expensive|cheap|discount)/i', $normalized)) {
            return 'pricing';
        }
        
        // Hotel/Booking
        if (preg_match('/(hotel|boarding|stay|room|overnight|sleep|accommodation|pet\s*hotel)/i', $normalized)) {
            return 'hotel_booking';
        }
        
        // Appointment/Booking
        if (preg_match('/(book|appointment|schedule|reserve|slot|when\s*can\s*i|available\s*time)/i', $normalized)) {
            return 'booking_help';
        }
        
        // Services
        if (preg_match('/(service|groom|vaccine|checkup|consultation|treatment|surgery|dental|spa)/i', $normalized)) {
            return 'services';
        }
        
        // Summary/Stats
        if (preg_match('/(summary|overview|stats|report|today\s*so\s*far|how\s*many|revenue|sales)/i', $normalized)) {
            return 'summary';
        }
        
        // Navigation
        if (preg_match('/(where\s*is|how\s*to|navigate|go\s*to|find|page|dashboard|menu)/i', $normalized)) {
            return 'navigation';
        }
        
        // Support/Help
        if (preg_match('/(help|support|assist|question|how\s*do\s*i|what\s*can\s*you)/i', $normalized)) {
            return 'support';
        }
        
        // Feedback
        if (preg_match('/(feedback|review|suggest|improve|rate|experience)/i', $normalized)) {
            return 'feedback';
        }
        
        // Complaint
        if (preg_match('/(complaint|problem|issue|bad|terrible|worst|angry|unhappy|dissatisfied)/i', $normalized)) {
            return 'complaint';
        }
        
        return 'general';
    }

    private function detectSystemIntent(string $message, array $context = []): string
    {
        $text = strtolower(trim($message));

        if (preg_match('/^(hi|hello|hey|yo|good\s+(morning|afternoon|evening)|kumusta|kamusta)\b/i', $text)) {
            return 'greeting';
        }

        if (preg_match('/\b(payment history|history ng payment|paid history|payments)\b/i', $text)) {
            return 'payment_history';
        }

        if (preg_match('/\b(pending payment|payment proof|proofs|verify payment|verification|bayad.*pending)\b/i', $text)) {
            return 'pending_payments';
        }

        if (preg_match('/\b(help|tulong|paano|how|what can you do|guide)\b/i', $text)) {
            if (preg_match('/\b(upload|proof|pay|payment|bayad|magbayad)\b/i', $text)) {
                return 'upload_payment_help';
            }

            return 'help';
        }

        if (preg_match('/\b(upload|proof|resibo|receipt|pay|payment|bayad|paid na ba|bayad na)\b/i', $text)) {
            return 'check_payment_status';
        }

        if (preg_match('/\b(low stock|reorder|kulang.*stock|critical stock)\b/i', $text)) {
            return 'low_stock_check';
        }

        if (preg_match('/\b(stock|inventory|available|availability|may stock|meron.*stock|shampoo|food|item)\b/i', $text)) {
            return 'inventory_stock_check';
        }

        if (preg_match('/\b(today.*appointment|appointments today|appointment.*today|schedule today|patients today|scheduled appointments|approved appointments|appointment queue)\b/i', $text)) {
            return 'today_appointments';
        }

        if (preg_match('/\b(pending approval|pending approvals|approve|approval|pending requests|pending bookings)\b/i', $text)) {
            return 'pending_approvals';
        }

        if (preg_match('/\b(request|booking|appointment|status|status ng request|grooming request|vet request)\b/i', $text)) {
            return str_contains($text, 'booking') || str_contains($text, 'appointment')
                ? 'check_booking_status'
                : 'check_request_status';
        }

        if (preg_match('/\b(receipt|print receipt|resibo|invoice)\b/i', $text)) {
            return 'receipt_help';
        }

        if (preg_match('/\b(workflow|role|permission|who can|process|flow|gawain)\b/i', $text)) {
            return 'role_workflow_explanation';
        }

        if (preg_match('/\b(contact|staff|reception|cashier|vet|manager|call|email)\b/i', $text)) {
            return 'contact_staff';
        }

        if (preg_match('/\b(summary|report|reports|system summary|overview|sales|revenue)\b/i', $text)) {
            return 'system_summary';
        }

        return 'legacy_general';
    }

    private function systemAssistantResponse(?User $user, string $role, string $intent, string $message, array $context): array
    {
        return match ($intent) {
            'greeting' => $this->assistantGreeting($role),
            'help' => $this->assistantHelp($role),
            'check_request_status', 'check_booking_status' => $this->requestStatusResponse($user, $role),
            'check_payment_status' => $this->paymentStatusResponse($user, $role),
            'upload_payment_help' => $this->uploadPaymentHelpResponse($role, $context),
            'payment_history' => $this->paymentHistoryResponse($user, $role),
            'pending_approvals' => $this->pendingApprovalsResponse($role),
            'pending_payments' => $this->pendingPaymentsResponse($role),
            'inventory_stock_check' => $this->inventoryStockResponse($role, $message),
            'low_stock_check' => $this->lowStockResponse($role),
            'today_appointments' => $this->todayAppointmentsResponse($user, $role),
            'receipt_help' => $this->receiptHelpResponse($role),
            'system_summary' => $this->systemSummaryResponse($role),
            'role_workflow_explanation' => $this->workflowExplanationResponse($role),
            'contact_staff' => $this->contactStaffResponse($role),
            default => $this->defaultResponse($role, $message),
        };
    }

    private function assistantGreeting(string $role): array
    {
        return [
            'message' => "Hi. I'm your Pawesome System Assistant. I can answer using your {$role} access and live system data.",
            'suggestions' => $this->roleSuggestions($role),
            'actions' => $this->roleQuickActions($role),
            'source' => 'role_live_assistant',
        ];
    }

    private function assistantHelp(string $role): array
    {
        $help = match ($role) {
            'customer' => 'I can check your requests, bookings, payment status, payment history, pets, and guide proof uploads.',
            'receptionist' => 'I can summarize pending approvals, bookings, schedule flow, and customer lookup guidance.',
            'cashier' => 'I can check pending payment proofs, receipt flow, POS guidance, and recent transaction direction.',
            'inventory' => 'I can check stock, low-stock items, item availability, movement guidance, and reorder alerts.',
            'veterinary' => 'I can check today appointments, scheduled consults, and medical workflow guidance.',
            'manager' => 'I can summarize sales, payments, inventory, services, and customer activity.',
            'admin' => 'I can explain user management, roles, reports, chatbot logs, and system health.',
            default => 'I can guide you through the Pawesome workflow available to your role.',
        };

        return [
            'message' => $help,
            'suggestions' => $this->roleSuggestions($role),
            'actions' => $this->roleQuickActions($role),
            'source' => 'role_live_assistant',
        ];
    }

    private function requestStatusResponse(?User $user, string $role): array
    {
        if ($role !== 'customer') {
            return $this->unauthorizedRoleResponse($role, 'Customer request status is only available to the logged-in customer.');
        }

        $requests = $this->customerServiceRequests($user)->take(5);
        $orders = $this->customerOrders($user)->take(3);
        $boardings = $this->customerBoardings($user)->take(3);
        $total = $requests->count() + $orders->count() + $boardings->count();

        if ($total === 0) {
            return [
                'message' => "I couldn't find active requests, bookings, or orders under your account.",
                'actions' => $this->roleQuickActions($role),
                'source' => 'live_database',
            ];
        }

        $lines = $requests->map(fn ($item) => "{$item->service_name} request is {$item->status}; payment is {$item->payment_status}.")
            ->concat($orders->map(fn ($item) => "Store order #{$item->id} is {$item->status}; payment is {$item->payment_status}."))
            ->concat($boardings->map(fn ($item) => "Boarding #{$item->id} is {$item->status}; payment is {$item->payment_status}."))
            ->values();

        return [
            'message' => "You have {$total} tracked item(s). " . $lines->implode(' '),
            'suggestions' => ['paid na ba ako', 'paano mag upload ng payment', 'payment history'],
            'actions' => $this->roleQuickActions($role),
            'rich_content' => [
                'last_entity_type' => 'request',
                'last_payment_status' => $requests->first()?->payment_status ?? $orders->first()?->payment_status ?? $boardings->first()?->payment_status,
                'last_request_id' => $requests->first()?->id ?? $orders->first()?->id ?? $boardings->first()?->id,
            ],
            'source' => 'live_database',
        ];
    }

    private function paymentStatusResponse(?User $user, string $role): array
    {
        if ($role !== 'customer') {
            return $this->unauthorizedRoleResponse($role, 'Payment status for a customer account is private.');
        }

        $items = $this->customerPayableItems($user);

        if ($items->isEmpty()) {
            return [
                'message' => "I couldn't find payment records under your account yet.",
                'actions' => $this->roleQuickActions($role),
                'source' => 'live_database',
            ];
        }

        $pending = $items->where('payment_status', 'pending')->count();
        $paid = $items->where('payment_status', 'paid')->count();
        $unpaid = $items->whereIn('payment_status', ['unpaid', 'rejected'])->count();
        $latest = $items->first();

        return [
            'message' => "Payment summary: {$paid} paid, {$pending} pending cashier verification, {$unpaid} unpaid or rejected. Latest: {$latest['label']} is {$latest['payment_status']}.",
            'suggestions' => ['payment history', 'paano mag upload ng payment', 'my requests'],
            'actions' => $this->roleQuickActions($role),
            'rich_content' => [
                'last_entity_type' => $latest['type'] ?? 'payment',
                'last_request_id' => $latest['id'] ?? null,
                'last_payment_status' => $latest['payment_status'] ?? null,
            ],
            'source' => 'live_database',
        ];
    }

    private function uploadPaymentHelpResponse(string $role, array $context): array
    {
        if ($role !== 'customer') {
            return [
                'message' => 'Only customers upload payment proof. Cashiers verify payment proofs after upload; they should not upload proofs for customers.',
                'actions' => $this->roleQuickActions($role),
                'source' => 'guardrail',
            ];
        }

        $status = $context['lastPaymentStatus'] ?? $context['last_payment_status'] ?? null;
        $prefix = $status ? "Your last tracked payment status was {$status}. " : '';

        return [
            'message' => $prefix . 'Open My Requests, choose a request or order that is approved/scheduled and unpaid/rejected, then click Pay and upload your proof. After upload, payment_status becomes pending until the cashier verifies it.',
            'actions' => $this->roleQuickActions($role),
            'source' => 'workflow_guardrail',
        ];
    }

    private function paymentHistoryResponse(?User $user, string $role): array
    {
        if ($role !== 'customer') {
            return $this->unauthorizedRoleResponse($role, 'Customer payment history is private to each customer.');
        }

        $items = $this->customerPayableItems($user)->take(5);
        if ($items->isEmpty()) {
            return [
                'message' => 'No payment history is available under your account yet.',
                'actions' => $this->roleQuickActions($role),
                'source' => 'live_database',
            ];
        }

        $lines = $items->map(fn ($item) => "{$item['reference']} - {$item['label']} - ₱" . number_format((float) $item['amount'], 2) . " - {$item['payment_status']}");

        return [
            'message' => "Here are your latest payment records: " . $lines->implode('; ') . '.',
            'actions' => $this->roleQuickActions($role),
            'source' => 'live_database',
        ];
    }

    private function pendingApprovalsResponse(string $role): array
    {
        if (!in_array($role, ['receptionist', 'manager', 'admin'], true)) {
            return $this->unauthorizedRoleResponse($role, 'Pending approvals are for receptionist, manager, or admin workflows.');
        }

        $serviceRequests = ServiceRequest::where('status', 'pending')->count();
        $orders = Schema::hasTable('customer_orders') ? CustomerOrder::where('status', 'pending')->count() : 0;
        $boardings = Schema::hasTable('boardings') ? Boarding::where('status', 'pending')->count() : 0;

        return [
            'message' => "Pending approvals: {$serviceRequests} service request(s), {$orders} store order(s), and {$boardings} boarding request(s). Receptionist should approve, reject, or schedule them from the approval screens.",
            'actions' => $this->roleQuickActions($role),
            'source' => 'live_database',
        ];
    }

    private function pendingPaymentsResponse(string $role): array
    {
        if (!in_array($role, ['cashier', 'manager', 'admin'], true)) {
            return $this->unauthorizedRoleResponse($role, 'Pending payment proof counts are for cashier, manager, or admin roles.');
        }

        $requests = ServiceRequest::where('payment_status', 'pending')->count();
        $orders = Schema::hasTable('customer_orders') ? CustomerOrder::where('payment_status', 'pending')->count() : 0;
        $boardings = Schema::hasTable('boardings') ? Boarding::where('payment_status', 'pending')->count() : 0;

        return [
            'message' => "There are {$requests} service payment(s), {$orders} order payment(s), and {$boardings} boarding payment(s) waiting for cashier verification.",
            'actions' => $this->roleQuickActions($role),
            'source' => 'live_database',
        ];
    }

    private function inventoryStockResponse(string $role, string $message): array
    {
        if (!in_array($role, ['inventory', 'cashier', 'manager', 'admin', 'customer', 'veterinary', 'receptionist'], true)) {
            return $this->unauthorizedRoleResponse($role, 'Inventory lookup is not available for this role.');
        }

        $query = trim(preg_replace('/\b(stock|inventory|available|availability|may|pa|ba|item|product|do you have|meron)\b/i', ' ', $message));
        $query = $query !== '' ? $query : $message;

        $items = InventoryItem::query()
            ->where('status', '!=', 'archived')
            ->where(function ($builder) use ($query) {
                $builder->where('name', 'like', "%{$query}%")
                    ->orWhere('category', 'like', "%{$query}%")
                    ->orWhere('sku', 'like', "%{$query}%");
            })
            ->orderBy('name')
            ->limit(5)
            ->get(['id', 'name', 'sku', 'category', 'stock', 'reorder_level', 'status', 'price']);

        if ($items->isEmpty()) {
            return [
                'message' => "I couldn't find a matching inventory item for that search.",
                'actions' => $this->roleQuickActions($role),
                'source' => 'live_database',
            ];
        }

        $lines = $items->map(fn ($item) => "{$item->name}: {$item->stock} in stock, status {$item->status}");

        return [
            'message' => "Inventory match: " . $lines->implode('; ') . '.',
            'actions' => $this->roleQuickActions($role),
            'source' => 'live_database',
        ];
    }

    private function lowStockResponse(string $role): array
    {
        if (!in_array($role, ['inventory', 'manager', 'admin'], true)) {
            return $this->unauthorizedRoleResponse($role, 'Low-stock monitoring is for inventory, manager, and admin roles.');
        }

        $items = InventoryItem::where('status', '!=', 'archived')
            ->where('stock', '>', 0)
            ->whereColumn('stock', '<=', 'reorder_level')
            ->orderBy('stock')
            ->limit(6)
            ->get(['name', 'stock', 'reorder_level']);

        if ($items->isEmpty()) {
            return [
                'message' => 'No low-stock items are currently flagged.',
                'actions' => $this->roleQuickActions($role),
                'source' => 'live_database',
            ];
        }

        $lines = $items->map(fn ($item) => "{$item->name}: {$item->stock} left, reorder level {$item->reorder_level}");

        return [
            'message' => "Low-stock items: " . $lines->implode('; ') . '.',
            'actions' => $this->roleQuickActions($role),
            'source' => 'live_database',
        ];
    }

    private function todayAppointmentsResponse(?User $user, string $role): array
    {
        if (!in_array($role, ['veterinary', 'receptionist', 'manager', 'admin'], true)) {
            return $this->unauthorizedRoleResponse($role, 'Today appointment queues are for staff roles.');
        }

        $query = Appointment::with(['pet', 'service', 'customer'])
            ->whereDate('scheduled_at', Carbon::today())
            ->orderBy('scheduled_at');

        if ($role === 'veterinary') {
            $query->where(function ($builder) use ($user) {
                $builder->whereNull('veterinarian_id')
                    ->orWhere('veterinarian_id', $user?->id);
            });
        }

        $appointments = $query->limit(8)->get();

        if ($appointments->isEmpty()) {
            return [
                'message' => 'No appointments are scheduled for today in your queue.',
                'actions' => $this->roleQuickActions($role),
                'source' => 'live_database',
            ];
        }

        $lines = $appointments->map(fn ($appointment) => optional($appointment->scheduled_at)->format('g:i A') . ' - ' . ($appointment->pet?->name ?? 'Pet') . ' - ' . ($appointment->service?->name ?? 'Service') . " ({$appointment->status})");

        return [
            'message' => "Today's appointments: " . $lines->implode('; ') . '.',
            'actions' => $this->roleQuickActions($role),
            'source' => 'live_database',
        ];
    }

    private function receiptHelpResponse(string $role): array
    {
        $message = match ($role) {
            'cashier' => 'After a POS transaction or payment verification succeeds, the system generates a receipt and opens the print-ready receipt view. Do not print before backend success.',
            'customer' => 'Receipts appear in Payment History after cashier verification. Uploading proof only sets payment_status to pending; it does not mark the payment paid.',
            default => 'Receipts are generated by cashier payment workflows after successful verification or checkout.',
        };

        return [
            'message' => $message,
            'actions' => $this->roleQuickActions($role),
            'source' => 'workflow_guardrail',
        ];
    }

    private function workflowExplanationResponse(string $role): array
    {
        $message = match ($role) {
            'customer' => 'Customer workflow: submit requests or orders, wait for receptionist approval/scheduling, upload payment proof when payable, then cashier verifies payment.',
            'receptionist' => 'Receptionist workflow: review customer requests/orders, approve/reject/schedule, and keep customers updated. Cashier handles payment verification.',
            'cashier' => 'Cashier workflow: process direct POS sales, verify pending payment proofs, generate receipts, and keep payment_status accurate.',
            'inventory' => 'Inventory workflow: maintain item quantities, low stock, reorder levels, stock logs, and item availability for sales/service usage.',
            'veterinary' => 'Veterinary workflow: handle approved/scheduled appointments, consults, patient notes, and medical records. Receptionist owns scheduling approvals.',
            'manager' => 'Manager workflow: monitor sales, payments, inventory, services, customers, and staff reports without taking operational actions from staff roles.',
            'admin' => 'Admin workflow: manage users, roles, services, system settings, logs, reports, and high-level system health.',
            default => 'Pawesome workflow: Customer submits, Receptionist approves/schedules, Cashier verifies payments, Inventory manages stock, Veterinary handles appointments, Manager monitors, Admin manages the system.',
        };

        return [
            'message' => $message,
            'actions' => $this->roleQuickActions($role),
            'source' => 'workflow_guardrail',
        ];
    }

    private function systemSummaryResponse(string $role): array
    {
        if (!in_array($role, ['manager', 'admin'], true)) {
            return $this->workflowExplanationResponse($role);
        }

        $today = Carbon::today();
        $salesToday = Sale::whereDate('created_at', $today)->sum('amount');
        $paymentsPending = ServiceRequest::where('payment_status', 'pending')->count()
            + (Schema::hasTable('customer_orders') ? CustomerOrder::where('payment_status', 'pending')->count() : 0)
            + (Schema::hasTable('boardings') ? Boarding::where('payment_status', 'pending')->count() : 0);
        $lowStock = InventoryItem::where('status', '!=', 'archived')
            ->where('stock', '>', 0)
            ->whereColumn('stock', '<=', 'reorder_level')
            ->count();
        $servicePending = ServiceRequest::where('status', 'pending')->count();

        return [
            'message' => "System summary today: sales ₱" . number_format((float) $salesToday, 2) . ", {$paymentsPending} pending payment proof(s), {$lowStock} low-stock item(s), and {$servicePending} pending service request(s).",
            'actions' => $this->roleQuickActions($role),
            'source' => 'live_database',
        ];
    }

    private function contactStaffResponse(string $role): array
    {
        return [
            'message' => 'For booking or approval concerns, contact the receptionist. For payment proof or receipts, contact the cashier. For medical appointment care, contact veterinary staff. The assistant will not approve bookings, mark payments paid, or deduct inventory directly.',
            'actions' => $this->roleQuickActions($role),
            'source' => 'workflow_guardrail',
        ];
    }

    private function unauthorizedRoleResponse(string $role, string $message): array
    {
        return [
            'message' => $message . " I can still help with {$role} workflow guidance.",
            'actions' => $this->roleQuickActions($role),
            'source' => 'role_guardrail',
            'confidence' => 1.0,
        ];
    }

    private function customerServiceRequests(?User $user)
    {
        if (!$user) {
            return collect();
        }

        return ServiceRequest::query()
            ->where(function ($query) use ($user) {
                $query->where('customer_id', $user->id)
                    ->orWhere('customer_email', $user->email);
            })
            ->latest()
            ->get();
    }

    private function customerOrders(?User $user)
    {
        if (!$user || !Schema::hasTable('customer_orders')) {
            return collect();
        }

        return CustomerOrder::query()
            ->where(function ($query) use ($user) {
                $query->where('customer_id', $user->id)
                    ->orWhere('customer_email', $user->email);
            })
            ->latest()
            ->get();
    }

    private function customerBoardings(?User $user)
    {
        if (!$user || !Schema::hasTable('boardings')) {
            return collect();
        }

        return Boarding::query()
            ->where(function ($query) use ($user) {
                $query->where('customer_id', $user->id)
                    ->orWhere('customer_email', $user->email);
            })
            ->latest()
            ->get();
    }

    private function customerPayableItems(?User $user)
    {
        return $this->customerServiceRequests($user)->map(fn ($item) => [
            'id' => $item->id,
            'type' => 'service_request',
            'label' => $item->service_name ?? $item->request_type ?? 'Service request',
            'amount' => $item->total_amount ?? $item->base_amount ?? 0,
            'payment_status' => $item->payment_status ?? 'unpaid',
            'reference' => $item->receipt_number ?? $item->payment_reference ?? "REQ-{$item->id}",
            'date' => $item->created_at,
        ])
            ->concat($this->customerOrders($user)->map(fn ($item) => [
                'id' => $item->id,
                'type' => 'order',
                'label' => 'Store order #' . $item->id,
                'amount' => $item->total_amount ?? 0,
                'payment_status' => $item->payment_status ?? 'unpaid',
                'reference' => $item->receipt_number ?? $item->payment_reference ?? "ORD-{$item->id}",
                'date' => $item->created_at,
            ]))
            ->concat($this->customerBoardings($user)->map(fn ($item) => [
                'id' => $item->id,
                'type' => 'boarding',
                'label' => 'Boarding #' . $item->id,
                'amount' => $item->total_amount ?? 0,
                'payment_status' => $item->payment_status ?? 'unpaid',
                'reference' => $item->receipt_number ?? $item->payment_reference ?? "BRD-{$item->id}",
                'date' => $item->created_at,
            ]))
            ->sortByDesc('date')
            ->values();
    }

    private function roleSuggestions(string $role): array
    {
        return match ($role) {
            'customer' => ['status ng request ko', 'paid na ba ako', 'paano mag upload ng payment'],
            'cashier' => ['may pending payments ba', 'print receipt', 'POS help'],
            'inventory' => ['low stock items', 'may stock pa ba shampoo', 'stock logs'],
            'veterinary' => ['appointments today', 'scheduled appointments', 'pet records'],
            'receptionist' => ['pending approvals', 'booking schedule', 'customer lookup'],
            'manager', 'admin' => ['system summary', 'reports', 'payment summary'],
            default => ['help', 'workflow', 'contact staff'],
        };
    }

    private function roleQuickActions(string $role): array
    {
        return match ($role) {
            'customer' => [
                ['label' => 'My Requests', 'path' => '/customer/requests'],
                ['label' => 'Payment History', 'path' => '/customer/payments'],
                ['label' => 'Upload Payment Proof', 'path' => '/customer/requests'],
                ['label' => 'My Pets', 'path' => '/customer/pets'],
            ],
            'receptionist' => [
                ['label' => 'Pending Approvals', 'path' => '/receptionist/approvals'],
                ['label' => 'Booking Schedule', 'path' => '/receptionist/bookings'],
                ['label' => 'Customer Records', 'path' => '/receptionist/customers'],
            ],
            'cashier' => [
                ['label' => 'Pending Payments', 'path' => '/cashier/payment-verification'],
                ['label' => 'POS', 'path' => '/cashier/pos'],
                ['label' => 'Receipts', 'path' => '/cashier/history'],
                ['label' => 'Transaction History', 'path' => '/cashier/transactions'],
            ],
            'inventory' => [
                ['label' => 'Inventory Items', 'path' => '/inventory/stock'],
                ['label' => 'Low Stock', 'path' => '/inventory/stock'],
                ['label' => 'Stock Logs', 'path' => '/inventory/logs'],
            ],
            'veterinary' => [
                ['label' => "Today's Appointments", 'path' => '/veterinary/appointments'],
                ['label' => 'Pet Records', 'path' => '/veterinary/records'],
            ],
            'manager' => [
                ['label' => 'Reports', 'path' => '/manager/reports'],
                ['label' => 'Logs', 'path' => '/manager/history'],
                ['label' => 'Users', 'path' => '/manager/staff'],
            ],
            'admin' => [
                ['label' => 'Reports', 'path' => '/admin/reports'],
                ['label' => 'Logs', 'path' => '/admin/chatbot'],
                ['label' => 'Users', 'path' => '/admin/users'],
            ],
            default => [],
        };
    }

    /**
     * Enhanced FAQ Response with Confidence Score
     */
    private function enhancedFaqResponse(string $message, string $role): ?array
    {
        $normalizedMessage = strtolower($message);
        
        // Load all active FAQs from cache (10-min TTL), then match in-memory
        $allFaqs = Cache::remember('chatbot_faqs_all', 600, function () {
            return ChatbotFaq::where('is_active', true)->get();
        });

        $faq = $allFaqs->first(function ($f) use ($normalizedMessage) {
            // keywords is cast as array on the model — join into a searchable string
            $keywordsStr = is_array($f->keywords)
                ? strtolower(implode(' ', $f->keywords))
                : strtolower((string) ($f->keywords ?? ''));
            return str_contains(strtolower($f->question), $normalizedMessage)
                || str_contains($keywordsStr, $normalizedMessage);
        });
        
        if ($faq) {
            return [
                'message' => $faq->answer,
                'confidence' => 0.9,
                'source' => 'faq',
                'faq_id' => $faq->id,
                'suggestions' => $this->getRelatedSuggestions($faq->category),
            ];
        }
        
        // Try AI service if enabled
        if ($this->aiService->isEnabled()) {
            $aiResponse = $this->aiService->generateResponse($message, $role);
            if ($aiResponse) {
                return [
                    'message' => $aiResponse,
                    'confidence' => 0.75,
                    'source' => 'ai',
                ];
            }
        }
        
        return null;
    }

    /**
     * Premium Greeting Response
     */
    private function greetingResponse(string $role, ?User $user): array
    {
        $hour = now()->hour;
        $timeOfDay = match (true) {
            $hour < 12 => 'morning',
            $hour < 17 => 'afternoon',
            default => 'evening',
        };
        
        $greetings = [
            'admin' => "Good {$timeOfDay}, Administrator! Dashboard ready for your review.",
            'manager' => "Good {$timeOfDay}, Manager! Here's your business overview.",
            'cashier' => "Good {$timeOfDay}! POS system standing by.",
            'receptionist' => "Good {$timeOfDay}! Front desk system active.",
            'veterinary' => "Good {$timeOfDay}, Doctor! Medical records accessible.",
            'customer' => "Good {$timeOfDay}! 🐾 Ready to help with your pet care needs!",
            'guest' => "Good {$timeOfDay}! Welcome to Pawesome Pet Services!",
        ];
        
        return [
            'message' => $greetings[$role] ?? $greetings['guest'],
            'confidence' => 1.0,
            'suggestions' => $this->getWelcomeSuggestions($role),
        ];
    }

    /**
     * Premium Summary Response with Rich Data
     */
    private function premiumSummaryResponse(string $role): array
    {
        $today = Carbon::today();
        $now = now();
        
        $data = match ($role) {
            'admin' => [
                'users' => User::count(),
                'active_users' => User::where('is_active', true)->count(),
                'customers' => Customer::count(),
                'appointments_today' => Appointment::whereDate('scheduled_at', $today)->count(),
                'revenue_today' => Sale::whereDate('created_at', $today)->sum('amount'),
                'low_stock' => InventoryItem::whereColumn('stock', '<=', 'reorder_level')->count(),
                'pending_appointments' => Appointment::where('status', 'pending')->count(),
            ],
            'manager' => [
                'staff_total' => User::whereIn('role', ['receptionist', 'veterinary', 'cashier'])->count(),
                'staff_active' => User::whereIn('role', ['receptionist', 'veterinary', 'cashier'])->where('is_active', true)->count(),
                'appointments_today' => Appointment::whereDate('scheduled_at', $today)->count(),
                'completed_today' => Appointment::whereDate('scheduled_at', $today)->where('status', 'completed')->count(),
                'revenue_month' => Sale::whereMonth('created_at', $today->month)->sum('amount'),
                'revenue_today' => Sale::whereDate('created_at', $today)->sum('amount'),
            ],
            'cashier' => [
                'transactions_today' => Sale::whereDate('created_at', $today)->count(),
                'revenue_today' => Sale::whereDate('created_at', $today)->sum('amount'),
                'avg_transaction' => Sale::whereDate('created_at', $today)->avg('amount') ?? 0,
            ],
            'receptionist' => [
                'appointments_today' => Appointment::whereDate('scheduled_at', $today)->count(),
                'check_ins_pending' => Appointment::where('status', 'confirmed')->whereDate('scheduled_at', $today)->count(),
                'new_customers_today' => Customer::whereDate('created_at', $today)->count(),
                'hotel_checkins' => \App\Models\Boarding::whereDate('check_in', $today)->count(),
            ],
            'veterinary' => [
                'appointments_today' => Appointment::whereDate('scheduled_at', $today)->where('veterinarian_id', auth()->id())->count(),
                'consultations_pending' => Appointment::where('status', 'scheduled')->whereDate('scheduled_at', $today)->count(),
                'patients_total' => Pet::count(),
            ],
            default => [],
        };
        
        $message = $this->formatSummaryMessage($role, $data);
        
        return [
            'message' => $message,
            'confidence' => 1.0,
            'rich_content' => [
                'type' => 'dashboard_summary',
                'data' => $data,
                'updated_at' => $now->toIso8601String(),
            ],
            'suggestions' => $this->getSummarySuggestions($role),
        ];
    }

    /**
     * Format Summary Message with Professional Styling
     */
    private function formatSummaryMessage(string $role, array $data): string
    {
        return match ($role) {
            'admin' => "📊 **Admin Dashboard Summary**\n\n" .
                "👥 **Users:** {$data['users']} total ({$data['active_users']} active)\n" .
                "🐕 **Customers:** {$data['customers']}\n" .
                "📅 **Today's Appointments:** {$data['appointments_today']}\n" .
                "⏳ **Pending:** {$data['pending_appointments']}\n" .
                "💰 **Today's Revenue:** ₱" . number_format($data['revenue_today'], 2) . "\n" .
                "⚠️ **Low Stock Items:** {$data['low_stock']}",
            
            'manager' => "📈 **Manager Performance Dashboard**\n\n" .
                "👥 **Staff:** {$data['staff_total']} ({$data['staff_active']} active)\n" .
                "📅 **Appointments Today:** {$data['appointments_today']} ({$data['completed_today']} completed)\n" .
                "💰 **Today's Revenue:** ₱" . number_format($data['revenue_today'], 2) . "\n" .
                "📊 **Monthly Revenue:** ₱" . number_format($data['revenue_month'], 2),
            
            'cashier' => "💵 **Cashier POS Summary**\n\n" .
                "🧾 **Transactions Today:** {$data['transactions_today']}\n" .
                "💰 **Total Revenue:** ₱" . number_format($data['revenue_today'], 2) . "\n" .
                "📊 **Average Transaction:** ₱" . number_format($data['avg_transaction'], 2),
            
            'receptionist' => "🎯 **Reception Dashboard**\n\n" .
                "📅 **Today's Appointments:** {$data['appointments_today']}\n" .
                "✅ **Ready for Check-in:** {$data['check_ins_pending']}\n" .
                "🏨 **Hotel Check-ins Today:** {$data['hotel_checkins']}\n" .
                "👋 **New Customers:** {$data['new_customers_today']}",
            
            'veterinary' => "🏥 **Veterinary Dashboard**\n\n" .
                "📅 **Your Appointments Today:** {$data['appointments_today']}\n" .
                "⏳ **Pending Consultations:** {$data['consultations_pending']}\n" .
                "🐾 **Total Patients:** {$data['patients_total']}",
            
            default => "Dashboard summary available for your role.",
        };
    }

    /**
     * Premium Hotel Response
     */
    private function premiumHotelResponse(string $role): array
    {
        $availableRooms = HotelRoom::where('status', 'available')->get();
        $totalRooms = HotelRoom::count();
        $occupiedRooms = HotelRoom::where('status', 'occupied')->count();
        $occupancyRate = $totalRooms > 0 ? round(($occupiedRooms / $totalRooms) * 100) : 0;
        $activeBoarders = \App\Models\Boarding::where('status', 'checked_in')->count();
        
        $roomTypes = $availableRooms->groupBy('type')->map(fn($rooms) => $rooms->count());
        
        $message = match ($role) {
            'customer' => "🏨 **Pet Hotel Services**\n\n" .
                "We currently have **{$availableRooms->count()} rooms available**!\n\n" .
                "**Room Types Available:**\n" .
                $roomTypes->map(fn($count, $type) => "• {$type}: {$count} rooms")->implode("\n") .
                "\n\n**Current Occupancy:** {$occupancyRate}%\n" .
                "**Pets Currently Staying:** {$activeBoarders}\n\n" .
                "Would you like to book a stay for your pet?",
            
            'receptionist' => "🏨 **Hotel Management View**\n\n" .
                "**Availability:** {$availableRooms->count()}/{$totalRooms} rooms\n" .
                "**Occupancy Rate:** {$occupancyRate}%\n" .
                "**Current Boarders:** {$activeBoarders} pets\n\n" .
                "Ready to process check-ins or new reservations.",
            
            default => "🏨 Pet Hotel: {$availableRooms->count()} rooms available. Occupancy: {$occupancyRate}%",
        };
        
        return [
            'message' => $message,
            'confidence' => 1.0,
            'rich_content' => [
                'type' => 'hotel_summary',
                'stats' => [
                    'available_rooms' => $availableRooms->count(),
                    'total_rooms' => $totalRooms,
                    'occupancy_rate' => $occupancyRate,
                    'active_boarders' => $activeBoarders,
                ],
                'room_types' => $roomTypes->toArray(),
            ],
        ];
    }

    /**
     * Premium Services Response
     */
    private function premiumServicesResponse(string $role): array
    {
        $services = Service::where('is_active', true)->orderBy('category')->get();
        
        if ($services->isEmpty()) {
            return [
                'message' => "🐾 **Our Services**\n\nWe offer comprehensive pet care services including grooming, vaccination, consultations, and boarding. Please check our website or contact us for detailed information.",
                'confidence' => 0.8,
            ];
        }
        
        $servicesByCategory = $services->groupBy('category');
        
        $message = "🐾 **Our Premium Pet Services**\n\n";
        
        foreach ($servicesByCategory as $category => $categoryServices) {
            $message .= "**{$category}**\n";
            foreach ($categoryServices as $service) {
                $message .= "• {$service->name} - ₱" . number_format($service->price, 2);
                if ($service->description) {
                    $message .= "\n  _{$service->description}_";
                }
                $message .= "\n";
            }
            $message .= "\n";
        }
        
        return [
            'message' => $message,
            'confidence' => 1.0,
            'rich_content' => [
                'type' => 'service_catalog',
                'categories' => $servicesByCategory->map(fn($items) => $items->map(fn($s) => [
                    'id' => $s->id,
                    'name' => $s->name,
                    'price' => $s->price,
                    'description' => $s->description,
                ]))->toArray(),
            ],
        ];
    }

    /**
     * Premium Inventory Response
     */
    private function premiumInventoryResponse(string $role, string $message): array
    {
        // Extract search term
        $searchTerm = preg_replace('/(do you have|is there|stock|available|inventory)/i', '', $message);
        $searchTerm = trim($searchTerm);
        
        $items = InventoryItem::where('status', 'active')
            ->where(function ($query) use ($searchTerm) {
                $query->where('name', 'like', "%{$searchTerm}%")
                    ->orWhere('sku', 'like', "%{$searchTerm}%")
                    ->orWhere('category', 'like', "%{$searchTerm}%");
            })
            ->limit(5)
            ->get();
        
        if ($items->isEmpty()) {
            return [
                'message' => "🔍 I couldn't find any products matching '{$searchTerm}'.\n\nWould you like to:\n• Browse all products\n• Search for something else\n• Check our service offerings",
                'confidence' => 0.9,
            ];
        }
        
        $response = "🔍 **Search Results for '{$searchTerm}'**\n\n";
        
        foreach ($items as $item) {
            $stockStatus = $item->stock > 10 ? '✅ In Stock' : ($item->stock > 0 ? '⚠️ Low Stock' : '❌ Out of Stock');
            $response .= "**{$item->name}**\n";
            $response .= "💰 ₱" . number_format($item->price, 2) . " | {$stockStatus} ({$item->stock} units)\n";
            if ($item->description) {
                $response .= "_{$item->description}_\n";
            }
            $response .= "\n";
        }
        
        return [
            'message' => $response,
            'confidence' => 0.95,
            'rich_content' => [
                'type' => 'inventory_search',
                'items' => $items->map(fn($i) => [
                    'id' => $i->id,
                    'name' => $i->name,
                    'sku' => $i->sku,
                    'price' => $i->price,
                    'stock' => $i->stock,
                    'category' => $i->category,
                ])->toArray(),
            ],
        ];
    }

    /**
     * Emergency Response
     */
    private function emergencyResponse(string $role): array
    {
        return [
            'message' => "🚨 **Emergency Support**\n\n" .
                "If this is a pet emergency:\n\n" .
                "1️⃣ **Call our 24/7 Hotline:** 📞 +63 (02) 8123-4567\n" .
                "2️⃣ **Emergency Vet:** Available 24/7\n" .
                "3️⃣ **Visit us immediately:** 123 Pet Care Ave\n\n" .
                "⚠️ **For life-threatening emergencies, please proceed directly to our facility or call now!**",
            'confidence' => 1.0,
            'actions' => [
                ['label' => '📞 Call Emergency Line', 'type' => 'tel', 'value' => '+630281234567'],
                ['label' => '📍 Get Directions', 'type' => 'link', 'value' => 'https://maps.google.com'],
            ],
        ];
    }

    /**
     * Operating Hours Response
     */
    private function operatingHoursResponse(string $role): array
    {
        return [
            'message' => "🕐 **Operating Hours**\n\n" .
                "**Monday - Friday:** 8:00 AM - 8:00 PM\n" .
                "**Saturday:** 9:00 AM - 6:00 PM\n" .
                "**Sunday:** 10:00 AM - 4:00 PM\n\n" .
                "🏥 **Emergency Services:** 24/7 Available\n\n" .
                "💡 _We recommend booking appointments in advance for non-emergency services._",
            'confidence' => 1.0,
        ];
    }

    /**
     * Location Response
     */
    private function locationResponse(string $role): array
    {
        return [
            'message' => "📍 **Find Us**\n\n" .
                "**Pawesome Pet Care Center**\n" .
                "123 Pet Care Avenue\n" .
                "Makati City, Metro Manila\n" .
                "Philippines 1200\n\n" .
                "🚗 **Parking:** Free customer parking available\n" .
                "🚌 **Public Transit:** Near Buendia MRT Station\n\n" .
                "📞 **Phone:** +63 (02) 8123-4567",
            'confidence' => 1.0,
            'actions' => [
                ['label' => '📍 View on Map', 'type' => 'link', 'value' => 'https://maps.google.com'],
            ],
        ];
    }

    /**
     * Contact Response
     */
    private function contactResponse(string $role): array
    {
        return [
            'message' => "📞 **Contact Us**\n\n" .
                "**Main Office:** +63 (02) 8123-4567\n" .
                "**Emergency Line:** +63 (02) 8987-6543 (24/7)\n" .
                "**Email:** hello@pawesome.ph\n" .
                "**Website:** www.pawesome.ph\n\n" .
                "**Social Media:**\n" .
                "📘 Facebook: @PawesomePH\n" .
                "📸 Instagram: @pawesome_pets\n\n" .
                "💬 _We're here to help! Response time is typically under 1 hour._",
            'confidence' => 1.0,
        ];
    }

    /**
     * Feedback Response
     */
    private function feedbackResponse(string $role): array
    {
        return [
            'message' => "📝 **We Value Your Feedback!**\n\n" .
                "Thank you for taking the time to share your thoughts. Your feedback helps us improve our services.\n\n" .
                "**How to submit feedback:**\n" .
                "• Reply with your comments here\n" .
                "• Email us at feedback@pawesome.ph\n" .
                "• Fill out the form on our website\n\n" .
                "⭐ **All feedback is reviewed by our management team within 24 hours.**",
            'confidence' => 1.0,
        ];
    }

    /**
     * Complaint Response
     */
    private function complaintResponse(string $role): array
    {
        return [
            'message' => "🙏 **We Apologize for Any Inconvenience**\n\n" .
                "Your satisfaction is our priority. Please share the details of your concern, and we will address it promptly.\n\n" .
                "**Escalation Options:**\n" .
                "1️⃣ **Chat with us:** Share details here\n" .
                "2️⃣ **Call Manager:** +63 (02) 8123-4568\n" .
                "3️⃣ **Email:** complaints@pawesome.ph\n\n" .
                "⚡ **We aim to resolve all issues within 24 hours.**",
            'confidence' => 1.0,
        ];
    }

    /**
     * Support Response
     */
    private function premiumSupportResponse(string $role): array
    {
        $roleSpecificHelp = match ($role) {
            'admin' => "**Admin Help Topics:**\n• User management\n• Reports and analytics\n• System configuration\n• Chatbot logs",
            'cashier' => "**Cashier Help Topics:**\n• Processing transactions\n• Handling refunds\n• Inventory lookup\n• End of day procedures",
            'receptionist' => "**Receptionist Help Topics:**\n• Booking appointments\n• Customer check-in/out\n• Hotel reservations\n• Customer inquiries",
            'veterinary' => "**Veterinary Help Topics:**\n• Accessing patient records\n• Appointment management\n• Medical history\n• Treatment plans",
            'customer' => "**Customer Help Topics:**\n• Booking services\n• Viewing pet history\n• Product availability\n• Pricing information",
            default => "**Available Help:**\n• Services and pricing\n• Operating hours\n• Contact information\n• General inquiries",
        };
        
        return [
            'message' => "❓ **Help Center**\n\n{$roleSpecificHelp}\n\n" .
                "**Quick Commands:**\n" .
                "• Type 'services' for service catalog\n" .
                "• Type 'pricing' for price list\n" .
                "• Type 'summary' for dashboard overview\n" .
                "• Type 'hours' for operating hours",
            'confidence' => 1.0,
        ];
    }

    /**
     * Navigation Response
     */
    private function premiumNavigationResponse(string $role): array
    {
        $paths = match ($role) {
            'admin' => [
                ['label' => '📊 Dashboard', 'path' => '/admin'],
                ['label' => '👥 Users', 'path' => '/admin/users'],
                ['label' => '📈 Reports', 'path' => '/admin/reports'],
                ['label' => '🤖 Chatbot Logs', 'path' => '/admin/chatbot'],
            ],
            'cashier' => [
                ['label' => '💵 POS', 'path' => '/cashier'],
                ['label' => '📦 Inventory', 'path' => '/cashier/inventory'],
                ['label' => '📜 Transactions', 'path' => '/cashier/transactions'],
            ],
            'receptionist' => [
                ['label' => '📅 Appointments', 'path' => '/receptionist/appointments'],
                ['label' => '🏨 Hotel', 'path' => '/receptionist/hotel'],
                ['label' => '👥 Customers', 'path' => '/receptionist/customers'],
            ],
            'veterinary' => [
                ['label' => '🏥 Medical Records', 'path' => '/veterinary/records'],
                ['label' => '📅 Appointments', 'path' => '/veterinary/appointments'],
                ['label' => '🐾 Patients', 'path' => '/veterinary/patients'],
            ],
            'customer' => [
                ['label' => '🐾 My Pets', 'path' => '/customer/pets'],
                ['label' => '📅 Bookings', 'path' => '/customer/bookings'],
                ['label' => '🏪 Store', 'path' => '/customer/store'],
            ],
            default => [
                ['label' => '🏠 Home', 'path' => '/'],
                ['label' => '🐾 Services', 'path' => '/services'],
                ['label' => '📞 Contact', 'path' => '/contact'],
            ],
        };
        
        return [
            'message' => "🧭 **Quick Navigation**\n\nHere are the main sections available to you:",
            'confidence' => 1.0,
            'actions' => $paths,
        ];
    }

    /**
     * Farewell Response
     */
    private function farewellResponse(string $role): array
    {
        $messages = [
            'admin' => "👋 Goodbye, Administrator! Have a productive day!",
            'manager' => "👋 Goodbye, Manager! See you tomorrow!",
            'cashier' => "👋 Take care! Have a great shift!",
            'receptionist' => "👋 Goodbye! Thanks for helping our customers!",
            'veterinary' => "👋 Goodbye, Doctor! Thank you for caring for our patients!",
            'customer' => "🐾 Thank you for visiting! We hope to see you and your pet soon!",
            'guest' => "🐾 Thank you for visiting Pawesome! Have a wonderful day!",
        ];
        
        return [
            'message' => $messages[$role] ?? $messages['guest'],
            'confidence' => 1.0,
        ];
    }

    /**
     * Gratitude Response
     */
    private function gratitudeResponse(string $role): array
    {
        return [
            'message' => "🙏 **You're Welcome!**\n\n" .
                "It's our pleasure to help! If you need anything else, just ask. We're always here for you and your pets! 🐾",
            'confidence' => 1.0,
        ];
    }

    /**
     * Premium Booking Response
     */
    private function premiumBookingResponse(string $role): array
    {
        $customerData = [];
        
        if ($role === 'customer' && auth()->check()) {
            $customer = Customer::where('email', auth()->user()->email)->first();
            if ($customer) {
                $pets = Pet::where('customer_id', $customer->id)->get();
                $customerData = [
                    'pets' => $pets->map(fn($p) => ['id' => $p->id, 'name' => $p->name, 'species' => $p->species]),
                ];
            }
        }
        
        $message = match ($role) {
            'customer' => "📅 **Let's Book an Appointment!**\n\n" .
                "Great! I can help you schedule a service for your pet.\n\n" .
                "**Next Steps:**\n" .
                "1️⃣ Select your pet\n" .
                "2️⃣ Choose a service\n" .
                "3️⃣ Pick a date and time\n\n" .
                "Would you like to see available services?",
            
            'receptionist' => "📅 **Booking Assistant**\n\n" .
                "Ready to create a new booking! Access the booking form or check availability first.",
            
            default => "📅 **Booking Services**\n\nPlease visit the appointments section or contact reception to schedule.",
        };
        
        return [
            'message' => $message,
            'confidence' => 1.0,
            'rich_content' => !empty($customerData) ? [
                'type' => 'booking_options',
                'data' => $customerData,
            ] : null,
            'actions' => [
                ['label' => '📅 Book Now', 'type' => 'workflow', 'workflow' => 'create_booking'],
                ['label' => '📋 View Services', 'path' => '/services'],
            ],
        ];
    }

    /**
     * Premium Pricing Response
     */
    private function premiumPricingResponse(string $role): array
    {
        $services = Service::where('is_active', true)->orderBy('price')->get();
        
        $message = "💰 **Our Service Pricing**\n\n";
        
        foreach ($services->groupBy('category') as $category => $items) {
            $message .= "**{$category}**\n";
            foreach ($items as $service) {
                $message .= "• {$service->name}: ₱" . number_format($service->price, 2) . "\n";
            }
            $message .= "\n";
        }
        
        $message .= "💡 **Note:** Prices may vary based on pet size and specific requirements.\n";
        $message .= "📞 Call us at +63 (02) 8123-4567 for detailed quotes.";
        
        return [
            'message' => $message,
            'confidence' => 1.0,
        ];
    }

    /**
     * Default Response
     */
    private function defaultResponse(string $role, string $message): array
    {
        // Try to provide a helpful response even when intent is unclear
        return [
            'message' => "🤔 I want to make sure I help you correctly!\n\n" .
                "Could you please clarify what you're looking for? For example:\n" .
                "• 'Show me services'\n" .
                "• 'What are your prices?'\n" .
                "• 'I need to book an appointment'\n" .
                "• 'Check availability for dog food'\n\n" .
                "Or type **'help'** for a list of things I can assist with!",
            'confidence' => 0.6,
            'suggestions' => [
                'Show services',
                'Pricing information',
                'Book appointment',
                'Operating hours',
            ],
        ];
    }

    // ============================================
    // Helper Methods
    // ============================================

    private function formatResponse(array $response, string $role, string $channel, string $intent): array
    {
        return [
            'reply' => $response['message'],
            'intent' => $intent,
            'role' => $role,
            'channel' => $channel,
            'suggestions' => $response['suggestions'] ?? $this->getDefaultSuggestions($role),
            'actions' => $response['actions'] ?? [],
            'rich_content' => $response['rich_content'] ?? null,
            'source' => $response['source'] ?? 'rule_based',
            'confidence' => $response['confidence'] ?? 0.8,
            'metadata' => [
                'timestamp' => now()->toIso8601String(),
                'processing_time_ms' => defined('LARAVEL_START') 
                    ? round((microtime(true) - LARAVEL_START) * 1000, 2)
                    : 0,
                'intent_detected' => $intent,
            ],
        ];
    }

    private function getWelcomeSuggestions(string $role): array
    {
        return match ($role) {
            'admin' => ['View summary', 'Check reports', 'View chatbot logs'],
            'manager' => ['View summary', 'Staff overview', 'Revenue report'],
            'cashier' => ['Start POS', 'Check inventory', 'View transactions'],
            'receptionist' => ['Today\'s appointments', 'Check-ins', 'Book appointment'],
            'veterinary' => ['Today\'s patients', 'Medical records', 'Appointments'],
            'customer' => ['Our services', 'Book appointment', 'View my pets', 'Store'],
            default => ['Services', 'Pricing', 'Contact us'],
        };
    }

    private function getSummarySuggestions(string $role): array
    {
        return match ($role) {
            'admin' => ['View detailed reports', 'Check low stock', 'User management'],
            'manager' => ['Staff schedule', 'Monthly report', 'Inventory status'],
            'cashier' => ['Process sale', 'End of day', 'Inventory check'],
            'receptionist' => ['New booking', 'Check-in guest', 'Customer lookup'],
            'veterinary' => ['Patient records', 'Schedule surgery', 'View lab results'],
            default => ['Book service', 'View store', 'Contact support'],
        };
    }

    private function getDefaultSuggestions(string $role): array
    {
        return match ($role) {
            'admin', 'manager' => ['Summary', 'Reports', 'Users', 'Help'],
            'cashier' => ['POS', 'Inventory', 'Transactions', 'Help'],
            'receptionist' => ['Appointments', 'Hotel', 'Customers', 'Help'],
            'veterinary' => ['Patients', 'Records', 'Appointments', 'Help'],
            'customer' => ['Services', 'Book', 'Store', 'Help'],
            default => ['Services', 'Pricing', 'Contact', 'Help'],
        };
    }

    private function getQuickActions(string $role): array
    {
        return match ($role) {
            'admin' => [
                ['label' => '📊 Dashboard', 'path' => '/admin'],
                ['label' => '📈 Reports', 'path' => '/admin/reports'],
            ],
            'cashier' => [
                ['label' => '💵 Open POS', 'path' => '/cashier'],
            ],
            'receptionist' => [
                ['label' => '📅 Appointments', 'path' => '/receptionist/appointments'],
            ],
            'veterinary' => [
                ['label' => '🏥 Records', 'path' => '/veterinary/records'],
            ],
            'customer' => [
                ['label' => '🐾 My Pets', 'path' => '/customer/pets'],
                ['label' => '📅 Book Now', 'path' => '/customer/bookings'],
            ],
            default => [],
        };
    }

    private function getWelcomeRichContent(string $role): ?array
    {
        return match ($role) {
            'admin', 'manager' => [
                'type' => 'stats_preview',
                'stats' => [
                    'today_appointments' => Appointment::whereDate('scheduled_at', today())->count(),
                    'active_users' => User::where('is_active', true)->count(),
                ],
            ],
            'customer' => [
                'type' => 'quick_links',
                'links' => [
                    ['label' => 'Book Grooming', 'icon' => '✂️'],
                    ['label' => 'Vaccination', 'icon' => '💉'],
                    ['label' => 'Pet Hotel', 'icon' => '🏨'],
                ],
            ],
            default => null,
        };
    }

    private function getRelatedSuggestions(string $category): array
    {
        return match ($category) {
            'services' => ['Book now', 'View pricing', 'All services'],
            'general' => ['Operating hours', 'Location', 'Contact'],
            'support' => ['Call us', 'Email support', 'FAQ'],
            default => ['Help', 'Contact us'],
        };
    }

    private function storeContext(?int $userId, string $intent, string $message, ?array $response = null): void
    {
        if ($userId) {
            $this->conversationContext[$userId] = [
                'last_intent' => $intent,
                'last_message' => $message,
                'timestamp' => now(),
            ];

            // Persist chatbot log to database
            try {
                $user = User::find($userId);
                ChatbotLog::create([
                    'user_id' => $userId,
                    'role' => $user?->role ?? 'guest',
                    'channel' => 'web',
                    'type' => 'general',
                    'intent' => $intent,
                    'scope' => $this->roleScopeService->normalizeRole($user?->role),
                    'message' => $message,
                    'user_message' => $message,
                    'response' => $response['reply'] ?? $response['message'] ?? null,
                    'bot_response' => $response['reply'] ?? $response['message'] ?? null,
                    'metadata' => [
                        'timestamp' => now()->toIso8601String(),
                        'session_id' => uniqid('chat_', true),
                        'confidence' => $response['confidence'] ?? null,
                        'source' => $response['source'] ?? null,
                        'status' => 'success',
                    ],
                ]);
            } catch (\Exception $e) {
                // Silently fail if log can't be saved (don't break chat for logging issues)
                Log::warning('Failed to save chatbot log: ' . $e->getMessage());
            }
        }
    }
}
