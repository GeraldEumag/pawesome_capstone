<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * F-04: the admin security settings were persisted but never enforced.
 * These tests exercise the real API boundaries — registration, password
 * change/reset, admin user creation, login throttling, token inactivity
 * timeout, and settings authorization.
 */
class SecuritySettingsEnforcementTest extends TestCase
{
    use RefreshDatabase;

    private const STRONG = 'Str0ng!Pass';

    private function registerPayload(string $password): array
    {
        return [
            'name'       => 'Test Customer',
            'first_name' => 'Test',
            'last_name'  => 'Customer',
            'username'   => 'tcust_' . bin2hex(random_bytes(4)),
            'email'      => 'tc_' . bin2hex(random_bytes(4)) . '@example.com',
            'password'   => $password,
        ];
    }

    private function headersFor(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('t')->plainTextToken];
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    /* ---------------- password policy ---------------- */

    public function test_register_enforces_configured_min_length(): void
    {
        SystemSetting::set('security_min_password_length', 12);
        SystemSetting::set('security_require_uppercase', '0');
        SystemSetting::set('security_require_numbers', '0');
        SystemSetting::set('security_require_special_chars', '0');

        $this->postJson('/api/auth/register', $this->registerPayload('abcdefghij'))
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');

        $this->postJson('/api/auth/register', $this->registerPayload('abcdefghijkl'))
            ->assertStatus(201);
    }

    public function test_each_complexity_flag_is_enforced(): void
    {
        // Defaults: min 8 + uppercase + number + symbol required.
        $this->postJson('/api/auth/register', $this->registerPayload('nouppercase1!'))
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->postJson('/api/auth/register', $this->registerPayload('NoNumberHere!'))
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->postJson('/api/auth/register', $this->registerPayload('NoSymbol123'))
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->postJson('/api/auth/register', $this->registerPayload(self::STRONG))
            ->assertStatus(201);
    }

    public function test_disabled_flags_do_not_add_restrictions(): void
    {
        SystemSetting::set('security_require_uppercase', '0');
        SystemSetting::set('security_require_numbers', '0');
        SystemSetting::set('security_require_special_chars', '0');

        $this->postJson('/api/auth/register', $this->registerPayload('simplepass'))
            ->assertStatus(201);
    }

    public function test_invalid_setting_falls_back_to_safe_default(): void
    {
        SystemSetting::set('security_min_password_length', 'not-a-number');

        $this->postJson('/api/auth/register', $this->registerPayload('short'))
            ->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_configured_min_below_floor_never_weakens_registration(): void
    {
        // Admin may configure 6, but registration's previous floor was 8 —
        // the configured value can only strengthen, never weaken.
        SystemSetting::set('security_min_password_length', 6);
        SystemSetting::set('security_require_uppercase', '0');
        SystemSetting::set('security_require_numbers', '0');
        SystemSetting::set('security_require_special_chars', '0');

        $this->postJson('/api/auth/register', $this->registerPayload('abcdefg'))
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->postJson('/api/auth/register', $this->registerPayload('abcdefgh'))
            ->assertStatus(201);
    }

    public function test_change_and_reset_keep_their_eight_char_floor(): void
    {
        SystemSetting::set('security_min_password_length', 6);
        SystemSetting::set('security_require_uppercase', '0');
        SystemSetting::set('security_require_numbers', '0');
        SystemSetting::set('security_require_special_chars', '0');

        $user = User::factory()->create(['role' => 'customer', 'password' => bcrypt(self::STRONG)]);
        $headers = $this->headersFor($user);

        // 7 chars → still rejected at both endpoints (floor 8).
        $this->postJson('/api/auth/change-password', [
            'current_password'          => self::STRONG,
            'new_password'              => 'abcdefg',
            'new_password_confirmation' => 'abcdefg',
        ], $headers)->assertStatus(422)->assertJsonValidationErrors('new_password');

        $this->postJson('/api/auth/password/reset', [
            'email'                     => 'a@example.com',
            'token'                     => 'bogus',
            'new_password'              => 'abcdefg',
            'new_password_confirmation' => 'abcdefg',
        ])->assertStatus(422)->assertJsonValidationErrors('new_password');

        // 8 chars → passes validation (fails on the wrong current password
        // / bogus token instead — proving the floor, not the outcome).
        $this->postJson('/api/auth/change-password', [
            'current_password'          => self::STRONG,
            'new_password'              => 'abcdefgh',
            'new_password_confirmation' => 'abcdefgh',
        ], $headers)->assertJsonMissingValidationErrors('new_password');

        $this->postJson('/api/auth/password/reset', [
            'email'                     => 'a@example.com',
            'token'                     => 'bogus',
            'new_password'              => 'abcdefgh',
            'new_password_confirmation' => 'abcdefgh',
        ])->assertJsonMissingValidationErrors('new_password');
    }

    public function test_admin_creation_keeps_its_six_char_floor(): void
    {
        // Admin creation previously allowed min:6 — a configured 6 with all
        // flags off must remain valid there even while registration needs 8.
        SystemSetting::set('security_min_password_length', 6);
        SystemSetting::set('security_require_uppercase', '0');
        SystemSetting::set('security_require_numbers', '0');
        SystemSetting::set('security_require_special_chars', '0');

        $this->postJson('/api/admin/users', [
            'name'     => 'New Staff',
            'username' => 'st_' . bin2hex(random_bytes(4)),
            'email'    => 'st_' . bin2hex(random_bytes(4)) . '@example.com',
            'password' => 'abcdef',
            'role'     => 'customer',
        ], $this->headersFor($this->admin()))->assertStatus(201);

        // …but 5 chars still fails the floor even for admin creation.
        $this->postJson('/api/admin/users', [
            'name'     => 'New Staff',
            'username' => 'st_' . bin2hex(random_bytes(4)),
            'email'    => 'st_' . bin2hex(random_bytes(4)) . '@example.com',
            'password' => 'abcde',
            'role'     => 'customer',
        ], $this->headersFor($this->admin()))
            ->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_change_password_enforces_policy(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'password' => bcrypt(self::STRONG)]);

        $this->postJson('/api/auth/change-password', [
            'current_password'          => self::STRONG,
            'new_password'              => 'weak',
            'new_password_confirmation' => 'weak',
        ], $this->headersFor($user))
            ->assertStatus(422)->assertJsonValidationErrors('new_password');
    }

