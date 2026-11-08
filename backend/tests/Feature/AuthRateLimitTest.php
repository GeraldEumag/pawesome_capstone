<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class AuthRateLimitTest extends TestCase
{
    use \Illuminate\Foundation\Testing\RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('array', config('cache.default'));
        Cache::flush();
    }

    public function test_repeated_login_attempts_are_limited_and_recover(): void
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/auth/login', ['login' => 'rate-limit@example.com'])->assertUnprocessable();
        }

        $this->postJson('/api/auth/login', ['login' => 'rate-limit@example.com'])
            ->assertTooManyRequests()->assertHeader('Retry-After');

        $this->travel(61)->seconds();

        $this->postJson('/api/auth/login', ['login' => 'rate-limit@example.com'])->assertUnprocessable();
    }

    public function test_rotating_login_identifiers_cannot_bypass_the_ip_limit(): void
    {
        config(['app.api_rate_limit_per_minute' => 10]);

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->postJson('/api/auth/login', ['login' => "rate-{$attempt}@example.com"])->assertUnprocessable();
        }

        $this->postJson('/api/auth/login', ['login' => 'another-account@example.com'])
            ->assertTooManyRequests()->assertHeader('Retry-After');
    }

    public function test_ip_limit_does_not_block_another_ip(): void
    {
        config(['app.api_rate_limit_per_minute' => 2]);

        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.1']);
        $this->postJson('/api/auth/login', ['login' => 'one@example.com'])->assertUnprocessable();
        $this->postJson('/api/auth/login', ['login' => 'two@example.com'])->assertUnprocessable();
        $this->postJson('/api/auth/login', ['login' => 'three@example.com'])->assertTooManyRequests();

        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2']);
        $this->postJson('/api/auth/login', ['login' => 'four@example.com'])->assertUnprocessable();
    }

    public function test_general_api_limit_uses_the_token_owner_not_the_shared_ip(): void
    {
        config(['app.api_rate_limit_per_minute' => 2]);
        $first = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $second = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $firstToken = $first->createToken('first')->plainTextToken;
        $secondToken = $second->createToken('second')->plainTextToken;

        $this->withToken($firstToken)->getJson('/api/auth/me')->assertOk();
        $this->withToken($firstToken)->getJson('/api/auth/me')->assertOk();
        $this->withToken($firstToken)->getJson('/api/auth/me')->assertTooManyRequests();
        $this->withToken($secondToken)->getJson('/api/auth/me')->assertOk();
    }
}
