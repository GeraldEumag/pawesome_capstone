<?php

namespace App\Http\Controllers;

use App\Support\StoreFacts;
use App\Support\StoreHours;
use App\Models\Service;
use App\Services\Chatbot\PremiumChatbotService;
use App\Services\Chatbot\RoleScopeService;
use App\Services\Chatbot\KnowledgeBaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class ChatbotController extends Controller
{
    private PremiumChatbotService $chatbotService;
    private KnowledgeBaseService $knowledgeBaseService;
    private \App\Services\Chatbot\AiChatbotService $aiService;

    public function __construct(
        RoleScopeService $roleScopeService,
        KnowledgeBaseService $knowledgeBaseService,
    ) {
        $this->chatbotService = new PremiumChatbotService($roleScopeService, $knowledgeBaseService);
        $this->knowledgeBaseService = $knowledgeBaseService;
        $this->aiService = new \App\Services\Chatbot\AiChatbotService();
    }

    /**
     * Get personalized welcome message — cached per role for 5 minutes.
     */
    public function welcome(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = $user->role ?? 'user';
        $cacheKey = "chatbot_welcome_{$role}";

        $data = Cache::remember($cacheKey, 300, function () use ($user) {
            return $this->chatbotService->welcome($user);
        });

        return response()->json($data);
    }

    /**
     * Process chatbot message and return intelligent response
     */
    public function message(Request $request): JsonResponse
    {
        $data = $request->validate([
            'message' => 'required|string|max:2000',
            'channel' => 'nullable|string|max:50',
            'context' => 'nullable|array',
        ]);

        return response()->json(
            $this->chatbotService->respond(
                $request->user(),
                $data['message'],
                $data['channel'] ?? 'web',
                $data['context'] ?? [],
            )
        );
    }

    /**
     * Public welcome message for unauthenticated landing page chatbot — cached 5 min.
     */
    public function publicWelcome(): JsonResponse
    {
        $data = Cache::remember('chatbot_public_welcome', 300, function () {
            $services = Service::where('is_active', true)
                ->orderBy('name')
                ->limit(6)
                ->get(['id', 'name', 'price', 'category']);

            return [
                'reply'       => "Hi! Welcome to Pawesome Pet Services!\nHow can I help you today? I can tell you about our services, pricing, hours, and how to book.",
                'intent'      => 'welcome',
                'role'        => 'guest',
                'suggestions' => [
                    'What services do you offer?',
                    'How do I book an appointment?',
                    'What are your prices?',
                    'What are your operating hours?',
                    'Where are you located?',
                ],
                'services_preview' => $services,
                'source' => 'public',
            ];
        });

        return response()->json($data);
    }

    /**
     * Public chatbot message for unauthenticated landing page visitors.
     * Order: FAQ knowledge base → booking redirect → flag-gated AI →
     * StoreFacts keyword rules → fallback card. No personal data, ever.
     */
    public function publicMessage(Request $request): JsonResponse
    {
        $data = $request->validate([
            'message' => 'required|string|max:2000',
        ]);

        $raw = trim($data['message']);
        $message = strtolower($raw);

        // FAQ knowledge base first — same curated answers as logged-in users
        // (guest scope only sees general/all rows).
        $faq = $this->knowledgeBaseService->findAnswer($raw, 'guest');
        if ($faq) {
            return response()->json([
                'reply'       => $faq['answer'],
                'intent'      => 'faq_guest',
                'suggestions' => array_slice($faq['related'] ?? [], 0, 4) ?: ['How do I book?', 'What are your hours?'],
                'actions'     => [['label' => 'Create free account', 'href' => '/register']],
                'source'      => 'faq',
            ]);
        }

        // Public AI path — off by default (cost), strict store-only prompt.
        if (config('chatbot.public_ai_enabled', false) && $this->aiService->isEnabled()) {
            $aiText = $this->aiService->quickFaqResponse($raw);
            if ($aiText) {
                $check = \App\Services\Chatbot\ChatbotAnswerValidator::validate($aiText);
                if ($check['ok']) {
                    return response()->json([
                        'reply'       => $aiText,
                        'intent'      => 'ai_guest',
                        'suggestions' => ['What services do you offer?', 'How do I book?'],
                        'actions'     => [['label' => 'Login to Book', 'href' => '/login']],
                        'source'      => 'ai',
                    ]);
                }
                \Log::info('Public chatbot AI reply rejected by validator', $check);
            }
        }

        // Booking intent → redirect to login
        $bookingKeywords = ['book', 'appointment', 'schedule', 'reserve', 'grooming', 'hotel', 'boarding', 'pa-book', 'magpa-schedule'];
        if (collect($bookingKeywords)->some(fn ($kw) => str_contains($message, $kw))) {
            return response()->json([
                'reply'   => "To book an appointment or hotel stay, you'll need to create a free account or log in first. Once logged in, our assistant will guide you through booking right inside the chat!",
                'intent'  => 'booking_guest',
                'cta'     => ['label' => 'Login to Book', 'href' => '/login'],
                'suggestions' => ['What services do you offer?', 'What are your prices?', 'How do I register?'],
                'source'  => 'public_rule',
            ]);
        }

        // Emergency services — must run BEFORE services, or 'vet' in
        // "emergency vet needed" gets shadowed by the services list.
        if (collect(['emergency', 'urgent', '24/7', 'after hours'])->some(fn ($kw) => str_contains($message, $kw))) {
            return response()->json([
                'reply'       => "For urgent concerns during operating hours (" . StoreFacts::hours() . "), please call us at " . StoreFacts::phone() . " or come to the clinic at " . StoreFacts::address() . ". Outside operating hours, please proceed to the nearest 24-hour emergency veterinary facility.",
                'intent'      => 'emergency_guest',
                'suggestions' => ['What are your hours?', 'How do I register?', 'What services do you offer?'],
                'source'      => 'public_rule',
            ]);
        }

        // Services info
        if (collect(['service', 'offer', 'groom', 'vet', 'hotel', 'boarding', 'what do'])->some(fn ($kw) => str_contains($message, $kw))) {
            $services = Service::where('is_active', true)->orderBy('name')->limit(8)->get(['name', 'price', 'category']);
            $list = $services->map(fn ($s) => "{$s->name} — ₱" . number_format($s->price, 2))->implode("\n");
            return response()->json([
                'reply'   => "We offer the following services:\n\n{$list}\n\nLogin or register to book any of these!",
                'intent'  => 'services_guest',
                'cta'     => ['label' => 'Register Free', 'href' => '/register'],
                'suggestions' => ['How do I book?', 'What are your hours?', 'Where are you located?'],
                'source'  => 'public_rule',
            ]);
        }

        // Pricing
        if (collect(['price', 'cost', 'how much', 'rate', 'fee'])->some(fn ($kw) => str_contains($message, $kw))) {
            $services = Service::where('is_active', true)->orderBy('price')->limit(6)->get(['name', 'price']);
            $list = $services->map(fn ($s) => "{$s->name}: ₱" . number_format($s->price, 2))->implode(', ');
            return response()->json([
                'reply'   => "Here's a quick price overview: {$list}. Full pricing is available after logging in.",
                'intent'  => 'pricing_guest',
                'cta'     => ['label' => 'Login for Full Details', 'href' => '/login'],
                'suggestions' => ['How do I book?', 'What services do you offer?'],
                'source'  => 'public_rule',
            ]);
        }

        // Hours
        if (collect(['hour', 'open', 'close', 'time', 'when'])->some(fn ($kw) => str_contains($message, $kw))) {
            return response()->json([
                'reply'       => "Pawesome is open every day, " . StoreHours::label() . ". We are closed on public holidays.",
                'intent'      => 'hours_guest',
                'suggestions' => ['Where are you located?', 'How do I book?', 'What services do you offer?'],
                'source'      => 'public_rule',
            ]);
        }

        // Location
        if (collect(['where', 'location', 'address', 'find', 'direction'])->some(fn ($kw) => str_contains($message, $kw))) {
            return response()->json([
                'reply'       => "You can find us at:\n🏢 " . StoreFacts::address() . "\n\nWe are open " . StoreFacts::hours() . ".",
                'intent'      => 'location_guest',
                'suggestions' => ['What are your hours?', 'How do I register?'],
                'source'      => 'public_rule',
            ]);
        }

        // Contact information
        if (collect(['contact', 'phone', 'email', 'reach', 'call'])->some(fn ($kw) => str_contains($message, $kw))) {
            return response()->json([
                'reply'       => "You can reach us at:\n" . StoreFacts::contactsBlock() . "\n\nFor urgent matters during business hours (" . StoreFacts::hours() . "), please call our main line.",
                'intent'      => 'contact_guest',
                'suggestions' => ['What are your hours?', 'How do I register?', 'What services do you offer?'],
                'source'      => 'public_rule',
            ]);
        }

        // Register / signup
        if (collect(['register', 'sign up', 'create account', 'how to join', 'new account'])->some(fn ($kw) => str_contains($message, $kw))) {
            return response()->json([
                'reply'   => "Creating an account is free and quick! Click Register, fill in your details, and you're ready to book services for your pet.",
                'intent'  => 'register_guest',
                'cta'     => ['label' => 'Register Now', 'href' => '/register'],
                'suggestions' => ['How do I book?', 'What services do you offer?'],
                'source'  => 'public_rule',
            ]);
        }

        // Default fallback
        return response()->json([
            'reply'       => "Hi! I'm the Pawesome Assistant. I can help with information about our services, pricing, hours, and how to get started. For personal booking or account info, please log in.",
            'intent'      => 'general_guest',
            'cta'         => ['label' => 'Login', 'href' => '/login'],
            'suggestions' => ['What services do you offer?', 'How do I book?', 'What are your prices?'],
            'source'      => 'public_rule',
        ]);
    }
}
