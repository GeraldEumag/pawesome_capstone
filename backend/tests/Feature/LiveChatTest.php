<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LiveChatTest extends TestCase
{
    use RefreshDatabase;

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('live-chat-test')->plainTextToken];
    }

    private function customer(): User
    {
        $user = User::factory()->create(['role' => 'customer', 'is_active' => true, 'email_verified_at' => now()]);
        Customer::factory()->create(['user_id' => $user->id, 'email' => $user->email]);
        return $user;
    }

    public function test_customer_can_start_a_live_chat_session(): void
    {
        $customer = $this->customer();

        $this->withHeaders($this->authHeaders($customer))
            ->postJson('/api/chatbot/live-chat/start')
            ->assertStatus(201)
            ->assertJsonPath('session.status', 'waiting');

        $this->assertDatabaseHas('live_chat_sessions', ['customer_id' => $customer->id, 'status' => 'waiting']);
    }

    public function test_starting_a_new_session_closes_the_previous_open_one(): void
    {
        $customer = $this->customer();
        $headers = $this->authHeaders($customer);

        $this->withHeaders($headers)->postJson('/api/chatbot/live-chat/start')->assertStatus(201);
        $this->withHeaders($headers)->postJson('/api/chatbot/live-chat/start')->assertStatus(201);

        $this->assertDatabaseCount('live_chat_sessions', 2);
        $this->assertDatabaseHas('live_chat_sessions', ['customer_id' => $customer->id, 'status' => 'waiting']);
        $this->assertDatabaseHas('live_chat_sessions', ['customer_id' => $customer->id, 'status' => 'closed']);
    }

    public function test_receptionist_sees_waiting_session_in_inbox(): void
    {
        $customer = $this->customer();
        $this->withHeaders($this->authHeaders($customer))->postJson('/api/chatbot/live-chat/start')->assertStatus(201);

        $receptionist = User::factory()->create(['role' => 'receptionist', 'is_active' => true]);

        $this->withHeaders($this->authHeaders($receptionist))
            ->getJson('/api/chatbot/live-chat/inbox')
            ->assertOk()
            ->assertJsonPath('counts.waiting', 1)
            ->assertJsonPath('sessions.0.status', 'waiting');
    }

    public function test_customer_cannot_read_the_staff_inbox(): void
    {
        $this->withHeaders($this->authHeaders($this->customer()))
            ->getJson('/api/chatbot/live-chat/inbox')
            ->assertForbidden();
    }

    public function test_customer_message_is_rejected_after_session_closed(): void
    {
        $customer = $this->customer();
        $headers = $this->authHeaders($customer);

        $sessionId = $this->withHeaders($headers)
            ->postJson('/api/chatbot/live-chat/start')
            ->json('session.id');

        $this->withHeaders($headers)->deleteJson("/api/chatbot/live-chat/{$sessionId}")->assertOk();

        $this->withHeaders($headers)
            ->postJson("/api/chatbot/live-chat/{$sessionId}/message", ['message' => 'Hello?'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This chat session is closed.');
    }
}
