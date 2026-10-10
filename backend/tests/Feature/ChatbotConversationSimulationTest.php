<?php

namespace Tests\Feature;

use App\Models\ChatbotFaq;
use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Chatbot Conversation Simulation Tests
 * 
 * Simulates realistic chatbot conversations for each user role/dashboard:
 * - Admin: System queries, user management, reports
 * - Cashier: POS help, inventory checks, transactions
 * - Receptionist: Appointments, check-ins, customer service
 * - Veterinary: Medical records, treatments, appointments
 * - Customer: Services, bookings, pet info, general inquiries
 */
class ChatbotConversationSimulationTest extends TestCase
{
    use RefreshDatabase;

    protected $admin;
    protected $cashier;
    protected $receptionist;
    protected $veterinary;
    protected $customerUser;
    protected $customer;

    protected function setUp(): void
    {
        parent::setUp();
        
        $this->admin = User::factory()->create([
            'role' => 'admin',
            'name' => 'Admin User',
        ]);
        
        $this->cashier = User::factory()->create([
            'role' => 'cashier',
            'name' => 'Cashier User',
        ]);
        
        $this->receptionist = User::factory()->create([
            'role' => 'receptionist',
            'name' => 'Receptionist User',
        ]);
        
        $this->veterinary = User::factory()->create([
            'role' => 'veterinary',
            'name' => 'Veterinary User',
        ]);
        
        $this->customerUser = User::factory()->create([
            'role' => 'customer',
            'name' => 'John Customer',
            'email' => 'john@example.com',
        ]);
        
        $this->customer = Customer::factory()->create([
            'name' => 'John Customer',
            'email' => 'john@example.com',
        ]);
        
        // Create test data
        $this->seedTestData();
        $this->seedChatbotFaqs();
    }

