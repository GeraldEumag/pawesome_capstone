<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatbotFaq;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

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
            'category' => ['nullable', 'string', 'max:50', Rule::in(ChatbotFaq::VALID_CATEGORIES)],
            'scope' => 'nullable|string|max:100',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $faq = ChatbotFaq::create([
            'question' => $data['question'],
            'answer' => $data['answer'],
            'keywords' => $data['keywords'] ?? [],
            'category' => $data['category'] ?? 'general',
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
            'category' => ['nullable', 'string', 'max:50', Rule::in(ChatbotFaq::VALID_CATEGORIES)],
            'scope' => 'nullable|string|max:100',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $faq->update([
            'question' => $data['question'],
            'answer' => $data['answer'],
            'keywords' => $data['keywords'] ?? [],
            'category' => $data['category'] ?? $faq->category ?? 'general',
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

        // Every scope value the FAQ matcher can filter by — canonical roles,
        // composite/legacy aliases, and the guest/general buckets.
        foreach ([
            'customer', 'receptionist', 'cashier', 'inventory', 'veterinary',
            'manager', 'admin', 'super_receptionist', 'super_admin',
            'vet', 'veterinarian', 'guest', 'general', 'all',
        ] as $role) {
            Cache::forget("chatbot_faqs_{$role}");
        }
    }
}