    public function test_password_reset_enforces_policy(): void
    {
        // Validation runs before the token check — a weak password is 422
        // even though the token itself is bogus.
        $this->postJson('/api/auth/password/reset', [
            'email'                     => 'anyone@example.com',
            'token'                     => 'bogus-token',
            'new_password'              => 'weak',
            'new_password_confirmation' => 'weak',
        ])->assertStatus(422)->assertJsonValidationErrors('new_password');
    }

    public function test_admin_user_creation_enforces_policy(): void
    {
        $this->postJson('/api/admin/users', [
            'name'     => 'New Staff',
            'username' => 'staff_' . bin2hex(random_bytes(4)),
            'email'    => 'staff_' . bin2hex(random_bytes(4)) . '@example.com',
            'password' => 'weak',
            'role'     => 'customer',
        ], $this->headersFor($this->admin()))
            ->assertStatus(422)->assertJsonValidationErrors('password');
    }

    /* ---------------- login attempt limit ---------------- */

    public function test_configured_max_login_attempts_is_enforced(): void
    {
        SystemSetting::set('security_max_login_attempts', 3);
        $user = User::factory()->create([
            'role' => 'customer', 'is_active' => true,
            'password' => bcrypt(self::STRONG),
        ]);

        $payload = ['login' => $user->email, 'password' => 'wrong-password'];
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/auth/login', $payload)->assertStatus(401);
        }
        $this->postJson('/api/auth/login', $payload)->assertStatus(429);
    }

    public function test_successful_login_within_limit_still_works(): void
    {
        SystemSetting::set('security_max_login_attempts', 3);
        $user = User::factory()->create([
            'role' => 'customer', 'is_active' => true,
            'password' => bcrypt(self::STRONG),
        ]);

        $this->postJson('/api/auth/login', ['login' => $user->email, 'password' => self::STRONG])
            ->assertOk()->assertJsonStructure(['token']);
    }

    /* ---------------- inactivity session timeout ---------------- */

    public function test_idle_token_is_rejected(): void
    {
        SystemSetting::set('security_session_timeout', 15);
        $user = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $token = $user->createToken('t');
        $token->accessToken->forceFill(['last_used_at' => now()->subMinutes(16)])->save();

        $this->getJson('/api/auth/me', ['Authorization' => 'Bearer ' . $token->plainTextToken])
            ->assertUnauthorized();
    }

    public function test_active_token_is_accepted_and_activity_refreshed(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $token = $user->createToken('t');

        $this->getJson('/api/auth/me', ['Authorization' => 'Bearer ' . $token->plainTextToken])
            ->assertOk();

        $fresh = PersonalAccessToken::findToken($token->plainTextToken);
        $this->assertNotNull($fresh->last_used_at);
        $this->assertTrue($fresh->last_used_at->gt(now()->subMinute()));
    }

    public function test_invalid_session_timeout_falls_back_to_default(): void
    {
        SystemSetting::set('security_session_timeout', 'garbage');
        $user = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $token = $user->createToken('t');
        // 20 min idle < 60 min fallback → still valid.
        $token->accessToken->forceFill(['last_used_at' => now()->subMinutes(20)])->save();

        $this->getJson('/api/auth/me', ['Authorization' => 'Bearer ' . $token->plainTextToken])
            ->assertOk();
    }

    /* ---------------- settings authorization & 2FA removal ---------------- */

    public function test_customer_cannot_update_security_settings(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $this->postJson('/api/admin/settings/security', [
            'minPasswordLength' => 6,
            'maxLoginAttempts'  => 5,
            'sessionTimeout'    => 60,
        ], $this->headersFor($customer))
            ->assertForbidden();
    }

    public function test_admin_can_update_security_settings(): void
    {
        $this->postJson('/api/admin/settings/security', [
            'minPasswordLength'   => 10,
            'requireSpecialChars' => true,
            'requireNumbers'      => true,
            'requireUppercase'    => true,
            'maxLoginAttempts'    => 4,
            'sessionTimeout'      => 30,
        ], $this->headersFor($this->admin()))->assertOk();

        $this->assertEquals('10', SystemSetting::get('security_min_password_length'));
        $this->assertEquals('4', SystemSetting::get('security_max_login_attempts'));
        $this->assertEquals('30', SystemSetting::get('security_session_timeout'));
    }

    public function test_two_factor_is_no_longer_exposed_or_persisted(): void
    {
        $admin = $this->admin();

        $response = $this->getJson('/api/admin/settings', $this->headersFor($admin))->assertOk();
        $this->assertArrayNotHasKey('twoFactorAuth', $response->json('security'));

        // A stale client still sending the flag must not persist it.
        $this->postJson('/api/admin/settings/security', [
            'minPasswordLength' => 8,
            'maxLoginAttempts'  => 5,
            'sessionTimeout'    => 60,
            'twoFactorAuth'     => true,
        ], $this->headersFor($admin))->assertOk();

        $this->assertNotEquals('1', (string) SystemSetting::get('security_two_factor_auth', ''));
    }
}