    protected function withAuth(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('test-token')->plainTextToken];
    }

    protected function seedTestData(): void
    {
        // Services
        Service::factory()->create(['name' => 'Pet Grooming', 'category' => 'Grooming', 'price' => 500]);
        Service::factory()->create(['name' => 'Vaccination', 'category' => 'Vaccination', 'price' => 800]);
        Service::factory()->create(['name' => 'Consultation', 'category' => 'Consultation', 'price' => 300]);
        
        // Inventory
        InventoryItem::factory()->create(['name' => 'Dog Food Premium', 'sku' => 'DOG-FOOD-001', 'stock' => 50, 'price' => 850]);
        InventoryItem::factory()->create(['name' => 'Cat Toy', 'sku' => 'CAT-TOY-001', 'stock' => 30, 'price' => 350]);
        InventoryItem::factory()->create(['name' => 'Pet Shampoo', 'sku' => 'SHAMPOO-001', 'stock' => 20, 'price' => 250]);
        
        // Hotel Rooms
        HotelRoom::factory()->create(['room_number' => '101', 'type' => 'standard', 'daily_rate' => 500]);
        HotelRoom::factory()->create(['room_number' => '102', 'type' => 'deluxe', 'daily_rate' => 800]);
        
        // Pets for customer
        Pet::factory()->create([
            'customer_id' => $this->customer->id,
            'name' => 'Buddy',
            'species' => 'Dog',
            'breed' => 'Golden Retriever',
        ]);
        
        Pet::factory()->create([
            'customer_id' => $this->customer->id,
            'name' => 'Whiskers',
            'species' => 'Cat',
            'breed' => 'Persian',
        ]);
    }

    protected function seedChatbotFaqs(): void
    {
        ChatbotFaq::create([
            'question' => 'What are your operating hours?',
            'answer' => 'We are open Monday to Saturday from 10:00 AM to 6:00 PM.',
            'category' => 'general',
            'is_active' => true,
        ]);
        
        ChatbotFaq::create([
            'question' => 'How much is pet grooming?',
            'answer' => 'Our pet grooming services start at ₱500 depending on the size and breed of your pet.',
            'category' => 'services',
            'is_active' => true,
        ]);
        
        ChatbotFaq::create([
            'question' => 'Do you offer vaccinations?',
            'answer' => 'Yes, we offer complete vaccination packages for dogs and cats starting at ₱800.',
            'category' => 'services',
            'is_active' => true,
        ]);
    }

    protected function simulateConversation(User $user, array $messages): array
    {
        $responses = [];
        
        foreach ($messages as $message) {
            $response = $this->postJson('/api/chatbot/message', [
                'message' => $message,
                'channel' => 'web',
            ], $this->withAuth($user));
            
            $responses[] = $response->json();
        }
        
        return $responses;
    }

    // ============================================
    // CUSTOMER CONVERSATION SIMULATION
    // ============================================

    public function test_customer_conversation_about_services_and_pricing(): void
    {
        $conversation = [
            'Hello! What services do you offer?',
            'How much is pet grooming?',
            'Do you have vaccination services?',
            'What are your operating hours?',
        ];
        
        $responses = $this->simulateConversation($this->customerUser, $conversation);
        
        // Verify all responses have content
        foreach ($responses as $response) {
            $this->assertArrayHasKey('reply', $response);
            $this->assertNotEmpty($response['reply']);
        }
        
        // Check for specific service mentions in responses
        $combinedText = strtolower(implode(' ', array_column($responses, 'reply')));
        $this->assertStringContainsString('grooming', $combinedText);
        $this->assertStringContainsString('vaccination', $combinedText);
        // Check for hours info (flexible: "operating hours", "open", or time patterns)
        $hasHoursInfo = str_contains($combinedText, 'operating hours') ||
                       str_contains($combinedText, 'open') ||
                       str_contains($combinedText, 'am') ||
                       str_contains($combinedText, 'pm');
        $this->assertTrue($hasHoursInfo, 'Response should contain operating hours information');
    }

    public function test_customer_conversation_about_inventory_search(): void
    {
        $conversation = [
            'Do you have dog food?',
            'What about cat toys?',
            'How much is pet shampoo?',
        ];
        
        $responses = $this->simulateConversation($this->customerUser, $conversation);
        
        foreach ($responses as $response) {
            $this->assertArrayHasKey('reply', $response);
            $this->assertNotEmpty($response['reply']);
        }
        
        // Check inventory-related terms
        $combinedText = strtolower(implode(' ', array_column($responses, 'reply')));
        $this->assertStringContainsString('food', $combinedText);
    }

    public function test_customer_conversation_about_booking_appointment(): void
    {
        // First get welcome to establish context
        $welcome = $this->getJson('/api/chatbot/welcome', $this->withAuth($this->customerUser));
        $welcome->assertStatus(200);
        
        $conversation = [
            'I want to book an appointment',
            'For my dog Buddy',
            'Grooming service',
            'This Saturday',
        ];
        
        $responses = $this->simulateConversation($this->customerUser, $conversation);
        
        foreach ($responses as $response) {
            $this->assertArrayHasKey('reply', $response);
            $this->assertNotEmpty($response['reply']);
        }
        
        // Should suggest booking workflow
        $lastResponse = end($responses);
        $this->assertArrayHasKey('suggestions', $lastResponse);
    }

    // ============================================
    // CASHIER CONVERSATION SIMULATION
    // ============================================

    public function test_cashier_conversation_pos_help(): void
    {
        $conversation = [
            'How do I process a refund?',
            'How do I check inventory stock?',
            'What payment methods do we accept?',
        ];
        
        $responses = $this->simulateConversation($this->cashier, $conversation);
        
        foreach ($responses as $response) {
            $this->assertArrayHasKey('reply', $response);
            $this->assertNotEmpty($response['reply']);
        }
        
        // Cashier should get role-specific suggestions
        $firstResponse = $responses[0];
        $this->assertArrayHasKey('role', $firstResponse);
        $this->assertEquals('cashier', $firstResponse['role']);
    }

    public function test_cashier_inventory_check_conversation(): void
    {
        // Search for specific items
        $search1 = $this->postJson('/api/chatbot/workflow/inventory/search', [
            'query' => 'dog food',
        ], $this->withAuth($this->cashier));
        
        $search1->assertStatus(200);
        $items = $search1->json();
        $this->assertNotEmpty($items);
        
        // Search for another item
        $search2 = $this->postJson('/api/chatbot/workflow/inventory/search', [
            'query' => 'shampoo',
        ], $this->withAuth($this->cashier));
        
        $search2->assertStatus(200);
        $this->assertNotEmpty($search2->json());
    }

    // ============================================
    // RECEPTIONIST CONVERSATION SIMULATION
    // ============================================

    public function test_receptionist_conversation_check_ins(): void
    {
        $conversation = [
            'How do I check in a boarding guest?',
            'Show me today\'s appointments',
            'How do I book a hotel room?',
        ];
        
        $responses = $this->simulateConversation($this->receptionist, $conversation);
        
        foreach ($responses as $response) {
            $this->assertArrayHasKey('reply', $response);
            $this->assertNotEmpty($response['reply']);
            $this->assertEquals('receptionist', $response['role']);
        }
    }

    public function test_receptionist_hotel_workflow(): void
    {
        // Get hotel options
        $options = $this->getJson('/api/chatbot/workflow/hotel-options', $this->withAuth($this->receptionist));
        $options->assertStatus(200);
        
        $this->assertArrayHasKey('rooms', $options->json());
        $this->assertNotEmpty($options->json('rooms'));
        
        // Check availability
        $availability = $this->getJson(
            '/api/chatbot/workflow/hotel/availability?' . http_build_query([
                'check_in' => now()->addDay()->format('Y-m-d'),
                'check_out' => now()->addDays(3)->format('Y-m-d'),
            ]),
            $this->withAuth($this->receptionist)
        );
        
        $availability->assertStatus(200);
        $this->assertArrayHasKey('available_rooms', $availability->json());
    }

    // ============================================
    // VETERINARY CONVERSATION SIMULATION
    // ============================================

    public function test_veterinary_conversation_medical_queries(): void
    {
        $conversation = [
            'Show me today\'s consultations',
            'How do I access patient records?',
            'What vaccinations are due this week?',
        ];
        
        $responses = $this->simulateConversation($this->veterinary, $conversation);
        
        foreach ($responses as $response) {
            $this->assertArrayHasKey('reply', $response);
            $this->assertNotEmpty($response['reply']);
            $this->assertEquals('veterinary', $response['role']);
        }
    }

    // ============================================
    // ADMIN CONVERSATION SIMULATION
    // ============================================

    public function test_admin_conversation_system_queries(): void
    {
        $conversation = [
            'Show me system summary',
            'How many users are registered?',
            'What\'s today\'s revenue?',
            'Any low stock alerts?',
        ];
        
        $responses = $this->simulateConversation($this->admin, $conversation);
        
        foreach ($responses as $response) {
            $this->assertArrayHasKey('reply', $response);
            $this->assertNotEmpty($response['reply']);
            $this->assertEquals('admin', $response['role']);
        }
    }

    public function test_admin_can_view_chatbot_logs_after_conversations(): void
    {
        // Generate some chatbot activity
        $this->simulateConversation($this->customerUser, [
            'What services do you offer?',
            'How much is grooming?',
        ]);
        
        $this->simulateConversation($this->cashier, [
            'How do I process a sale?',
        ]);
        
        // Admin views logs
        $logs = $this->getJson('/api/admin/chatbot/logs', $this->withAuth($this->admin));
        $logs->assertStatus(200);
        
        $logData = $logs->json('data');
        $this->assertNotEmpty($logData);
        
        // Find customer in logs
        $customerLog = collect($logData)->first(
            fn($log) => $log['user_id'] === $this->customerUser->id
        );
        $this->assertNotNull($customerLog);
        $this->assertEquals('customer', $customerLog['user_role']);
        $this->assertGreaterThanOrEqual(2, $customerLog['total_chats']);
        
        // View detailed history
        $history = $this->getJson(
            "/api/admin/chatbot/logs/user/{$this->customerUser->id}",
            $this->withAuth($this->admin)
        );
        
        $history->assertStatus(200);
        $this->assertNotEmpty($history->json('data'));
    }

    // ============================================
    // MULTI-USER CONVERSATION SCENARIOS
    // ============================================

    public function test_simultaneous_conversations_different_roles(): void
    {
        // Customer asks about services
        $customerResponse = $this->postJson('/api/chatbot/message', [
            'message' => 'What services do you offer?',
            'channel' => 'web',
        ], $this->withAuth($this->customerUser));
        
        // Cashier asks about POS
        $cashierResponse = $this->postJson('/api/chatbot/message', [
            'message' => 'How do I process a refund?',
            'channel' => 'web',
        ], $this->withAuth($this->cashier));
        
        // Admin asks about system
        $adminResponse = $this->postJson('/api/chatbot/message', [
            'message' => 'Show me system summary',
            'channel' => 'web',
        ], $this->withAuth($this->admin));
        
        // All should succeed with role-specific responses
        $customerResponse->assertStatus(200);
        $cashierResponse->assertStatus(200);
        $adminResponse->assertStatus(200);
        
        // Verify different roles get different context
        $this->assertEquals('customer', $customerResponse->json('role'));
        $this->assertEquals('cashier', $cashierResponse->json('role'));
        $this->assertEquals('admin', $adminResponse->json('role'));
        
        // Verify suggestions are different per role
        $customerSuggestions = $customerResponse->json('suggestions') ?? [];
        $cashierSuggestions = $cashierResponse->json('suggestions') ?? [];
        $adminSuggestions = $adminResponse->json('suggestions') ?? [];
        
        // Each role should have relevant suggestions
        $this->assertNotEmpty($customerSuggestions, 'Customer should have suggestions');
        $this->assertNotEmpty($cashierSuggestions, 'Cashier should have suggestions');
        $this->assertNotEmpty($adminSuggestions, 'Admin should have suggestions');
    }

    // ============================================
    // CONTEXTUAL FOLLOW-UP CONVERSATIONS
    // ============================================

    public function test_contextual_conversation_flow(): void
    {
        // Step 1: Initial greeting
        $response1 = $this->postJson('/api/chatbot/message', [
            'message' => 'Hi there!',
            'channel' => 'web',
        ], $this->withAuth($this->customerUser));
        
        $response1->assertStatus(200);
        $this->assertArrayHasKey('reply', $response1->json());
        
        // Step 2: Ask about services
        $response2 = $this->postJson('/api/chatbot/message', [
            'message' => 'What services do you have?',
            'channel' => 'web',
        ], $this->withAuth($this->customerUser));
        
        $response2->assertStatus(200);
        $response2Data = $response2->json();
        $this->assertArrayHasKey('reply', $response2Data);
        $this->assertArrayHasKey('intent', $response2Data);
        
        // Step 3: Follow-up about specific service
        $response3 = $this->postJson('/api/chatbot/message', [
            'message' => 'Tell me more about grooming',
            'channel' => 'web',
        ], $this->withAuth($this->customerUser));
        
        $response3->assertStatus(200);
        $this->assertArrayHasKey('reply', $response3->json());
        
        // Step 4: Ask about pricing
        $response4 = $this->postJson('/api/chatbot/message', [
            'message' => 'How much does it cost?',
            'channel' => 'web',
        ], $this->withAuth($this->customerUser));
        
        $response4->assertStatus(200);
        $this->assertArrayHasKey('reply', $response4->json());
        
        // Verify all responses maintain consistent context
        $this->assertEquals('customer', $response1->json('role'));
        $this->assertEquals('customer', $response2->json('role'));
        $this->assertEquals('customer', $response3->json('role'));
        $this->assertEquals('customer', $response4->json('role'));
    }
}
