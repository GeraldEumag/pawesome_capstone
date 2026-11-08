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

    public function test_expired_token_cannot_authenticate(): void
    {
        $token = $this->user()->createToken('expired', ['*'], now()->subMinute());

        $this->withToken($token->plainTextToken)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_token_older_than_configured_lifetime_cannot_authenticate(): void
    {
        config(['sanctum.expiration' => 60]);
        $token = $this->user()->createToken('old');
        $token->accessToken->forceFill(['created_at' => now()->subMinutes(61)])->save();

        $this->withToken($token->plainTextToken)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_unexpired_token_can_authenticate_with_configured_lifetime(): void
    {
        config(['sanctum.expiration' => 60]);
        $user = $this->user();
        $token = $user->createToken('valid', ['*'], now()->addHour());

        $this->withToken($token->plainTextToken)->getJson('/api/auth/me')
            ->assertOk()->assertJsonPath('id', $user->id);
    }

    public function test_revoked_token_cannot_authenticate(): void
    {
        $token = $this->user()->createToken('revoked');
        $token->accessToken->delete();

        $this->withToken($token->plainTextToken)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_me_uses_authenticated_bearer_identity_when_a_different_cookie_is_present(): void
    {
        $user = $this->user();
        $otherUser = $this->user(['role' => 'admin']);
        $token = $user->createToken('bearer');
        $cookieToken = $otherUser->createToken('cookie');

        $this->withCredentials()->withUnencryptedCookie('auth_token', $cookieToken->plainTextToken)
            ->withToken($token->plainTextToken)->getJson('/api/auth/me')
            ->assertOk()->assertJsonPath('id', $user->id);
    }

    public function test_me_endpoint_without_token_is_unauthorized(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }
}
