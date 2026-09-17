<?php

namespace Tests\Feature;

use App\Models\Boarding;
use App\Models\ChatbotFaq;
use App\Models\ChatbotLog;
use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\Pet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Focused regression tests for the P0/P1 chatbot remediation pass:
 *  - P0-1 Gemini AI path (header auth, config-driven timeout/tokens, fallback)
 *  - P0-2 Hotel double-booking (non-terminal boarding statuses block rooms)
 *  - P0-3 FAQ scope isolation
 *  - P0-4 Workflow endpoint RBAC
 *  - P1-5 FAQ keyword-overlap matching
 *  - P1-6 Customer-only payment intent gating
 *  - P1-7 FAQ cache invalidation on admin CRUD
 *  - P1-8 conversation_id propagation into chatbot_logs.metadata
 */
class ChatbotRemediationTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $cashier;
    protected User $inventory;
    protected User $receptionist;
    protected User $customerUser;
    protected Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->cashier = User::factory()->create(['role' => 'cashier']);
        $this->inventory = User::factory()->create(['role' => 'inventory']);
        $this->receptionist = User::factory()->create(['role' => 'receptionist']);
        $this->customerUser = User::factory()->create([
            'role' => 'customer',
            'email' => 'customer@example.com',
        ]);
        $this->customer = Customer::factory()->create([
            'name' => 'Customer User',
            'email' => 'customer@example.com',
        ]);
    }

    protected function withAuth(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('test-token')->plainTextToken];
    }

    // ----------------------------------------------------------
    // P0-3 + P1-5 — FAQ scope isolation & keyword-overlap matching
    // ----------------------------------------------------------

    public function test_customer_cannot_receive_receptionist_scoped_faq(): void
    {
        ChatbotFaq::create([
            'question' => 'How do staff process customer refunds at the counter?',
            'answer' => 'STAFF-ONLY-ANSWER refunds are processed from the cashier desk.',
            'keywords' => ['refund', 'counter', 'process'],
            'scope' => 'receptionist',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'how do staff process refund at counter',
        ], $this->withAuth($this->customerUser));

        $response->assertStatus(200);
        $this->assertStringNotContainsString(
            'STAFF-ONLY-ANSWER',
            (string) $response->json('reply')
        );
    }

    public function test_cashier_cannot_receive_veterinary_scoped_faq(): void
    {
        ChatbotFaq::create([
            'question' => 'What vaccine protocol applies for boarding pets?',
            'answer' => 'VET-ONLY-ANSWER protocol details.',
            'keywords' => ['vaccine', 'protocol', 'boarding'],
            'scope' => 'veterinary',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'what vaccine protocol applies for boarding pets',
        ], $this->withAuth($this->cashier));

        $response->assertStatus(200);
        $this->assertStringNotContainsString(
            'VET-ONLY-ANSWER',
            (string) $response->json('reply')
        );
    }

    public function test_general_scope_faq_matches_via_keyword_overlap(): void
    {
        ChatbotFaq::create([
            'question' => 'What are your grooming prices?',
            'answer' => 'GENERAL-FAQ-ANSWER grooming starts at a fixed rate.',
            'keywords' => ['grooming', 'price'],
            'scope' => 'general',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'can you tell me the grooming price please',
        ], $this->withAuth($this->customerUser));

        $response->assertStatus(200);
        $this->assertStringContainsString('GENERAL-FAQ-ANSWER', (string) $response->json('reply'));
        $this->assertSame('faq', $response->json('source'));
    }

    public function test_all_scope_faq_is_accessible_to_staff(): void
    {
        ChatbotFaq::create([
            'question' => 'Where is the supply storage room located?',
            'answer' => 'ALL-SCOPE-ANSWER storage is behind reception.',
            'keywords' => ['storage', 'supply', 'located'],
            'scope' => 'all',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'where is the supply storage located',
        ], $this->withAuth($this->cashier));

        $response->assertStatus(200);
        $this->assertStringContainsString('ALL-SCOPE-ANSWER', (string) $response->json('reply'));
    }

    // ----------------------------------------------------------
    // P0-2 — Hotel double-booking protection
    // ----------------------------------------------------------

    public function test_confirmed_boarding_blocks_explicit_room_booking(): void
    {
        [$room, $pet] = $this->roomWithBoarding('confirmed', '2025-07-10', '2025-07-15');

        $response = $this->postJson('/api/chatbot/workflow/hotel-bookings', [
            'pet_id' => $pet->id,
            'hotel_room_id' => $room->id,
            'check_in' => '2025-07-12',
            'check_out' => '2025-07-18',
        ], $this->withAuth($this->customerUser));

        $response->assertStatus(422);
    }

    public function test_checked_in_boarding_blocks_explicit_room_booking(): void
    {
        [$room, $pet] = $this->roomWithBoarding('checked_in', '2025-07-10', '2025-07-15');

        $response = $this->postJson('/api/chatbot/workflow/hotel-bookings', [
            'pet_id' => $pet->id,
            'hotel_room_id' => $room->id,
            'check_in' => '2025-07-12',
            'check_out' => '2025-07-18',
        ], $this->withAuth($this->customerUser));

        $response->assertStatus(422);
    }

    public function test_pending_boarding_blocks_room_from_availability(): void
    {
        [$room] = $this->roomWithBoarding('pending', '2025-07-10', '2025-07-15');

        $response = $this->getJson(
            '/api/chatbot/workflow/hotel/availability?check_in=2025-07-12&check_out=2025-07-18',
            $this->withAuth($this->customerUser)
        );

        $response->assertStatus(200);
        $this->assertNotContains(
            $room->id,
            collect($response->json('available_rooms'))->pluck('id')
        );
    }

    public function test_cancelled_and_checked_out_boardings_do_not_block(): void
    {
        [$roomA, $pet] = $this->roomWithBoarding('cancelled', '2025-07-10', '2025-07-15');
        [$roomB] = $this->roomWithBoarding('checked_out', '2025-07-10', '2025-07-15');

        $response = $this->postJson('/api/chatbot/workflow/hotel-bookings', [
            'pet_id' => $pet->id,
            'hotel_room_id' => $roomA->id,
            'check_in' => '2025-07-12',
            'check_out' => '2025-07-18',
        ], $this->withAuth($this->customerUser));

        $response->assertStatus(201);

        // checked_out room is returned by the availability endpoint
        $avail = $this->getJson(
            '/api/chatbot/workflow/hotel/availability?check_in=2025-07-12&check_out=2025-07-18',
            $this->withAuth($this->customerUser)
        );
        $this->assertContains(
            $roomB->id,
            collect($avail->json('available_rooms'))->pluck('id')
        );
    }

    public function test_auto_assignment_skips_occupied_room(): void
    {
        [$blockedRoom, $pet] = $this->roomWithBoarding('confirmed', '2025-07-10', '2025-07-15');
        $freeRoom = HotelRoom::factory()->create(['status' => 'available']);

        $response = $this->postJson('/api/chatbot/workflow/hotel-bookings', [
            'pet_id' => $pet->id,
            'check_in' => '2025-07-12',
            'check_out' => '2025-07-18',
        ], $this->withAuth($this->customerUser));

        $response->assertStatus(201);
        $this->assertSame($freeRoom->id, $response->json('boarding.hotel_room_id'));
    }

    private function roomWithBoarding(string $status, string $checkIn, string $checkOut): array
    {
        $room = HotelRoom::factory()->create(['status' => 'available']);
        $pet = Pet::factory()->create(['customer_id' => $this->customer->id]);

        Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $this->customer->id,
            'hotel_room_id' => $room->id,
            'check_in' => $checkIn,
            'check_out' => $checkOut,
            'status' => $status,
        ]);

        return [$room, $pet];
    }

    // ----------------------------------------------------------
    // P0-4 — Workflow RBAC
    // ----------------------------------------------------------

    public function test_cashier_cannot_create_hotel_booking_via_chatbot(): void
    {
        $pet = Pet::factory()->create(['customer_id' => $this->customer->id]);
        $room = HotelRoom::factory()->create(['status' => 'available']);

        $response = $this->postJson('/api/chatbot/workflow/hotel-bookings', [
            'pet_id' => $pet->id,
            'hotel_room_id' => $room->id,
            'check_in' => '2025-08-01',
            'check_out' => '2025-08-05',
        ], $this->withAuth($this->cashier));

        $response->assertStatus(403);
    }

    public function test_inventory_cannot_create_hotel_booking_via_chatbot(): void
    {
        $pet = Pet::factory()->create(['customer_id' => $this->customer->id]);
        $room = HotelRoom::factory()->create(['status' => 'available']);

        $response = $this->postJson('/api/chatbot/workflow/hotel-bookings', [
            'pet_id' => $pet->id,
            'hotel_room_id' => $room->id,
            'check_in' => '2025-08-01',
            'check_out' => '2025-08-05',
        ], $this->withAuth($this->inventory));

        $response->assertStatus(403);
    }

    public function test_inventory_cannot_lookup_appointments(): void
    {
        $response = $this->postJson('/api/chatbot/workflow/appointments/lookup', [
            'date' => '2025-08-01',
        ], $this->withAuth($this->inventory));

        $response->assertStatus(403);
    }

    public function test_receptionist_can_still_create_hotel_booking(): void
    {
        $pet = Pet::factory()->create(['customer_id' => $this->customer->id]);
        $room = HotelRoom::factory()->create(['status' => 'available']);

        $response = $this->postJson('/api/chatbot/workflow/hotel-bookings', [
            'pet_id' => $pet->id,
            'hotel_room_id' => $room->id,
            'check_in' => '2025-08-01',
            'check_out' => '2025-08-05',
        ], $this->withAuth($this->receptionist));

        $response->assertStatus(201);
    }

    public function test_read_only_workflow_options_open_to_staff(): void
    {
        foreach ([$this->cashier, $this->inventory, $this->receptionist] as $user) {
            $this->getJson('/api/chatbot/workflow/hotel-options', $this->withAuth($user))
                ->assertStatus(200);
            $this->getJson('/api/chatbot/workflow/booking-options', $this->withAuth($user))
                ->assertStatus(200);
        }
    }

    // ----------------------------------------------------------
    // P1-6 — Customer-private payment intents must not shadow staff
    // ----------------------------------------------------------

    public function test_staff_payment_message_does_not_trigger_customer_payment_intent(): void
    {
        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'show me the payment proofs I need to verify',
        ], $this->withAuth($this->cashier));

        $response->assertStatus(200);
        // Cashier hits the staff "pending_payments" system intent, not the
        // customer-private check_payment_status / upload_payment_help intent.
        $log = ChatbotLog::where('user_id', $this->cashier->id)->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertNotContains(
            $log->intent,
            ['check_payment_status', 'upload_payment_help', 'payment_history']
        );
    }

    public function test_customer_payment_message_still_reaches_customer_intent(): void
    {
        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'how do I upload my payment proof?',
        ], $this->withAuth($this->customerUser));

        $response->assertStatus(200);
        $log = ChatbotLog::where('user_id', $this->customerUser->id)->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('upload_payment_help', $log->intent);
    }

    // ----------------------------------------------------------
    // P1-7 — FAQ cache invalidation on admin CRUD
    // ----------------------------------------------------------

    public function test_faq_create_update_delete_clear_cache(): void
    {
        $payload = [
            'question' => 'Cache invalidation test question?',
            'answer' => 'Cache invalidation test answer.',
            'keywords' => ['cache', 'invalidation'],
            'scope' => 'general',
        ];

        // Create
        Cache::put('chatbot_faqs_all', collect(['stale']));
        $create = $this->postJson('/api/admin/chatbot/faqs', $payload, $this->withAuth($this->admin));
        $create->assertStatus(201);
        $this->assertFalse(Cache::has('chatbot_faqs_all'));

        $faqId = $create->json('data.id');

        // Update
        Cache::put('chatbot_faqs_all', collect(['stale']));
        $this->putJson("/api/admin/chatbot/faqs/{$faqId}", $payload + ['answer' => 'Updated.'], $this->withAuth($this->admin))
            ->assertStatus(200);
        $this->assertFalse(Cache::has('chatbot_faqs_all'));

        // Delete
        Cache::put('chatbot_faqs_all', collect(['stale']));
        $this->deleteJson("/api/admin/chatbot/faqs/{$faqId}", [], $this->withAuth($this->admin))
            ->assertStatus(200);
        $this->assertFalse(Cache::has('chatbot_faqs_all'));
    }

    // ----------------------------------------------------------
    // P1-8 — conversation_id persisted in chatbot log metadata
    // ----------------------------------------------------------

    public function test_conversation_id_is_persisted_in_log_metadata(): void
    {
        $conversationId = '550e8400-e29b-41d4-a716-446655440000';

        $this->postJson('/api/chatbot/message', [
            'message' => 'hello there',
            'context' => ['conversation_id' => $conversationId],
        ], $this->withAuth($this->customerUser))->assertStatus(200);

        $log = ChatbotLog::where('user_id', $this->customerUser->id)->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame($conversationId, $log->metadata['conversation_id'] ?? null);
        // Pre-existing session_id field must still be present
        $this->assertNotEmpty($log->metadata['session_id'] ?? null);
    }

    // ----------------------------------------------------------
    // P0-1 — Gemini AI path
    // ----------------------------------------------------------

    public function test_ai_eligible_intent_uses_gemini_with_header_auth(): void
    {
        config([
            'chatbot.ai_enabled' => true,
            'chatbot.ai_api_key' => 'test-fake-key-123',
            'chatbot.ai_model' => 'gemini-2.0-flash',
            'chatbot.ai_max_tokens' => 321,
            'chatbot.hybrid_mode' => 'faq_first',
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [['text' => 'AI-RESPONSE-TEXT from Gemini.']]],
                ]],
            ], 200),
        ]);

        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'tell me something interesting about tropical fish care',
        ], $this->withAuth($this->customerUser));

        $response->assertStatus(200);
        $this->assertSame('AI-RESPONSE-TEXT from Gemini.', $response->json('reply'));
        $this->assertSame('ai', $response->json('source'));

        Http::assertSent(function ($request) {
            return $request->hasHeader('x-goog-api-key', 'test-fake-key-123')
                && !str_contains($request->url(), 'key=')
                && ($request->data()['generationConfig']['maxOutputTokens'] ?? null) === 321;
        });
    }

    public function test_disabled_ai_falls_back_without_error(): void
    {
        config([
            'chatbot.ai_enabled' => false,
            'chatbot.ai_api_key' => null,
        ]);

        Http::fake();

        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'tell me something interesting about tropical fish care',
        ], $this->withAuth($this->customerUser));

        $response->assertStatus(200);
        $this->assertNotEmpty($response->json('reply'));
        Http::assertNothingSent();
    }

    public function test_ai_failure_falls_back_to_canned_response(): void
    {
        config([
            'chatbot.ai_enabled' => true,
            'chatbot.ai_api_key' => 'test-fake-key-123',
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response(['error' => 'boom'], 500),
        ]);

        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'tell me something interesting about tropical fish care',
        ], $this->withAuth($this->customerUser));

        $response->assertStatus(200);
        $this->assertNotEmpty($response->json('reply'));
    }

    public function test_ai_timeout_and_token_config_is_honored(): void
    {
        config([
            'chatbot.ai_enabled' => true,
            'chatbot.ai_api_key' => 'key',
            'chatbot.ai_timeout' => 12,
            'chatbot.ai_max_tokens' => 77,
        ]);

        $service = new \App\Services\Chatbot\AiChatbotService();

        $timeout = new \ReflectionProperty($service, 'timeout');
        $timeout->setAccessible(true);
        $maxTokens = new \ReflectionProperty($service, 'maxTokens');
        $maxTokens->setAccessible(true);

        $this->assertSame(12, $timeout->getValue($service));
        $this->assertSame(77, $maxTokens->getValue($service));
    }
}
