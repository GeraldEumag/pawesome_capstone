<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * End-to-End Chatbot Tests
 * 
 * Tests chatbot functionality across all dashboards and user roles:
 * - Admin: View chatbot logs, manage FAQs
 * - All roles: Interact with chatbot (welcome, message)
 * - Customer: Booking workflows, inventory search
 * - Workflows: Inventory search, booking options, hotel availability
 */
class ChatbotEndToEndTest extends TestCase
{
    use RefreshDatabase;

    protected $admin;
    protected $cashier;
    protected $receptionist;
    protected $veterinary;
    protected $customer;
    protected $customerUser;

    protected function setUp(): void
    {
        parent::setUp();
        
        // Create users for each role
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
            'name' => 'Customer User',
            'email' => 'customer@example.com',
        ]);
        
        // Create customer profile linked to user
        $this->customer = Customer::factory()->create([
            'name' => 'Customer User',
            'email' => 'customer@example.com',
        ]);
        
        // Create test data for workflows
        Service::factory()->count(3)->create();
        InventoryItem::factory()->count(5)->create(['status' => 'active']);
        HotelRoom::factory()->count(3)->create(['status' => 'available']);
    }

    protected function withAuth(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('test-token')->plainTextToken];
    }

    // ============================================
    // ADMIN DASHBOARD - CHATBOT LOGS
    // ============================================

    public function test_admin_can_view_chatbot_logs(): void
    {
        $response = $this->getJson('/api/admin/chatbot/logs', $this->withAuth($this->admin));
        
        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'data' => [
                    '*' => [
                        'id',
                        'intent',
                        'scope',
                        'user_message',
                        'bot_response',
                        'created_at',
                    ],
                ],
            ]);
    }

    public function test_admin_can_view_user_chat_history(): void
    {
        // First, create a chat log by having the customer send a message
        $this->postJson('/api/chatbot/message', [
            'message' => 'Hello, I need help with my pet',
            'channel' => 'web',
        ], $this->withAuth($this->customerUser));
        
        // Admin views the user's chat history
        $response = $this->getJson(
            "/api/admin/chatbot/logs/user/{$this->customerUser->id}",
            $this->withAuth($this->admin)
        );
        
        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'data' => [
                    '*' => [
                        'id',
                        'intent',
                        'scope',
                        'user_message',
                        'bot_response',
                        'created_at',
                    ],
                ],
            ]);
    }

    // ============================================
    // CHATBOT INTERACTION - ALL ROLES
    // ============================================

    // Individual role tests for welcome messages
    public function test_admin_can_get_welcome_message(): void
    {
        $response = $this->getJson('/api/chatbot/welcome', $this->withAuth($this->admin));
        $response->assertStatus(200);
        $this->assertNotEmpty($response->json());
    }

    public function test_cashier_can_get_welcome_message(): void
    {
        $response = $this->getJson('/api/chatbot/welcome', $this->withAuth($this->cashier));
        $response->assertStatus(200);
        $this->assertNotEmpty($response->json());
    }

    public function test_receptionist_can_get_welcome_message(): void
    {
        $response = $this->getJson('/api/chatbot/welcome', $this->withAuth($this->receptionist));
        $response->assertStatus(200);
        $this->assertNotEmpty($response->json());
    }

    public function test_veterinary_can_get_welcome_message(): void
    {
        $response = $this->getJson('/api/chatbot/welcome', $this->withAuth($this->veterinary));
        $response->assertStatus(200);
        $this->assertNotEmpty($response->json());
    }

    public function test_customer_can_get_welcome_message(): void
    {
        $response = $this->getJson('/api/chatbot/welcome', $this->withAuth($this->customerUser));
        $response->assertStatus(200);
        $this->assertNotEmpty($response->json());
    }

    // Individual role tests for sending messages
    public function test_admin_can_send_chatbot_message(): void
    {
        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'What services do you offer?',
            'channel' => 'web',
        ], $this->withAuth($this->admin));
        
        $response->assertStatus(200);
        $this->assertArrayHasKey('reply', $response->json());
    }

    public function test_cashier_can_send_chatbot_message(): void
    {
        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'What services do you offer?',
            'channel' => 'web',
        ], $this->withAuth($this->cashier));
        
        $response->assertStatus(200);
        $this->assertArrayHasKey('reply', $response->json());
    }

    public function test_receptionist_can_send_chatbot_message(): void
    {
        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'What services do you offer?',
            'channel' => 'web',
        ], $this->withAuth($this->receptionist));
        
        $response->assertStatus(200);
        $this->assertArrayHasKey('reply', $response->json());
    }

    public function test_veterinary_can_send_chatbot_message(): void
    {
        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'What services do you offer?',
            'channel' => 'web',
        ], $this->withAuth($this->veterinary));
        
        $response->assertStatus(200);
        $this->assertArrayHasKey('reply', $response->json());
    }

    public function test_customer_can_send_chatbot_message(): void
    {
        $response = $this->postJson('/api/chatbot/message', [
            'message' => 'What services do you offer?',
            'channel' => 'web',
        ], $this->withAuth($this->customerUser));
        
        $response->assertStatus(200);
        $this->assertArrayHasKey('reply', $response->json());
    }

    // ============================================
    // WORKFLOW: INVENTORY SEARCH
    // ============================================

    public function test_chatbot_can_search_inventory(): void
    {
        $response = $this->postJson('/api/chatbot/workflow/inventory/search', [
            'query' => 'dog food',
        ], $this->withAuth($this->customerUser));
        
        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    '*' => [
                        'id',
                        'sku',
                        'name',
                        'stock',
                        'price',
                    ]
                ]
            ]);
    }

    public function test_inventory_search_returns_empty_for_no_matches(): void
    {
        $response = $this->postJson('/api/chatbot/workflow/inventory/search', [
            'query' => 'xyznonexistent12345',
        ], $this->withAuth($this->customerUser));
        
        $response->assertStatus(200);
        $this->assertEmpty($response->json('data'));
    }

    // ============================================
    // WORKFLOW: BOOKING OPTIONS
    // ============================================

    public function test_customer_can_get_booking_options(): void
    {
        // Create a pet for the customer
        Pet::factory()->create([
            'customer_id' => $this->customer->id,
            'name' => 'Buddy',
        ]);
        
        $response = $this->getJson(
            '/api/chatbot/workflow/booking-options',
            $this->withAuth($this->customerUser)
        );
        
        $response->assertStatus(200)
            ->assertJsonStructure([
                'pets' => [
                    '*' => [
                        'id',
                        'name',
                        'species',
                    ]
                ],
                'services' => [
                    '*' => [
                        'id',
                        'name',
                        'price',
                    ]
                ],
            ]);
    }

    public function test_non_customer_can_view_services_but_not_pets(): void
    {
        $response = $this->getJson(
            '/api/chatbot/workflow/booking-options',
            $this->withAuth($this->cashier)
        );
        
        $response->assertStatus(200);
        $this->assertNotEmpty($response->json('services'));
        // Cashier has no pets, so this should be empty
        $this->assertEmpty($response->json('pets'));
    }

    // ============================================
    // WORKFLOW: HOTEL BOOKING
    // ============================================

    public function test_customer_can_view_hotel_options(): void
    {
        Pet::factory()->create([
            'customer_id' => $this->customer->id,
            'name' => 'Buddy',
        ]);
        
        $response = $this->getJson(
            '/api/chatbot/workflow/hotel-options',
            $this->withAuth($this->customerUser)
        );
        
        $response->assertStatus(200)
            ->assertJsonStructure([
                'pets',
                'rooms' => [
                    '*' => [
                        'id',
                        'room_number',
                        'type',
                        'daily_rate',
                    ]
                ],
            ]);
    }

    public function test_customer_can_check_hotel_availability(): void
    {
        $response = $this->getJson(
            '/api/chatbot/workflow/hotel/availability?' . http_build_query([
                'check_in' => now()->addDay()->format('Y-m-d'),
                'check_out' => now()->addDays(3)->format('Y-m-d'),
                'room_type' => 'standard',
            ]),
            $this->withAuth($this->customerUser)
        );
        
        $response->assertStatus(200)
            ->assertJsonStructure([
                'check_in',
                'check_out',
                'available_rooms',
                'count',
            ]);
    }

    // ============================================
    // END-TO-END: COMPLETE CHATBOT FLOW
    // ============================================

    public function test_end_to_end_chatbot_conversation_flow(): void
    {
        // Step 1: Customer sends welcome message
        $welcome = $this->getJson(
            '/api/chatbot/welcome',
            $this->withAuth($this->customerUser)
        );
        $welcome->assertStatus(200);
        
        // Step 2: Customer searches for inventory
        $inventory = $this->postJson(
            '/api/chatbot/workflow/inventory/search',
            ['query' => 'toy'],
            $this->withAuth($this->customerUser)
        );
        $inventory->assertStatus(200);
        
        // Step 3: Customer sends a general message
        $message = $this->postJson(
            '/api/chatbot/message',
            [
                'message' => 'I want to book a grooming appointment',
                'channel' => 'web',
            ],
            $this->withAuth($this->customerUser)
        );
        $message->assertStatus(200);
        
        // Step 4: Admin checks chatbot logs
        $logs = $this->getJson(
            '/api/admin/chatbot/logs',
            $this->withAuth($this->admin)
        );
        $logs->assertStatus(200);
        
        // Verify the customer appears in logs
        $logsData = $logs->json();
        $customerLogs = collect($logsData['data'] ?? $logsData)->filter(
            fn($log) => ($log['user_id'] ?? null) === $this->customerUser->id
        );
        $this->assertGreaterThan(0, $customerLogs->count());
        
        // Step 5: Admin views detailed chat history
        $history = $this->getJson(
            "/api/admin/chatbot/logs/user/{$this->customerUser->id}",
            $this->withAuth($this->admin)
        );
        $history->assertStatus(200);
        $this->assertNotEmpty($history->json());
    }

    // ============================================
    // MULTI-ROLE CONVERSATION TEST
    // ============================================

    public function test_multiple_users_can_use_chatbot_simultaneously(): void
    {
        // Admin sends message
        $adminMsg = $this->postJson('/api/chatbot/message', [
            'message' => 'Admin inquiry about system status',
            'channel' => 'web',
        ], $this->withAuth($this->admin));
        $adminMsg->assertStatus(200);
        
        // Cashier sends message
        $cashierMsg = $this->postJson('/api/chatbot/message', [
            'message' => 'Cashier needs help with POS',
            'channel' => 'web',
        ], $this->withAuth($this->cashier));
        $cashierMsg->assertStatus(200);
        
        // Customer sends message
        $customerMsg = $this->postJson('/api/chatbot/message', [
            'message' => 'Customer asking about services',
            'channel' => 'web',
        ], $this->withAuth($this->customerUser));
        $customerMsg->assertStatus(200);
        
        // Admin views all logs
        $logs = $this->getJson('/api/admin/chatbot/logs', $this->withAuth($this->admin));
        $logs->assertStatus(200);
        
        // Verify all three users appear in logs
        $logsData = $logs->json();
        $userIds = collect($logsData['data'] ?? $logsData)->pluck('user_id')->toArray();
        $this->assertContains($this->admin->id, $userIds);
        $this->assertContains($this->cashier->id, $userIds);
        $this->assertContains($this->customerUser->id, $userIds);
    }
}
