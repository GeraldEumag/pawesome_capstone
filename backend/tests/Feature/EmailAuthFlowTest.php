<?php

namespace Tests\Feature;

use App\Mail\AccountWelcomeMail;
use App\Mail\EmailVerificationMail;
use App\Mail\PasswordResetMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Covers the email verification + password reset flows:
 *  - registration queues a verification email and leaves the user unverified
 *  - verify/resend endpoints (incl. enumeration-safe responses)
 *  - forgot/reset password via emailed link (incl. enumeration-safe responses)
 *  - changing a customer's email requires re-verification
 */
class EmailAuthFlowTest extends TestCase
{
    use RefreshDatabase;

    private function registerPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Test Customer',
            'first_name' => 'Test',
            'last_name' => 'Customer',
            'username' => 'testcustomer',
            'email' => 'customer@example.com',
            'password' => 'Password123!',
        ], $overrides);
    }

    private function registerCustomer(array $overrides = []): User
    {
        $this->postJson('/api/auth/register', $this->registerPayload($overrides))
            ->assertCreated();

        return User::where('email', $overrides['email'] ?? 'customer@example.com')->firstOrFail();
    }

    private function bearer(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('test')->plainTextToken];
    }

    /* ---------------------------------------------------------------
     | Registration + verification
     * -------------------------------------------------------------- */

    public function test_registration_queues_verification_email_and_leaves_user_unverified(): void
    {
        Mail::fake();

        $user = $this->registerCustomer();

        Mail::assertQueued(EmailVerificationMail::class, fn ($mail) => $mail->email === $user->email);
        $this->assertNull($user->email_verified_at);
        $this->assertDatabaseHas('email_verification_tokens', ['email' => $user->email]);
    }

    public function test_email_verify_with_valid_token_marks_user_verified(): void
    {
        Mail::fake();
        $user = $this->registerCustomer();

        $token = null;
        Mail::assertQueued(EmailVerificationMail::class, function ($mail) use (&$token) {
            $token = $mail->token;
            return true;
        });

        $this->postJson('/api/auth/email/verify', ['email' => $user->email, 'token' => $token])
            ->assertOk()
            ->assertJsonPath('message', 'Email verified successfully.');

        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->assertDatabaseMissing('email_verification_tokens', ['email' => $user->email]);
    }

    public function test_email_verify_is_idempotent_for_already_verified_user(): void
    {
        Mail::fake();
        $user = $this->registerCustomer();

        $token = null;
        Mail::assertQueued(EmailVerificationMail::class, function ($mail) use (&$token) {
            $token = $mail->token;
            return true;
        });

        $payload = ['email' => $user->email, 'token' => $token];

        $this->postJson('/api/auth/email/verify', $payload)->assertOk();
        // Second call (repeat click / StrictMode remount) still succeeds.
        $this->postJson('/api/auth/email/verify', $payload)
            ->assertOk()
            ->assertJsonPath('message', 'Email already verified.');
    }

    public function test_email_verify_rejects_invalid_token(): void
    {
        Mail::fake();
        $user = $this->registerCustomer();

        $this->postJson('/api/auth/email/verify', ['email' => $user->email, 'token' => 'bogus-token'])
            ->assertStatus(422);

        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_email_verify_rejects_expired_token(): void
    {
        Mail::fake();
        $user = $this->registerCustomer();

        $token = null;
        Mail::assertQueued(EmailVerificationMail::class, function ($mail) use (&$token) {
            $token = $mail->token;
            return true;
        });

        DB::table('email_verification_tokens')
            ->where('email', $user->email)
            ->update(['created_at' => Carbon::now()->subMinutes(61)]);

        $this->postJson('/api/auth/email/verify', ['email' => $user->email, 'token' => $token])
            ->assertStatus(422);

        $this->assertNull($user->fresh()->email_verified_at);
    }

    /* ---------------------------------------------------------------
     | Resend verification — enumeration-safe
     * -------------------------------------------------------------- */

    public function test_resend_returns_generic_response_for_unknown_email(): void
    {
        Mail::fake();

        $response = $this->postJson('/api/auth/email/resend', ['email' => 'ghost@example.com']);

        $response->assertOk();
        $this->assertStringContainsString('If the email is registered', $response->json('message'));
        Mail::assertNothingQueued();
    }

    public function test_resend_sends_new_link_for_unverified_user(): void
    {
        Mail::fake();
        $user = $this->registerCustomer();

        $this->postJson('/api/auth/email/resend', ['email' => $user->email])->assertOk();

        Mail::assertQueued(EmailVerificationMail::class, 2);
    }

    public function test_resend_does_not_email_already_verified_user(): void
    {
        Mail::fake();
        $user = User::factory()->create([
            'role' => 'customer',
            'email' => 'verified@example.com',
            'email_verified_at' => now(),
        ]);

        $this->postJson('/api/auth/email/resend', ['email' => $user->email])->assertOk();

        Mail::assertNothingQueued();
    }

    /* ---------------------------------------------------------------
     | Password reset — clickable link, enumeration-safe
     * -------------------------------------------------------------- */

    public function test_forgot_password_returns_generic_response_for_unknown_email(): void
    {
        Mail::fake();

        $response = $this->postJson('/api/auth/password/forgot', ['email' => 'ghost@example.com']);

        $response->assertOk();
        $this->assertStringContainsString('If the email address is associated', $response->json('message'));
        Mail::assertNothingQueued();
    }

    public function test_forgot_password_queues_reset_link_for_known_email(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer', 'email' => 'reset@example.com']);

        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();

        Mail::assertQueued(PasswordResetMail::class, fn ($mail) => $mail->email === $user->email);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_reset_password_with_valid_token_changes_password(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer', 'email' => 'reset@example.com']);

        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();

        $token = null;
        Mail::assertQueued(PasswordResetMail::class, function ($mail) use (&$token) {
            $token = $mail->token;
            return true;
        });

        $this->postJson('/api/auth/password/reset', [
            'email' => $user->email,
            'token' => $token,
            'new_password' => 'NewPassword456!',
            'new_password_confirmation' => 'NewPassword456!',
        ])->assertOk();

        $this->assertTrue(Hash::check('NewPassword456!', $user->fresh()->password));
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_reset_password_returns_generic_error_for_unknown_email(): void
    {
        $response = $this->postJson('/api/auth/password/reset', [
            'email' => 'ghost@example.com',
            'token' => 'whatever',
            'new_password' => 'NewPassword456!',
            'new_password_confirmation' => 'NewPassword456!',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Invalid or expired reset token');
    }

    /* ---------------------------------------------------------------
     | Profile email change → re-verification
     * -------------------------------------------------------------- */

    public function test_customer_email_change_clears_verification_and_resends_link(): void
    {
        Mail::fake();
        $user = User::factory()->create([
            'role' => 'customer',
            'email' => 'old@example.com',
            'email_verified_at' => now(),
        ]);

        $this->putJson('/api/auth/profile', ['email' => 'new@example.com'], $this->bearer($user))
            ->assertOk();

        $fresh = $user->fresh();
        $this->assertSame('new@example.com', $fresh->email);
        $this->assertNull($fresh->email_verified_at);
        Mail::assertQueued(EmailVerificationMail::class, fn ($mail) => $mail->email === 'new@example.com');
    }

    public function test_staff_email_change_does_not_clear_verification(): void
    {
        Mail::fake();
        $user = User::factory()->create([
            'role' => 'receptionist',
            'email' => 'staff-old@example.com',
            'email_verified_at' => now(),
        ]);

        $this->putJson('/api/auth/profile', ['email' => 'staff-new@example.com'], $this->bearer($user))
            ->assertOk();

        $fresh = $user->fresh();
        $this->assertSame('staff-new@example.com', $fresh->email);
        $this->assertNotNull($fresh->email_verified_at);
        Mail::assertNothingQueued();
    }

    /* ---------------------------------------------------------------
     | Admin-created accounts — welcome email + set-password link
     * -------------------------------------------------------------- */

    public function test_admin_created_user_receives_welcome_set_password_link(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => 'admin', 'email' => 'admin@example.com']);

        $this->postJson('/api/admin/users', [
            'name' => 'New Cashier',
            'first_name' => 'New',
            'last_name' => 'Cashier',
            'username' => 'newcashier',
            'email' => 'newcashier@example.com',
            'password' => 'TempPass123!',
            'role' => 'cashier',
        ], $this->bearer($admin))->assertCreated();

        Mail::assertQueued(AccountWelcomeMail::class, fn ($mail) => $mail->email === 'newcashier@example.com');
        $this->assertDatabaseHas('password_reset_tokens', ['email' => 'newcashier@example.com']);

        // The emailed token must actually work through the normal reset flow.
        $token = null;
        Mail::assertQueued(AccountWelcomeMail::class, function ($mail) use (&$token) {
            $token = $mail->token;
            return true;
        });

        $this->postJson('/api/auth/password/reset', [
            'email' => 'newcashier@example.com',
            'token' => $token,
            'new_password' => 'ChosenPass789!',
            'new_password_confirmation' => 'ChosenPass789!',
        ])->assertOk();

        $user = User::where('email', 'newcashier@example.com')->firstOrFail();
        $this->assertTrue(Hash::check('ChosenPass789!', $user->password));
    }

    /* ---------------------------------------------------------------
     | Email-derived avatar (Gravatar fallback)
     * -------------------------------------------------------------- */

    public function test_user_without_photo_gets_initials_avatar(): void
    {
        $user = User::factory()->create([
            'role' => 'customer',
            'name' => 'Juan Dela Cruz',
            'email' => 'avatar@example.com',
            'profile_photo' => null,
        ]);

        $avatar = $user->profile_photo;
        $this->assertStringStartsWith('data:image/svg+xml;base64,', $avatar);
        // Data-URI is a self-contained SVG with the user's initials — no
        // external service required.
        $svg = base64_decode(substr($avatar, strlen('data:image/svg+xml;base64,')));
        $this->assertStringContainsString('JC', $svg);
    }

    public function test_user_with_uploaded_photo_keeps_it(): void
    {
        $user = User::factory()->create([
            'role' => 'customer',
            'email' => 'hasphoto@example.com',
            'profile_photo' => 'profile_photos/abc.jpg',
        ]);

        $this->assertSame("/api/files/profile-photos/{$user->id}/view", $user->profile_photo);
    }
}
