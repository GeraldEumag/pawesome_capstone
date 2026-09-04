<?php

namespace App\Http\Controllers;

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

    public function __construct(
        RoleScopeService $roleScopeService,
        KnowledgeBaseService $knowledgeBaseService,
    ) {
        $this->chatbotService = new PremiumChatbotService($roleScopeService, $knowledgeBaseService);
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
     */
    public function publicMessage(Request $request): JsonResponse
    {
        $data = $request->validate([
            'message' => 'required|string|max:2000',
        ]);

        $message = strtolower(trim($data['message']));

        // Booking intent → redirect to login
        $bookingKeywords = ['book', 'appointment', 'schedule', 'reserve', 'grooming', 'hotel', 'boarding'];
        if (collect($bookingKeywords)->some(fn ($kw) => str_contains($message, $kw))) {
            return response()->json([
                'reply'   => "To book an appointment or hotel stay, you'll need to create a free account or log in first. Once logged in, our assistant will guide you through booking right inside the chat!",
                'intent'  => 'booking_guest',
                'cta'     => ['label' => 'Login to Book', 'href' => '/login'],
                'suggestions' => ['What services do you offer?', 'What are your prices?', 'How do I register?'],
                'source'  => 'public_rule',
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
                'reply'       => "Pawesome is open Monday to Saturday, 8:00 AM – 6:00 PM. We are closed on Sundays and public holidays.",
                'intent'      => 'hours_guest',
                'suggestions' => ['Where are you located?', 'How do I book?', 'What services do you offer?'],
                'source'      => 'public_rule',
            ]);
        }

        // Location
        if (collect(['where', 'location', 'address', 'find', 'direction'])->some(fn ($kw) => str_contains($message, $kw))) {
            return response()->json([
                'reply'       => "You can find us at our clinic location. For the exact address, please contact us through our registration page or visit us in person!",
                'intent'      => 'location_guest',
                'suggestions' => ['What are your hours?', 'How do I register?'],
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
