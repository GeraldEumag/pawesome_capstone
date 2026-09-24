<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Mail\AccountWelcomeMail;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class UserController extends Controller
{
    public function index()
    {
        $users = User::all();
        return response()->json([
            'success' => true,
            'data' => $users,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'username' => 'required|string|max:255|unique:users',
            'password' => 'required|string|min:6',
            'phone' => 'sometimes|string|max:20',
            'address' => 'sometimes|string|max:255',
            'city' => 'sometimes|string|max:255',
            'state' => 'sometimes|string|max:255',
            'zip_code' => 'sometimes|string|max:20',
            'country' => 'sometimes|string|max:255',
            'date_of_birth' => 'sometimes|date',
            'gender' => 'sometimes|string|in:male,female,other',
            'emergency_contact_person' => 'sometimes|string|max:255',
            'emergency_contact_number' => 'sometimes|string|max:20',
            'role' => 'required|string|in:admin,super_admin,manager,receptionist,super_receptionist,veterinary,cashier,inventory,customer',
            'is_active' => 'boolean',
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
                'email' => $request->email,
                'username' => $request->username,
                'password' => Hash::make($request->password),
                'phone' => $request->phone,
                'address' => $request->address,
                'city' => $request->city,
                'state' => $request->state,
                'zip_code' => $request->zip_code,
                'country' => $request->country ?? 'Philippines',
                'date_of_birth' => $request->date_of_birth,
                'gender' => $request->gender,
                'emergency_contact_person' => $request->emergency_contact_person,
                'emergency_contact_number' => $request->emergency_contact_number,
                'role' => $request->role,
                'is_active' => $request->is_active ?? true,
            ]);

            // email_verified_at is intentionally not mass-assignable — set it
            // directly. Admin-provisioned accounts are vouched for by the admin.
            $user->email_verified_at = now();
            $user->save();

            if ($request->role === 'customer') {
                Customer::updateOrCreate(
                    ['user_id' => $user->id],
                    [
                        'name' => $request->name,
                        'email' => $request->email,
                        'phone' => $request->phone,
                        'address' => $request->address,
                        'is_active' => $request->is_active ?? true,
                    ]
                );
            }

            return $user;
        });

        $this->sendWelcomeEmail($user);

        ActivityLog::log(auth()->id(), 'user_created', "User #{$user->id} ({$user->email}) created", [
            'category' => 'user_management',
            'reference_type' => 'user',
            'reference_id' => $user->id,
            'metadata' => ['email' => $user->email, 'role' => $user->role],
        ]);

        return response()->json([
            'message' => 'User created successfully',
            'user' => $user,
        ], 201);
    }

    /**
     * Email a new account a set-your-own-password link (reuses the hashed,
     * expiring password_reset_tokens machinery) so admins never need to
     * hand out plaintext credentials.
     */
    private function sendWelcomeEmail(User $user): void
    {
        try {
            $token = Str::random(64);
            $table = config('auth.passwords.users.table');

            DB::table($table)->where('email', $user->email)->delete();
            DB::table($table)->insert([
                'email' => $user->email,
                'token' => Hash::make($token),
                'created_at' => now(),
            ]);

            Mail::to($user->email)->queue(
                new AccountWelcomeMail($token, $user->email, $user->name, $user->username, $user->role)
            );
        } catch (\Throwable $e) {
            Log::error('Failed to send welcome email: ' . $e->getMessage());
        }
    }

    public function update(Request $request, $id)
    {
        $user = User::find($id);
        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'email' => 'sometimes|string|email|max:255|unique:users,email,' . $id,
            'username' => 'sometimes|string|max:255|unique:users,username,' . $id,
            'role' => 'sometimes|string|in:admin,super_admin,manager,receptionist,super_receptionist,veterinary,cashier,inventory,customer',
            'is_active' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $updatable = ['name', 'first_name', 'last_name', 'email', 'username', 'role', 'is_active'];
        $before = $user->only($updatable);
        $user->update($request->only($updatable));

        $changes = [];
        foreach ($updatable as $field) {
            $old = $before[$field] ?? null;
            $new = $user->{$field};
            if ($old != $new) {
                $changes[$field] = ['old' => $old, 'new' => $new];
            }
        }

        if ($changes !== []) {
            ActivityLog::log(auth()->id(), 'user_updated', "User #{$user->id} ({$user->email}) updated", [
                'category' => 'user_management',
                'reference_type' => 'user',
                'reference_id' => $user->id,
                'changes' => $changes,
            ]);
        }

        return response()->json([
            'message' => 'User updated successfully',
            'user' => $user,
        ]);
    }

    public function toggle($id)
    {
        $user = User::find($id);
        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        $user->is_active = !$user->is_active;
        $user->save();

        ActivityLog::log(auth()->id(), 'user_status_toggled', "User #{$user->id} ({$user->email}) " . ($user->is_active ? 'activated' : 'deactivated'), [
            'category' => 'user_management',
            'reference_type' => 'user',
            'reference_id' => $user->id,
            'changes' => ['is_active' => ['old' => !$user->is_active, 'new' => $user->is_active]],
        ]);

        return response()->json([
            'message' => 'User status toggled',
            'user' => $user,
        ]);
    }

    public function destroy($id)
    {
        $user = User::find($id);
        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        // Prevent admin from deleting their own account
        if ($user->id === auth()->id()) {
            return response()->json(['message' => 'You cannot delete your own account'], 403);
        }

        // Prevent deletion if user has active pets, appointments, or boardings.
        // Operational records hang off the linked customers row (user_id), not
        // the users.id directly — traverse the real relationship.
        $customerId = $user->customer?->id;
        $hasPets = $customerId && \App\Models\Pet::where('customer_id', $customerId)->exists();
        $hasAppointments = $customerId && \App\Models\Appointment::where('customer_id', $customerId)->exists();
        $hasBoardings = $customerId && \App\Models\Boarding::where('customer_id', $customerId)->exists();

        if ($hasPets || $hasAppointments || $hasBoardings) {
            return response()->json([
                'message' => 'Cannot delete user with active pets, appointments, or boardings'
            ], 422);
        }

        ActivityLog::log(auth()->id(), 'user_deleted', "User #{$user->id} ({$user->email}) deleted", [
            'category' => 'user_management',
            'reference_type' => 'user',
            'reference_id' => $user->id,
            'metadata' => ['email' => $user->email, 'role' => $user->role],
        ]);

        $user->delete();

        return response()->json(['message' => 'User deleted successfully']);
    }

    public function restore($id)
    {
        $user = User::withTrashed()->find($id);
        if (!$user || !$user->trashed()) {
            return response()->json(['message' => 'User not found or not deleted'], 404);
        }

        $user->restore();

        ActivityLog::log(auth()->id(), 'user_restored', "User #{$user->id} ({$user->email}) restored", [
            'category' => 'user_management',
            'reference_type' => 'user',
            'reference_id' => $user->id,
        ]);

        return response()->json(['message' => 'User restored successfully']);
    }
}
