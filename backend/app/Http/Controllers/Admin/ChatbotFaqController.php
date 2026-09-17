<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatbotFaq;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class ChatbotFaqController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => ChatbotFaq::query()
                ->orderBy('sort_order')
                ->orderBy('question')
                ->get()
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'question' => 'required|string|max:255',
            'answer' => 'required|string',
            'keywords' => 'nullable|array',
            'keywords.*' => 'string|max:50',
            'scope' => 'nullable|string|max:100',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $faq = ChatbotFaq::create([
            'question' => $data['question'],
            'answer' => $data['answer'],
            'keywords' => $data['keywords'] ?? [],
            'scope' => $data['scope'] ?? 'general',
            'is_active' => $data['is_active'] ?? true,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        $this->invalidateFaqCache();

        return response()->json([
            'success' => true,
            'data' => $faq,
        ], 201);
    }

    public function update(Request $request, ChatbotFaq $faq): JsonResponse
    {
        $data = $request->validate([
            'question' => 'required|string|max:255',
            'answer' => 'required|string',
            'keywords' => 'nullable|array',
            'keywords.*' => 'string|max:50',
            'scope' => 'nullable|string|max:100',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $faq->update([
            'question' => $data['question'],
            'answer' => $data['answer'],
            'keywords' => $data['keywords'] ?? [],
            'scope' => $data['scope'] ?? 'general',
            'is_active' => $data['is_active'] ?? true,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        $this->invalidateFaqCache();

        return response()->json([
            'success' => true,
            'data' => $faq,
        ]);
    }

    public function destroy(ChatbotFaq $faq): JsonResponse
    {
        $faq->delete();

        $this->invalidateFaqCache();

        return response()->json([
            'success' => true,
            'message' => 'FAQ deleted',
        ]);
    }

    /**
     * Clear FAQ caches used by PremiumChatbotService ('chatbot_faqs_all')
     * and the per-role caches used by KnowledgeBaseService ('chatbot_faqs_{role}').
     */
    protected function invalidateFaqCache(): void
    {
        Cache::forget('chatbot_faqs_all');

        foreach (['customer', 'receptionist', 'cashier', 'inventory', 'veterinary', 'manager', 'admin', 'guest', 'general'] as $role) {
            Cache::forget("chatbot_faqs_{$role}");
        }
    }
}
