<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthLoginTest extends TestCase
{
    use RefreshDatabase;

    private function user(array $attrs = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'customer',
            'is_active' => true,
            'password' => Hash::make('Password123!'),
        ], $attrs));
    }

    public function test_valid_credentials_return_token_and_user(): void
    {
        $user = $this->user(['email' => 'login.ok@example.com']);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'login.ok@example.com',
            'password' => 'Password123!',
        ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Login successful')
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonStructure(['token']);
    }

    public function test_login_accepts_username_field(): void
    {
        $user = $this->user(['email' => 'by.username@example.com', 'username' => 'pawesome_user']);

        $this->postJson('/api/auth/login', [
            'login' => 'pawesome_user',
            'password' => 'Password123!',
        ])->assertOk()->assertJsonPath('user.id', $user->id);
    }

    public function test_wrong_password_is_rejected_with_invalid_credentials(): void
    {
        $this->user(['email' => 'wrong.pw@example.com']);

        $this->postJson('/api/auth/login', [
            'email' => 'wrong.pw@example.com',
            'password' => 'not-the-password',
        ])->assertStatus(401)->assertJsonPath('message', 'Invalid credentials');
    }

    public function test_unknown_account_gets_the_same_generic_error(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.com',
            'password' => 'Password123!',
        ])->assertStatus(401)->assertJsonPath('message', 'Invalid credentials');
    }

    public function test_inactive_account_cannot_log_in(): void
    {
        $this->user(['email' => 'inactive@example.com', 'is_active' => false]);

        $this->postJson('/api/auth/login', [
            'email' => 'inactive@example.com',
            'password' => 'Password123!',
        ])->assertStatus(403)->assertJsonPath('message', 'Account is inactive');
    }

    public function test_missing_password_fails_validation(): void
    {
        $this->postJson('/api/auth/login', ['email' => 'x@example.com'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_issued_token_authenticates_me_endpoint(): void
    {
        $user = $this->user(['email' => 'me.endpoint@example.com']);
        $token = $this->postJson('/api/auth/login', [
            'email' => 'me.endpoint@example.com',
            'password' => 'Password123!',
        ])->json('token');

        $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('id', $user->id);
    }

    public function test_me_endpoint_without_token_is_unauthorized(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }
}
