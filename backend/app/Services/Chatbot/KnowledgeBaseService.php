<?php

namespace App\Services\Chatbot;

use App\Models\ChatbotFaq;
use Illuminate\Support\Facades\Cache;

class KnowledgeBaseService
{
    public function serviceCatalog(): array
    {
        return [
            'grooming' => [
                'title' => 'Grooming',
                'description' => 'Bathing, coat trimming, nail care, and hygiene packages for pets.',
            ],
            'veterinary' => [
                'title' => 'Veterinary',
                'description' => 'Checkups, vaccinations, consultations, and clinic support.',
            ],
            'boarding' => [
                'title' => 'Boarding',
                'description' => 'Pet hotel and supervised boarding stays with care monitoring.',
            ],
            'store' => [
                'title' => 'Store',
                'description' => 'Pet supplies, food, accessories, and wellness products.',
            ],
        ];
    }

    public function faq(): array
    {
        return [
            'hours' => 'Business hours are typically managed from the dashboard configuration, but the current bot can guide users to bookings, services, and support pages right away.',
            'contact' => 'You can direct users to the support and profile sections for contact information, booking follow-up, and account help.',
            'booking' => 'Bookings are handled through customer booking flows and receptionist scheduling tools. The chatbot can guide users to the correct module before automating more steps later.',
            'pricing' => 'Service prices come from the services module, so the chatbot should answer from backend service data instead of hardcoded frontend text.',
        ];
    }

    /**
     * Find answer in FAQ database by matching keywords
     */
    public function findAnswer(string $message, string $role): ?array
    {
        // Get active FAQs — cached per role for 10 minutes to avoid per-message DB hits
        $faqs = Cache::remember("chatbot_faqs_{$role}", 600, function () use ($role) {
            return ChatbotFaq::where('is_active', true)
                ->where(function ($query) use ($role) {
                    $query->whereNull('role_scope')
                        ->orWhere('role_scope', $role)
                        ->orWhere('role_scope', 'all');
                })
                ->orderBy('priority', 'desc')
                ->get();
        });

        $messageLower = strtolower($message);

        foreach ($faqs as $faq) {
            $questionWords = array_filter(
                explode(' ', strtolower($faq->question)),
                fn ($w) => strlen($w) > 3
            );
            $matches = 0;

            foreach ($questionWords as $word) {
                if (strpos($messageLower, $word) !== false) {
                    $matches++;
                }
            }

            // If 50%+ words match, return this FAQ
            if (count($questionWords) > 0 && $matches / count($questionWords) >= 0.5) {
                return [
                    'answer' => $faq->answer,
                    'related' => $faq->related_questions ?? [],
                    'match_score' => $matches,
                ];
            }
        }

        // Fallback: Check for common patterns in message
        if (stripos($message, 'hour') !== false || stripos($message, 'time') !== false) {
            return [
                'answer' => $this->faq()['hours'],
                'related' => ['When do you open?', 'What are your hours?', 'Are you open today?'],
            ];
        }

        if (stripos($message, 'contact') !== false || stripos($message, 'phone') !== false || stripos($message, 'email') !== false) {
            return [
                'answer' => $this->faq()['contact'],
                'related' => ['How can I reach you?', 'Support contact', 'Emergency contact'],
            ];
        }

        if (stripos($message, 'book') !== false || stripos($message, 'reserv') !== false) {
            return [
                'answer' => $this->faq()['booking'],
                'related' => ['How to book?', 'Book appointment', 'Book hotel stay'],
            ];
        }

        if (stripos($message, 'price') !== false || stripos($message, 'cost') !== false || stripos($message, 'rate') !== false) {
            return [
                'answer' => $this->faq()['pricing'],
                'related' => ['Service prices', 'Hotel rates', 'Grooming cost'],
            ];
        }

        return null;
    }
}
