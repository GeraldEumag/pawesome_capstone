<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Customer;
use App\Mail\EmailVerificationMail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
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
            'middle_name' => 'sometimes|string|max:255',
            'last_name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users,username',
            'email' => 'required|string|email|max:255|unique:users,email',
            'password' => 'required|string|min:8',
            'phone' => 'sometimes|string|max:20',
            'address' => 'sometimes|string|max:255',
            'city' => 'sometimes|string|max:255',
            'state' => 'sometimes|string|max:255',
            'zip_code' => 'sometimes|string|max:20',
            'date_of_birth' => 'sometimes|date',
            'gender' => 'sometimes|string|in:male,female,other',
            'emergency_contact_person' => 'sometimes|string|max:255',
            'emergency_contact_number' => 'sometimes|string|max:20',
            'country' => 'sometimes|string|max:255',
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
            'middle_name' => 'sometimes|string|max:255',
            'last_name' => 'sometimes|string|max:255',
            'username' => 'sometimes|string|max:255|unique:users,username,' . $user->id,
            'email' => 'sometimes|string|email|max:255|unique:users,email,' . $user->id,
            'phone' => 'sometimes|string|max:20',
            'address' => 'sometimes|string|max:255',
            'city' => 'sometimes|string|max:255',
            'state' => 'sometimes|string|max:255',
            'zip_code' => 'sometimes|string|max:20',
            'country' => 'sometimes|string|max:255',
            'bio' => 'sometimes|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $allowedFields = [
            'name', 'first_name', 'middle_name', 'last_name', 'username', 'email', 
            'phone', 'address', 'city', 'state', 'zip_code', 'country', 'bio'
        ];
        
        $user->update($request->only($allowedFields));

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
        if ($oldPath && !str_starts_with($oldPath, '/api/')) {
            Storage::disk('public')->delete($oldPath);
        }

        $path = $validated['profile_photo']->store('profile_photos', 'public');

        $user->update([
            'profile_photo' => $path,
        ]);

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

        // Update password
        $user->update([
            'password' => Hash::make($request->new_password)
        ]);

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
            $token = Str::random(64);
            $hashedToken = Hash::make($token);

            $table = config('auth.passwords.users.table');
            DB::table($table)->where('email', $email)->delete();
            DB::table($table)->insert([
                'email' => $email,
                'token' => $hashedToken,
                'created_at' => now(),
            ]);

            // Send the reset token via email — never expose it in the API response.
            try {
                Mail::raw(
                    "Hello,\n\n"
                    . "You requested a password reset for your Pawesome account.\n\n"
                    . "Your password reset token is:\n\n"
                    . $token . "\n\n"
                    . "Use this token on the password reset page to set a new password.\n"
                    . "This token will expire in " . config('auth.passwords.users.expire', 60) . " minutes.\n\n"
                    . "If you did not request a password reset, you can safely ignore this email.\n\n"
                    . "— Pawesome Retreat Inc.",
                    function ($message) use ($email) {
                        $message->to($email)
                            ->subject('Pawesome — Password Reset Token');
                    }
                );
            } catch (\Throwable $e) {
                Log::error('Failed to send password reset email: ' . $e->getMessage());
            }
        }

        return response()->json([
            'message' => 'If the email address is associated with an account, a password reset token has been sent to that email.',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string|email|exists:users,email',
            'token' => 'required|string',
            'new_password' => 'required|string|min:8|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $table = config('auth.passwords.users.table');
        $resetRecord = DB::table($table)->where('email', $request->email)->first();

        if (!$resetRecord || !Hash::check($request->token, $resetRecord->token)) {
            return response()->json(['message' => 'Invalid or expired reset token'], 422);
        }

        $expiresAt = Carbon::parse($resetRecord->created_at)->addMinutes(config('auth.passwords.users.expire'));
        if (now()->greaterThan($expiresAt)) {
            DB::table($table)->where('email', $request->email)->delete();
            return response()->json(['message' => 'Reset token has expired'], 422);
        }

        $user = User::where('email', $request->email)->first();
        $user->update([
            'password' => Hash::make($request->new_password),
            'api_token' => null,
        ]);

        DB::table($table)->where('email', $request->email)->delete();

        return response()->json([
            'message' => 'Password reset successfully',
        ]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user) {
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

        $record = DB::table('email_verification_tokens')->where('email', $request->email)->first();

        if (!$record || !Hash::check($request->token, $record->token)) {
            return response()->json(['message' => 'Invalid or expired verification token.'], 422);
        }

        if (Carbon::parse($record->created_at)->addMinutes(60)->isPast()) {
            DB::table('email_verification_tokens')->where('email', $request->email)->delete();
            return response()->json(['message' => 'Verification token has expired.'], 422);
        }

        $user = User::where('email', $request->email)->first();

        if (!$user) {
            return response()->json(['message' => 'User not found.'], 404);
        }

        if ($user->email_verified_at) {
            DB::table('email_verification_tokens')->where('email', $request->email)->delete();
            return response()->json(['message' => 'Email already verified.']);
        }

        $user->email_verified_at = now();
        $user->save();

        DB::table('email_verification_tokens')->where('email', $request->email)->delete();

        return response()->json(['message' => 'Email verified successfully.']);
    }

    public function resendVerificationEmail(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string|email|exists:users,email',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = User::where('email', $request->email)->first();

        if ($user->email_verified_at) {
            return response()->json(['message' => 'Email already verified.']);
        }

        $this->sendVerificationEmail($user);

        return response()->json(['message' => 'A new verification link has been sent to your email.']);
    }

    private function sendVerificationEmail(User $user): void
    {
        $email = $user->email;

        DB::table('email_verification_tokens')->where('email', $email)->delete();

        $token = Str::random(64);

        DB::table('email_verification_tokens')->insert([
            'email' => $email,
            'token' => Hash::make($token),
            'created_at' => now(),
        ]);

        try {
            Mail::to($email)->queue(new EmailVerificationMail($token, $email, $user->name));
        } catch (\Throwable $e) {
            Log::error('Failed to queue verification email: ' . $e->getMessage());
        }
    }
}
