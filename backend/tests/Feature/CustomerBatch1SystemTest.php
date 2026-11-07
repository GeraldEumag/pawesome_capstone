<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Pet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CustomerBatch1SystemTest extends TestCase
{
    use RefreshDatabase;

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('batch1-test')->plainTextToken];
    }

    private function customer(bool $verified = true, array $attrs = []): array
    {
        $user = User::factory()->create(array_merge([
            'role' => 'customer',
            'is_active' => true,
            'password' => Hash::make('Password123!'),
            'email_verified_at' => $verified ? now() : null,
        ], $attrs));
        $customer = Customer::factory()->create(['user_id' => $user->id, 'email' => $user->email]);
        return [$user, $customer];
    }

    public function test_public_health_and_settings_endpoints_respond(): void
    {
        $this->getJson('/api/health')->assertOk();
        $this->getJson('/api/settings/public')->assertOk();
        $this->getJson('/api/landing-page')->assertOk();
    }

    public function test_register_creates_an_unverified_customer_and_returns_a_token(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'New Customer',
            'first_name' => 'New',
            'last_name' => 'Customer',
            'username' => 'batch1_new_customer',
            'email' => 'batch1.new@example.com',
            'password' => 'Password123!',
        ])
            ->assertStatus(201)
            ->assertJsonStructure(['message', 'user', 'token']);

        $this->assertDatabaseHas('users', [
            'email' => 'batch1.new@example.com',
            'role' => 'customer',
            'email_verified_at' => null,
        ]);
    }

    public function test_register_rejects_a_duplicate_email(): void
    {
        $this->customer(true, ['email' => 'taken@example.com']);

        $this->postJson('/api/auth/register', [
            'name' => 'Dup',
            'first_name' => 'Dup',
            'last_name' => 'User',
            'username' => 'batch1_dup_user',
            'email' => 'taken@example.com',
            'password' => 'Password123!',
        ])->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_login_accepts_email_and_username(): void
    {
        [$user] = $this->customer(true, ['email' => 'login.both@example.com', 'username' => 'batch1_login']);

        $this->postJson('/api/auth/login', ['login' => 'login.both@example.com', 'password' => 'Password123!'])
            ->assertOk()->assertJsonPath('user.id', $user->id);
        $this->postJson('/api/auth/login', ['login' => 'batch1_login', 'password' => 'Password123!'])
            ->assertOk()->assertJsonPath('user.id', $user->id);
    }

    public function test_me_endpoint_requires_a_token(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
        [$user] = $this->customer();
        $this->withHeaders($this->headers($user))->getJson('/api/auth/me')->assertOk()->assertJsonPath('id', $user->id);
    }

    public function test_forgot_password_gives_the_same_answer_for_unknown_emails(): void
    {
        $this->postJson('/api/auth/password/forgot', ['email' => 'nobody-here@example.com'])
            ->assertOk()
            ->assertJsonPath('message', 'If the email address is associated with an account, a password reset token has been sent to that email.');
    }

    public function test_resend_verification_is_generic_for_unknown_emails(): void
    {
        $this->postJson('/api/auth/email/resend', ['email' => 'nobody-here@example.com'])->assertOk();
    }

    public function test_profile_update_changes_the_name(): void
    {
        [$user] = $this->customer();

        $this->withHeaders($this->headers($user))
            ->putJson('/api/auth/profile', ['name' => 'Renamed Customer', 'first_name' => 'Renamed', 'last_name' => 'Customer'])
            ->assertOk();

        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'Renamed Customer']);
    }

    public function test_customer_portal_requires_customer_role(): void
    {
        $this->getJson('/api/customer/overview')->assertStatus(401);

        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $this->withHeaders($this->headers($admin))->getJson('/api/customer/overview')->assertForbidden();

        [$customer] = $this->customer();
        $this->withHeaders($this->headers($customer))->getJson('/api/customer/overview')->assertOk();
    }

    public function test_unverified_customer_cannot_submit_a_service_request(): void
    {
        [$user] = $this->customer(false);

        $this->withHeaders($this->headers($user))
            ->postJson('/api/customer/requests', ['request_type' => 'grooming'])
            ->assertForbidden()
            ->assertJsonPath('email_unverified', true);
    }

    public function test_customer_pet_list_only_shows_own_pets(): void
    {
        [$owner, $ownerCustomer] = $this->customer();
        [, $otherCustomer] = $this->customer();

        $mine = Pet::factory()->create(['customer_id' => $ownerCustomer->id, 'name' => 'Batch1Mine']);
        Pet::factory()->create(['customer_id' => $otherCustomer->id, 'name' => 'Batch1Theirs']);

        $response = $this->withHeaders($this->headers($owner))->getJson('/api/customer/pets');
        $response->assertOk();
        $body = $response->getContent();
        $this->assertStringContainsString($mine->name, $body);
        $this->assertStringNotContainsString('Batch1Theirs', $body);
    }

    public function test_customer_cannot_read_another_customers_service_request_receipt(): void
    {
        [$owner, $ownerCustomer] = $this->customer();
        [$intruder] = $this->customer();

        $request = \App\Models\ServiceRequest::create([
            'customer_name' => $ownerCustomer->name,
            'customer_email' => $ownerCustomer->email,
            'request_type' => 'grooming',
            'service_name' => 'Bath and Brush',
            'request_date' => now()->addDays(3)->toDateString(),
            'request_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'online',
        ]);

        $this->withHeaders($this->headers($intruder))
            ->getJson("/api/customer/requests/{$request->id}/receipt")
            ->assertNotFound();

        $this->withHeaders($this->headers($owner))
            ->getJson("/api/customer/requests/{$request->id}/receipt")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Receipt is only available after payment verification.');
    }

    public function test_notification_preferences_round_trip(): void
    {
        [$user] = $this->customer();
        $headers = $this->headers($user);

        $this->withHeaders($headers)->getJson('/api/customer/notification-preferences')->assertOk();
        $this->withHeaders($headers)
            ->putJson('/api/customer/notification-preferences', ['email' => false])
            ->assertOk();
        $this->withHeaders($headers)->getJson('/api/customer/notification-preferences')->assertOk();
    }
}
