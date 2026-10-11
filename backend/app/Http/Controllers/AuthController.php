<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Customer;
use App\Models\LoginLog;
use App\Mail\EmailVerificationMail;
use App\Mail\PasswordChangedMail;
use App\Mail\PasswordResetMail;
use App\Services\EmailDeliveryService;
use App\Services\FileStorageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'first_name' => 'required|string|max:255',
            'middle_name' => 'sometimes|nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users,username',
            'email' => 'required|string|email|max:255|unique:users,email',
            'password' => 'required|string|min:8',
            'phone' => 'sometimes|nullable|regex:/^09[0-9]{9}$/',
            'address' => 'sometimes|nullable|string|max:255',
            'city' => 'sometimes|nullable|string|max:255',
            'state' => 'sometimes|nullable|string|max:255',
            'zip_code' => 'sometimes|nullable|string|max:20',
            'date_of_birth' => 'sometimes|nullable|date',
            'gender' => 'sometimes|nullable|string|in:male,female,other',
            'emergency_contact_person' => 'sometimes|nullable|string|max:255',
            'emergency_contact_number' => 'sometimes|nullable|regex:/^09[0-9]{9}$/',
            'country' => 'sometimes|nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = DB::transaction(function () use ($request) {
            $user = User::create([
                'name' => $request->name,
                'first_name' => $request->first_name,
                'middle_name' => $request->middle_name,
                'last_name' => $request->last_name,
                'username' => $request->username,
                'email' => $request->email,
                'password' => Hash::make($request->password),
                'phone' => $request->phone,
                'address' => $request->address,
                'city' => $request->city,
                'state' => $request->state,
                'zip_code' => $request->zip_code,
                'date_of_birth' => $request->date_of_birth,
                'gender' => $request->gender,
                'emergency_contact_person' => $request->emergency_contact_person,
                'emergency_contact_number' => $request->emergency_contact_number,
                'country' => $request->country ?? 'Philippines',
                'role' => 'customer',
                'is_active' => true,
            ]);

            Customer::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'name' => $request->name,
                    'email' => $request->email,
                    'phone' => $request->phone,
                    'address' => $request->address,
                    'is_active' => true,
                ]
            );

            return $user;
        });

        $this->sendVerificationEmail($user);

        $token = $user->createToken('pawesome-token')->plainTextToken;

        return response()->json([
            'message' => 'User registered successfully. Please check your email to verify your account.',
            'user' => $user,
            'token' => $token,
        ], 201);
    }

    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'login' => 'sometimes|string',
            'email' => 'sometimes|string|email',
            'password' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $login = $request->input('login', $request->input('email'));

        if (!$login) {
            return response()->json([
                'errors' => [
                    'login' => ['Username or email is required'],
                ],
            ], 422);
        }

        $user = User::where('email', $login)
            ->orWhere('username', $login)
            ->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        if (!$user->is_active) {
            return response()->json(['message' => 'Account is inactive'], 403);
        }

        $token = $user->createToken('pawesome-token')->plainTextToken;

        LoginLog::logLogin($user->id, $user->email, 'success');

        return response()->json([
            'message' => 'Login successful',
            'user' => $user,
            'token' => $token,
        ])->cookie('auth_token', $token, 4320, '/', null, false, true);
    }

    public function me(Request $request)
    {
        try {
            // Get token from httpOnly cookie first, then fallback to Authorization header
            $token = $request->cookie('auth_token') ?? $request->bearerToken();
            if (!$token) {
                return response()->json(['error' => 'No token provided'], 401);
            }

            // Find user by Sanctum token
            $accessToken = \Laravel\Sanctum\PersonalAccessToken::findToken($token);
            if (!$accessToken) {
                return response()->json(['error' => 'Invalid token'], 401);
            }

            // Get the user from the token
            $user = $accessToken->tokenable;
            if (!$user) {
                return response()->json(['error' => 'User not found'], 401);
            }

            return response()->json($user);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch user: ' . $e->getMessage()], 500);
        }
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();
        
        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'first_name' => 'sometimes|string|max:255',
            'middle_name' => 'sometimes|nullable|string|max:255',
            'last_name' => 'sometimes|string|max:255',
            'username' => 'sometimes|string|max:255|unique:users,username,' . $user->id,
            'email' => 'sometimes|string|email|max:255|unique:users,email,' . $user->id,
            'phone' => 'sometimes|nullable|regex:/^09[0-9]{9}$/',
            'address' => 'sometimes|nullable|string|max:255',
            'city' => 'sometimes|nullable|string|max:255',
            'state' => 'sometimes|nullable|string|max:255',
            'zip_code' => 'sometimes|nullable|string|max:20',
            'country' => 'sometimes|nullable|string|max:255',
            'bio' => 'sometimes|nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $allowedFields = [
            'name', 'first_name', 'middle_name', 'last_name', 'username', 'email',
            'phone', 'address', 'city', 'state', 'zip_code', 'country', 'bio'
        ];

        $emailChanged = $request->filled('email')
            && $request->email !== $user->email;

        $oldEmail = $user->email;

        DB::transaction(function () use ($request, $user, $allowedFields, $emailChanged, $oldEmail) {
            $user->update($request->only($allowedFields));

            // A changed email must be re-verified before the customer can book again.
            if ($emailChanged && $user->role === 'customer') {
                $user->email_verified_at = null;
                $user->save();

                // Keep the linked customer record's authoritative email in sync.
                Customer::where('user_id', $user->id)->update(['email' => $user->email]);

                // Pending auth tokens issued to the old address are superseded.
                DB::table('password_reset_tokens')->where('email', $oldEmail)->delete();
                DB::table('email_verification_tokens')->where('email', $oldEmail)->delete();
            }
        });

        if ($emailChanged && $user->role === 'customer') {
            $this->sendVerificationEmail($user);
        }

        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => $user
        ]);
    }

    public function uploadProfilePhoto(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'profile_photo' => 'required|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        // Use getRawOriginal to bypass the accessor and get the actual storage path
        $oldPath = $user->getRawOriginal('profile_photo');

        FileStorageService::storeAndPersist(
            $validated['profile_photo'], 'profile_photos', 'public',
            fn (string $path) => $user->update(['profile_photo' => $path]),
            oldPath: $oldPath && !str_starts_with($oldPath, '/api/') ? $oldPath : null,
        );

        // After update, the accessor will return the correct API URL
        $user->refresh();

        $photoUrl = $user->profile_photo . '?v=' . time();

        return response()->json([
            'message' => 'Profile photo uploaded successfully',
            'profile_photo' => $photoUrl,
            'url' => $photoUrl,
            'user' => $user,
        ]);
    }

    public function changePassword(Request $request)
    {
        $user = $request->user();
        
        $validator = Validator::make($request->all(), [
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:8|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Verify current password
        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json(['message' => 'Current password is incorrect'], 422);
        }

        // Update password and record the security notice atomically.
        DB::transaction(function () use ($user, $request) {
            $user->update([
                'password' => Hash::make($request->new_password)
            ]);

            app(EmailDeliveryService::class)->intent(
                new PasswordChangedMail($user->email, $user->name),
                [
                    'event_key' => 'auth.password_changed',
                    'occurrence_key' => 'auth.pwchanged:' . $user->id . ':' . (string) Str::uuid(),
                    'source_type' => 'user',
                    'source_id' => $user->id,
                    'user_id' => $user->id,
                    'recipient' => $user->email,
                    'expires_at' => now()->addDay(),
                ]
            );
        });

        return response()->json([
            'message' => 'Password changed successfully'
        ]);
    }

    public function forgotPassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string|email',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $email = $request->email;
        $user = User::where('email', $email)->first();

        // Always return the same generic message to avoid email enumeration.
        // Only generate and send a token if the user actually exists.
        if ($user) {
            $table = config('auth.passwords.users.table');
            $deliveries = app(EmailDeliveryService::class);

            DB::transaction(function () use ($user, $email, $table, $deliveries) {
                // Serialize issuance under the owning-user row lock so
                // concurrent requests cannot mint competing tokens.
                User::where('id', $user->id)->lockForUpdate()->first();

                // Per-account cooldown, independent of IP/burst limits: a
                // fresh token row means a link was already issued recently.
                $existing = DB::table($table)->where('email', $email)->lockForUpdate()->first();
                $throttle = (int) config('auth.passwords.users.throttle', 60);
                if ($existing && Carbon::parse($existing->created_at)->addSeconds($throttle)->isFuture()) {
                    return;
                }

                $token = Str::random(64);
                DB::table($table)->where('email', $email)->delete();
                DB::table($table)->insert([
                    'email' => $email,
                    'token' => Hash::make($token),
                    'created_at' => now(),
                ]);

                // Delivery intent commits with the token — a rollback
                // removes both; a consumed/superseded token suppresses
                // the send even if the job runs late.
                $deliveries->intent(new PasswordResetMail($token, $email), [
                    'event_key' => 'auth.password_reset',
                    'occurrence_key' => 'auth.reset:' . $user->id . ':' . sha1($token),
                    'source_type' => 'user',
                    'source_id' => $user->id,
                    'user_id' => $user->id,
                    'recipient' => $email,
                    'expires_at' => now()->addMinutes((int) config('auth.passwords.users.expire', 60)),
                    'suppression' => [
                        ['type' => 'token_row', 'table' => $table, 'email' => $email, 'token' => $token],
                        ['type' => 'recipient_unchanged', 'user_id' => $user->id, 'email' => $email],
                        ['type' => 'user_active', 'user_id' => $user->id],
                    ],
                ]);
            });
        }

        return response()->json([
            'message' => 'If the email address is associated with an account, a password reset token has been sent to that email.',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string|email',
            'token' => 'required|string',
            'new_password' => 'required|string|min:8|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $table = config('auth.passwords.users.table');

        // The whole consume-and-mutate operation runs under a lock on the
        // token row (primary-keyed by email) so concurrent submissions of
        // the same token are serialized — only one can consume it.
        return DB::transaction(function () use ($request, $table) {
            $resetRecord = DB::table($table)->where('email', $request->email)->lockForUpdate()->first();

            // Generic message so the response cannot be used to enumerate accounts.
            if (!$resetRecord || !Hash::check($request->token, $resetRecord->token)) {
                return response()->json(['message' => 'Invalid or expired reset token'], 422);
            }

            $expiresAt = Carbon::parse($resetRecord->created_at)->addMinutes(config('auth.passwords.users.expire'));
            if (now()->greaterThan($expiresAt)) {
                DB::table($table)->where('email', $request->email)->delete();
                return response()->json(['message' => 'Reset token has expired'], 422);
            }

            $user = User::where('email', $request->email)->lockForUpdate()->first();

            if (!$user) {
                return response()->json(['message' => 'Invalid or expired reset token'], 422);
            }

            $user->update([
                'password' => Hash::make($request->new_password),
                'api_token' => null,
            ]);

            // Revoke all existing Sanctum sessions — a reset means the old
            // credentials may be compromised, so issued tokens must die too.
            $user->tokens()->delete();

            DB::table($table)->where('email', $request->email)->delete();

            // Security notice travels in the same transaction as the reset.
            app(EmailDeliveryService::class)->intent(
                new PasswordChangedMail($user->email, $user->name),
                [
                    'event_key' => 'auth.password_changed',
                    'occurrence_key' => 'auth.pwchanged:' . $user->id . ':' . sha1($request->token),
                    'source_type' => 'user',
                    'source_id' => $user->id,
                    'user_id' => $user->id,
                    'recipient' => $user->email,
                    'expires_at' => now()->addDay(),
                ]
            );

            return response()->json([
                'message' => 'Password reset successfully',
            ]);
        });
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user) {
            LoginLog::logLogout($user->id, $user->email);
            $user->currentAccessToken()?->delete();
        }

        return response()->json(['message' => 'Logout successful'])
            ->cookie('auth_token', '', -1, '/', null, false, true);
    }

    /**
     * Unlink Telegram account from user
     */
    public function unlinkTelegram(Request $request)
    {
        $user = $request->user();

        if (!$user->telegram_chat_id) {
            return response()->json([
                'message' => 'Telegram account is not linked'
            ], 400);
        }

        $user->update([
            'telegram_chat_id' => null,
            'telegram_username' => null,
            'telegram_linked_at' => null,
        ]);

        return response()->json([
            'message' => 'Telegram account unlinked successfully'
        ]);
    }

    public function verifyEmail(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string|email',
            'token' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Token consumption is serialized under the locked token row so a
        // token can only be consumed once, even under concurrent submits.
        return DB::transaction(function () use ($request) {
            $user = User::where('email', $request->email)->lockForUpdate()->first();
            $record = DB::table('email_verification_tokens')->where('email', $request->email)->lockForUpdate()->first();

            // A request without a currently valid token reveals nothing —
            // including whether the account exists or is already verified.
            if (!$user || !$record || !Hash::check($request->token, $record->token)) {
                return response()->json(['message' => 'Invalid or expired verification token.'], 422);
            }

            if (Carbon::parse($record->created_at)->addMinutes(60)->isPast()) {
                DB::table('email_verification_tokens')->where('email', $request->email)->delete();
                return response()->json(['message' => 'Verification token has expired.'], 422);
            }

            // Idempotent only for the holder of a still-valid token: the
            // account was verified through another issued link meanwhile.
            if ($user->email_verified_at) {
                DB::table('email_verification_tokens')->where('email', $request->email)->delete();
                return response()->json(['message' => 'Email already verified.']);
            }

            $user->email_verified_at = now();
            $user->save();

            DB::table('email_verification_tokens')->where('email', $request->email)->delete();

            return response()->json(['message' => 'Email verified successfully.']);
        });
    }

    public function resendVerificationEmail(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string|email',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Generic response so this endpoint cannot be used to enumerate accounts.
        $user = User::where('email', $request->email)->first();

        if ($user && !$user->email_verified_at) {
            $this->sendVerificationEmail($user);
        }

        return response()->json([
            'message' => 'If the email is registered and not yet verified, a new verification link has been sent.',
        ]);
    }

    private function sendVerificationEmail(User $user): void
    {
        $email = $user->email;
        $deliveries = app(EmailDeliveryService::class);

        DB::transaction(function () use ($user, $email, $deliveries) {
            // Serialize issuance under the owning-user row lock.
            User::where('id', $user->id)->lockForUpdate()->first();

            // Per-account cooldown: a fresh row means a valid link was
            // already issued seconds ago — do not churn tokens or spam.
            $existing = DB::table('email_verification_tokens')->where('email', $email)->lockForUpdate()->first();
            if ($existing && Carbon::parse($existing->created_at)->addSeconds(60)->isFuture()) {
                return;
            }

            $token = Str::random(64);

            DB::table('email_verification_tokens')->where('email', $email)->delete();
            DB::table('email_verification_tokens')->insert([
                'email' => $email,
                'token' => Hash::make($token),
                'created_at' => now(),
            ]);

            // Delivery intent commits atomically with the token row; a
            // consumed/superseded token suppresses the send at send time.
            $deliveries->intent(new EmailVerificationMail($token, $email, $user->name), [
                'event_key' => 'auth.email_verification',
                'occurrence_key' => 'auth.verify:' . $user->id . ':' . sha1($token),
                'source_type' => 'user',
                'source_id' => $user->id,
                'user_id' => $user->id,
                'recipient' => $email,
                'expires_at' => now()->addMinutes(60),
                'suppression' => [
                    ['type' => 'token_row', 'table' => 'email_verification_tokens', 'email' => $email, 'token' => $token],
                    ['type' => 'recipient_unchanged', 'user_id' => $user->id, 'email' => $email],
                    ['type' => 'user_active', 'user_id' => $user->id],
                ],
            ]);
        });
    }
}
