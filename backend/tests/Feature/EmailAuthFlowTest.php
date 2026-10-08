<?php

namespace Tests\Feature;

use App\Mail\AccountWelcomeMail;
use App\Mail\EmailVerificationMail;
use App\Mail\PasswordChangedMail;
use App\Mail\PasswordResetMail;
use App\Models\Customer;
use App\Models\EmailDelivery;
use App\Models\User;
use App\Services\EmailDeliveryService;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
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

    /**
     * Run the outbox worker path exactly as queue:work would. Under
     * QUEUE_CONNECTION=sync + RefreshDatabase the after-commit dispatch
     * already executes inline at commit; Queue::fake() in a test keeps
     * intents pending so this helper replays the worker explicitly.
     */
    private function deliverPending(): void
    {
        $deliveries = app(EmailDeliveryService::class);
        EmailDelivery::where('status', EmailDelivery::STATUS_PENDING)
            ->orderBy('id')
            ->pluck('id')
            ->each(fn ($id) => $deliveries->send($id, 'test'));
    }

    /* ---------------------------------------------------------------
     | Registration + verification
     * -------------------------------------------------------------- */

    public function test_registration_queues_verification_email_and_leaves_user_unverified(): void
    {
        Mail::fake();

        $user = $this->registerCustomer();
        $this->deliverPending();

        Mail::assertSent(EmailVerificationMail::class, fn ($mail) => $mail->email === $user->email);
        $this->assertNull($user->email_verified_at);
        $this->assertDatabaseHas('email_verification_tokens', ['email' => $user->email]);
    }

    public function test_registration_preserves_ph_prefix_and_rejects_invalid_contact_numbers(): void
    {
        $user = $this->registerCustomer([
            'phone' => '09171234567',
            'emergency_contact_number' => '09987654321',
        ]);

        $this->assertSame('09171234567', $user->phone);
        $this->assertSame('09987654321', $user->emergency_contact_number);

        $this->postJson('/api/auth/register', $this->registerPayload([
            'username' => 'invalidphone',
            'email' => 'invalidphone@example.com',
            'phone' => '0917letters',
            'emergency_contact_number' => '0912345',
            'date_of_birth' => 'not-a-date',
        ]))->assertUnprocessable()->assertJsonValidationErrors(['phone', 'emergency_contact_number', 'date_of_birth']);
    }

    public function test_email_verify_with_valid_token_marks_user_verified(): void
    {
        Mail::fake();
        $user = $this->registerCustomer();

        $token = null;
        $this->deliverPending();
        Mail::assertSent(EmailVerificationMail::class, function ($mail) use (&$token) {
            $token = $mail->token;
            return true;
        });

        $this->postJson('/api/auth/email/verify', ['email' => $user->email, 'token' => $token])
            ->assertOk()
            ->assertJsonPath('message', 'Email verified successfully.');

        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->assertDatabaseMissing('email_verification_tokens', ['email' => $user->email]);
    }

    public function test_email_verify_consumed_token_does_not_reveal_verified_state(): void
    {
        Mail::fake();
        $user = $this->registerCustomer();

        $token = null;
        $this->deliverPending();
        Mail::assertSent(EmailVerificationMail::class, function ($mail) use (&$token) {
            $token = $mail->token;
            return true;
        });

        $payload = ['email' => $user->email, 'token' => $token];

        $this->postJson('/api/auth/email/verify', $payload)->assertOk();
        // The token was consumed — a repeat click must not confirm that
        // the account exists or is already verified to a token-less caller.
        $this->postJson('/api/auth/email/verify', $payload)
            ->assertStatus(422)
            ->assertJsonPath('message', 'Invalid or expired verification token.');

        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_email_verify_with_valid_token_for_already_verified_user_is_idempotent(): void
    {
        $user = User::factory()->create([
            'role' => 'customer',
            'email' => 'verified@example.com',
            'email_verified_at' => now(),
        ]);
        DB::table('email_verification_tokens')->insert([
            'email' => $user->email,
            'token' => Hash::make('valid-token'),
            'created_at' => now(),
        ]);

        $this->postJson('/api/auth/email/verify', ['email' => $user->email, 'token' => 'valid-token'])
            ->assertOk()
            ->assertJsonPath('message', 'Email already verified.');

        $this->assertDatabaseMissing('email_verification_tokens', ['email' => $user->email]);
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
        $this->deliverPending();
        Mail::assertSent(EmailVerificationMail::class, function ($mail) use (&$token) {
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
        $this->deliverPending();
        Mail::assertNothingSent();
    }

    public function test_resend_sends_new_link_for_unverified_user(): void
    {
        Mail::fake();
        $user = $this->registerCustomer();

        // A fresh token was issued at registration — the per-account
        // cooldown suppresses an immediate duplicate send.
        $this->postJson('/api/auth/email/resend', ['email' => $user->email])->assertOk();
        $this->deliverPending();
        Mail::assertSent(EmailVerificationMail::class, 1);

        // After the cooldown window a resend issues a fresh token.
        DB::table('email_verification_tokens')->where('email', $user->email)
            ->update(['created_at' => Carbon::now()->subSeconds(61)]);

        $this->postJson('/api/auth/email/resend', ['email' => $user->email])->assertOk();
        $this->deliverPending();
        Mail::assertSent(EmailVerificationMail::class, 2);
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

        $this->deliverPending();
        Mail::assertNothingSent();
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
        $this->deliverPending();
        Mail::assertNothingSent();
    }

    public function test_forgot_password_queues_reset_link_for_known_email(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer', 'email' => 'reset@example.com']);

        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();
        $this->deliverPending();

        Mail::assertSent(PasswordResetMail::class, fn ($mail) => $mail->email === $user->email);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_forgot_password_enforces_per_account_cooldown(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer', 'email' => 'reset@example.com']);

        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();
        $this->deliverPending();
        Mail::assertSent(PasswordResetMail::class, 1);
        $first = DB::table('password_reset_tokens')->where('email', $user->email)->first();

        // Same normalized account inside the throttle window: generic OK,
        // no additional mail, and the issued token is preserved.
        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();
        $this->deliverPending();
        Mail::assertSent(PasswordResetMail::class, 1);
        $this->assertSame(
            $first->token,
            DB::table('password_reset_tokens')->where('email', $user->email)->value('token')
        );

        // After the throttle window a fresh token is issued.
        DB::table('password_reset_tokens')->where('email', $user->email)
            ->update(['created_at' => Carbon::now()->subSeconds(config('auth.passwords.users.throttle') + 1)]);
        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();
        $this->deliverPending();
        Mail::assertSent(PasswordResetMail::class, 2);
        $this->assertNotSame(
            $first->token,
            DB::table('password_reset_tokens')->where('email', $user->email)->value('token')
        );
    }

    public function test_reset_password_with_valid_token_changes_password_and_rejects_reuse(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer', 'email' => 'reset@example.com']);

        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();

        $token = null;
        $this->deliverPending();
        Mail::assertSent(PasswordResetMail::class, function ($mail) use (&$token) {
            $token = $mail->token;
            return true;
        });

        $payload = [
            'email' => $user->email,
            'token' => $token,
            'new_password' => 'NewPassword456!',
            'new_password_confirmation' => 'NewPassword456!',
        ];
        $this->postJson('/api/auth/password/reset', $payload)->assertOk();
        $this->assertTrue(Hash::check('NewPassword456!', $user->fresh()->password));
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);

        $this->postJson('/api/auth/password/reset', $payload)
            ->assertStatus(422)
            ->assertJsonPath('message', 'Invalid or expired reset token');
    }

    public function test_reset_password_revokes_all_existing_sessions_without_affecting_other_users(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer']);
        $other = User::factory()->create(['role' => 'customer']);
        $firstSession = $this->bearer($user);
        $secondSession = $this->bearer($user);
        $otherSession = $this->bearer($other);
        DB::table('password_reset_tokens')->insert([
            'email' => $user->email,
            'token' => Hash::make('valid-reset-token'),
            'created_at' => now(),
        ]);

        $this->postJson('/api/auth/password/reset', [
            'email' => $user->email,
            'token' => 'valid-reset-token',
            'new_password' => 'ChangedPassword123!',
            'new_password_confirmation' => 'ChangedPassword123!',
        ])->assertOk();

        $this->assertSame(0, $user->tokens()->count());
        $this->getJson('/api/auth/me', $firstSession)->assertUnauthorized();
        $this->getJson('/api/auth/me', $secondSession)->assertUnauthorized();
        $this->getJson('/api/auth/me', $otherSession)->assertOk();
        $this->assertTrue(Hash::check('ChangedPassword123!', $user->fresh()->password));
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_invalid_password_reset_preserves_sessions_password_and_reset_token(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer']);
        $session = $this->bearer($user);
        $password = $user->password;
        $tokenHash = Hash::make('valid-reset-token');
        DB::table('password_reset_tokens')->insert([
            'email' => $user->email,
            'token' => $tokenHash,
            'created_at' => now(),
        ]);

        $this->postJson('/api/auth/password/reset', [
            'email' => $user->email,
            'token' => 'invalid-reset-token',
            'new_password' => 'ChangedPassword123!',
            'new_password_confirmation' => 'ChangedPassword123!',
        ])->assertUnprocessable()->assertJsonPath('message', 'Invalid or expired reset token');

        $this->assertSame($password, $user->fresh()->password);
        $this->getJson('/api/auth/me', $session)->assertOk();
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email, 'token' => $tokenHash]);
        $this->deliverPending();
        Mail::assertNothingSent();
    }

    public function test_password_reset_rolls_back_if_session_revocation_fails(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer']);
        $session = $this->bearer($user);
        $password = $user->password;
        DB::table('password_reset_tokens')->insert([
            'email' => $user->email,
            'token' => Hash::make('valid-reset-token'),
            'created_at' => now(),
        ]);
        $failed = false;
        DB::listen(function ($query) use (&$failed) {
            if (!$failed && str_starts_with($query->sql, 'delete from `personal_access_tokens`')) {
                $failed = true;
                throw new \RuntimeException('Simulated session revocation failure');
            }
        });

        $this->postJson('/api/auth/password/reset', [
            'email' => $user->email,
            'token' => 'valid-reset-token',
            'new_password' => 'ChangedPassword123!',
            'new_password_confirmation' => 'ChangedPassword123!',
        ])->assertStatus(500);

        $this->assertTrue($failed);
        $this->assertSame($password, $user->fresh()->password);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);
        $this->getJson('/api/auth/me', $session)->assertOk();
        $this->deliverPending();
        Mail::assertNothingSent();
    }

    public function test_reset_password_rejects_expired_token(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer', 'email' => 'expired-reset@example.com']);

        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();

        $token = null;
        $this->deliverPending();
        Mail::assertSent(PasswordResetMail::class, function ($mail) use (&$token) {
            $token = $mail->token;
            return true;
        });
        DB::table('password_reset_tokens')
            ->where('email', $user->email)
            ->update(['created_at' => Carbon::now()->subMinutes(config('auth.passwords.users.expire') + 1)]);

        $this->postJson('/api/auth/password/reset', [
            'email' => $user->email,
            'token' => $token,
            'new_password' => 'NewPassword456!',
            'new_password_confirmation' => 'NewPassword456!',
        ])->assertStatus(422)->assertJsonPath('message', 'Reset token has expired');

        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
        $this->assertTrue(Hash::check('password', $user->fresh()->password));
    }

    public function test_auth_email_endpoints_are_rate_limited(): void
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/auth/password/forgot', ['email' => 'limit@example.com'])->assertOk();
        }

        $this->postJson('/api/auth/password/forgot', ['email' => 'limit@example.com'])->assertStatus(429);
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
        $this->deliverPending();
        Mail::assertSent(EmailVerificationMail::class, fn ($mail) => $mail->email === 'new@example.com');
    }

    public function test_email_change_synchronizes_only_the_linked_customer_and_invalidates_old_tokens(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer', 'email' => 'old@example.com']);
        $customer = Customer::factory()->create(['user_id' => $user->id, 'email' => $user->email]);
        $other = Customer::factory()->create(['email' => 'unrelated@example.com']);
        foreach (['password_reset_tokens', 'email_verification_tokens'] as $table) {
            DB::table($table)->insert([
                'email' => $user->email,
                'token' => Hash::make('old-token'),
                'created_at' => now(),
            ]);
        }

        $this->putJson('/api/auth/profile', ['email' => 'new@example.com'], $this->bearer($user))
            ->assertOk();

        $this->assertSame('new@example.com', $customer->fresh()->email);
        $this->assertSame('unrelated@example.com', $other->fresh()->email);
        $this->assertNull($user->fresh()->email_verified_at);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'old@example.com']);
        $this->assertDatabaseMissing('email_verification_tokens', ['email' => 'old@example.com']);
        $this->deliverPending();
        Mail::assertSent(EmailVerificationMail::class, fn ($mail) => $mail->hasTo('new@example.com')
            && Hash::check($mail->token, DB::table('email_verification_tokens')->where('email', 'new@example.com')->value('token')));
        Mail::assertSent(EmailVerificationMail::class, 1);
    }

    public function test_email_change_does_not_reassign_an_unlinked_customer_by_email(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer', 'email' => 'old@example.com']);
        $unlinked = Customer::factory()->create(['user_id' => null, 'email' => $user->email]);

        $this->putJson('/api/auth/profile', ['email' => 'new@example.com'], $this->bearer($user))
            ->assertOk();

        $this->assertSame('old@example.com', $unlinked->fresh()->email);
        $this->assertNull($unlinked->fresh()->user_id);
        $this->deliverPending();
        Mail::assertSent(EmailVerificationMail::class, fn ($mail) => $mail->hasTo('new@example.com'));
    }

    public function test_profile_email_change_rolls_back_when_customer_synchronization_fails(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer', 'email' => 'old@example.com']);
        $customer = Customer::factory()->create(['user_id' => $user->id, 'email' => $user->email]);
        $verifiedAt = $user->email_verified_at;
        $failed = false;
        DB::listen(function ($query) use (&$failed) {
            if (!$failed && str_starts_with($query->sql, 'update `customers`')) {
                $failed = true;
                throw new \RuntimeException('Simulated customer synchronization failure');
            }
        });

        $this->putJson('/api/auth/profile', ['email' => 'new@example.com'], $this->bearer($user))
            ->assertStatus(500);

        $this->assertTrue($failed);
        $this->assertSame('old@example.com', $user->fresh()->email);
        $this->assertSame('old@example.com', $customer->fresh()->email);
        $this->assertEquals($verifiedAt, $user->fresh()->email_verified_at);
        $this->assertDatabaseMissing('email_verification_tokens', ['email' => 'new@example.com']);
        $this->deliverPending();
        Mail::assertNothingSent();
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
        $this->deliverPending();
        Mail::assertNothingSent();
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

        $this->deliverPending();
        Mail::assertSent(AccountWelcomeMail::class, fn ($mail) => $mail->email === 'newcashier@example.com');
        $this->assertDatabaseHas('password_reset_tokens', ['email' => 'newcashier@example.com']);

        // The emailed token must actually work through the normal reset flow.
        $token = null;
        Mail::assertSent(AccountWelcomeMail::class, function ($mail) use (&$token) {
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

    /* ---------------------------------------------------------------
     | Phase 3 — durable auth delivery through the outbox
     * -------------------------------------------------------------- */

    public function test_forgot_password_records_durable_encrypted_delivery_intent(): void
    {
        Mail::fake();
        Queue::fake(); // hold the delivery pending like a delayed worker
        $user = User::factory()->create(['role' => 'customer', 'email' => 'reset@example.com']);

        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();

        $delivery = EmailDelivery::where('event_key', 'auth.password_reset')->firstOrFail();
        $this->assertSame(EmailDelivery::STATUS_PENDING, $delivery->status);
        $this->assertSame($user->id, $delivery->user_id);
        $this->assertSame(EmailDelivery::fingerprint($user->email), $delivery->recipient_fingerprint);
        // Recipient and token-bearing payload never rest in plaintext.
        $this->assertStringNotContainsString('reset@example.com', $delivery->recipient_email);
        $this->assertStringNotContainsString('reset@example.com', $delivery->payload);
        $this->assertNotNull($delivery->suppression);
        $this->assertNotNull($delivery->expires_at);

        $this->deliverPending();
        Mail::assertSent(PasswordResetMail::class);
        $this->assertSame(EmailDelivery::STATUS_ACCEPTED, $delivery->fresh()->status);
    }

    public function test_consumed_reset_token_suppresses_pending_delivery_and_sends_change_notice(): void
    {
        Mail::fake();
        Queue::fake(); // hold deliveries pending like a delayed worker
        $user = User::factory()->create(['role' => 'customer', 'email' => 'reset@example.com']);

        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();

        // Consume the token before the worker reaches the delivery.
        $pending = EmailDelivery::where('event_key', 'auth.password_reset')->firstOrFail();
        $token = unserialize(Crypt::decryptString($pending->payload))->token;
        $this->assertTrue(
            Hash::check($token, DB::table('password_reset_tokens')->where('email', $user->email)->value('token'))
        );

        $this->postJson('/api/auth/password/reset', [
            'email' => $user->email,
            'token' => $token,
            'new_password' => 'ResetAgain123!',
            'new_password_confirmation' => 'ResetAgain123!',
        ])->assertOk();

        $this->deliverPending();

        // The consumed-token link was suppressed; the security notice sent.
        Mail::assertNotSent(PasswordResetMail::class);
        Mail::assertSent(PasswordChangedMail::class, fn ($m) => $m->hasTo($user->email));
        $this->assertSame(EmailDelivery::STATUS_SUPPRESSED, $pending->fresh()->status);
    }

    public function test_superseded_verification_token_suppresses_older_delivery(): void
    {
        Mail::fake();
        Queue::fake(); // hold deliveries pending like a delayed worker
        $user = $this->registerCustomer();

        // Registration minted intent #1; age the token past the cooldown so a
        // resend mints intent #2 with a fresh token.
        DB::table('email_verification_tokens')->where('email', $user->email)
            ->update(['created_at' => Carbon::now()->subSeconds(61)]);
        $this->postJson('/api/auth/email/resend', ['email' => $user->email])->assertOk();

        $this->assertSame(2, EmailDelivery::where('event_key', 'auth.email_verification')->count());

        $this->deliverPending();

        // Only the live token's email reaches the customer.
        Mail::assertSent(EmailVerificationMail::class, 1);
        $statuses = EmailDelivery::where('event_key', 'auth.email_verification')->pluck('status')->sort()->values();
        $this->assertSame([EmailDelivery::STATUS_ACCEPTED, EmailDelivery::STATUS_SUPPRESSED], $statuses->all());
    }

    public function test_change_password_sends_security_notice(): void
    {
        Mail::fake();
        $user = User::factory()->create([
            'role' => 'customer',
            'email' => 'changeme@example.com',
            'password' => Hash::make('OldPassword123!'),
        ]);

        $this->postJson('/api/auth/change-password', [
            'current_password' => 'OldPassword123!',
            'new_password' => 'NewPassword456!',
            'new_password_confirmation' => 'NewPassword456!',
        ], $this->bearer($user))->assertOk();

        $this->deliverPending();
        Mail::assertSent(PasswordChangedMail::class, fn ($m) => $m->hasTo('changeme@example.com'));
    }

    public function test_successful_reset_sends_password_changed_notice(): void
    {
        Mail::fake();
        $user = User::factory()->create(['role' => 'customer']);
        DB::table('password_reset_tokens')->insert([
            'email' => $user->email,
            'token' => Hash::make('valid-reset-token'),
            'created_at' => now(),
        ]);

        $this->postJson('/api/auth/password/reset', [
            'email' => $user->email,
            'token' => 'valid-reset-token',
            'new_password' => 'ChangedPassword123!',
            'new_password_confirmation' => 'ChangedPassword123!',
        ])->assertOk();

        $this->deliverPending();
        Mail::assertSent(PasswordChangedMail::class, fn ($m) => $m->hasTo($user->email));
    }
}
