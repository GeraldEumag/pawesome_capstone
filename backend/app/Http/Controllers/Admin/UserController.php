<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Mail\AccountWelcomeMail;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\User;
use App\Services\EmailDeliveryService;
use App\Support\PasswordPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::query();

        if ($search = trim((string) $request->query('search', ''))) {
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $search) . '%';
            $query->where(function ($q) use ($like, $search) {
                $q->where('name', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('username', 'like', $like)
                    ->orWhere('role', 'like', $like);
                if (is_numeric($search)) {
                    $q->orWhere('id', (int) $search);
                }
            });
        }

        $role = $request->query('role');
        if ($role && $role !== 'all') {
            $query->where('role', $role);
        }

        $status = $request->query('status');
        if ($status === 'active' || $status === 'inactive') {
            $query->where('is_active', $status === 'active' ? 1 : 0);
        }

        $sortable = ['id', 'name', 'username', 'email', 'role', 'is_active', 'created_at'];
        $sort = in_array($request->query('sort'), $sortable, true) ? $request->query('sort') : 'created_at';
        $direction = $request->query('direction') === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sort, $direction)->orderBy('id');

        if ($request->boolean('all')) {
            return response()->json([
                'success' => true,
                'data' => $query->get(),
            ]);
        }

        $perPage = min(max((int) $request->query('per_page', 25), 1), 200);
        $page = $query->paginate($perPage);

        $stats = [
            'total' => User::count(),
            'active' => User::where('is_active', 1)->count(),
            'inactive' => User::where('is_active', 0)->count(),
            'adminCount' => User::where('role', 'admin')->count(),
            'roleCounts' => User::select('role', DB::raw('COUNT(*) as aggregate'))
                ->groupBy('role')
                ->pluck('aggregate', 'role'),
        ];

        return response()->json([
            'success' => true,
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
            'stats' => $stats,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email,NULL,id,deleted_at,NULL',
            'username' => 'required|string|max:255|unique:users,username,NULL,id,deleted_at,NULL',
            'password' => ['required', PasswordPolicy::rules(6)],
            'phone' => 'sometimes|string|max:20',
            'address' => 'sometimes|string|max:255',
            'city' => 'sometimes|string|max:255',
            'state' => 'sometimes|string|max:255',
            'zip_code' => 'sometimes|string|max:20',
            'country' => 'sometimes|string|max:255',
            // Staff accounts must be at least 18 years old; customers may be any age.
            'date_of_birth' => $request->input('role') === 'customer'
                ? 'sometimes|date'
                : ['required', 'date', 'before_or_equal:' . now()->subYears(18)->toDateString()],
            'gender' => 'sometimes|string|in:male,female,other',
            'emergency_contact_person' => 'sometimes|string|max:255',
            'emergency_contact_number' => 'sometimes|string|digits:11',
            'role' => 'required|string|in:admin,manager,receptionist,super_receptionist,veterinary,vet_tech,cashier,inventory,customer',
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
            $table = config('auth.passwords.users.table');

            DB::transaction(function () use ($user, $table) {
                $token = Str::random(64);

                DB::table($table)->where('email', $user->email)->delete();
                DB::table($table)->insert([
                    'email' => $user->email,
                    'token' => Hash::make($token),
                    'created_at' => now(),
                ]);

                // Delivery intent commits with the set-password token; a
                // consumed/superseded token suppresses a late send.
                app(EmailDeliveryService::class)->intent(
                    new AccountWelcomeMail($token, $user->email, $user->name, $user->username, $user->role),
                    [
                        'event_key' => 'auth.account_welcome',
                        'occurrence_key' => 'auth.welcome:' . $user->id . ':' . sha1($token),
                        'source_type' => 'user',
                        'source_id' => $user->id,
                        'user_id' => $user->id,
                        'recipient' => $user->email,
                        'expires_at' => now()->addMinutes((int) config('auth.passwords.users.expire', 60)),
                        'suppression' => [
                            ['type' => 'token_row', 'table' => $table, 'email' => $user->email, 'token' => $token],
                            ['type' => 'recipient_unchanged', 'user_id' => $user->id, 'email' => $user->email],
                            ['type' => 'user_active', 'user_id' => $user->id],
                        ],
                    ]
                );
            });
        } catch (\Throwable $e) {
            Log::error('Failed to record welcome email delivery', ['exception' => get_class($e)]);
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
            'first_name' => 'sometimes|nullable|string|max:255',
            'middle_name' => 'sometimes|nullable|string|max:255',
            'last_name' => 'sometimes|nullable|string|max:255',
            'email' => 'sometimes|string|email|max:255|unique:users,email,' . $id . ',id,deleted_at,NULL',
            'username' => 'sometimes|string|max:255|unique:users,username,' . $id . ',id,deleted_at,NULL',
            'role' => 'sometimes|string|in:admin,manager,receptionist,super_receptionist,veterinary,vet_tech,cashier,inventory,customer',
            'is_active' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $updatable = ['name', 'first_name', 'middle_name', 'last_name', 'email', 'username', 'role', 'is_active'];

        // The lockout check and the mutation must share one transaction so a
        // concurrent admin request cannot pass the same count check — see
        // adminLockoutViolation for the lock semantics.
        $lockoutResponse = null;
        $before = null;
        DB::transaction(function () use ($user, $request, $updatable, &$lockoutResponse, &$before) {
            $lockout = $this->adminLockoutViolation($user, $request->input('role'), $request->input('is_active'));
            if ($lockout) {
                $lockoutResponse = response()->json(['message' => $lockout], 403);
                return;
            }
            $before = $user->only($updatable);
            $user->update($request->only($updatable));
        });
        if ($lockoutResponse) {
            return $lockoutResponse;
        }

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

    /**
     * Returns an error message when the requested role/is_active change would
     * strip the caller's own admin access or deactivate/demote the last
     * remaining active admin. Null when the change is safe.
     *
     * Callers MUST run this inside a DB::transaction together with the
     * mutation it guards. The lockForUpdate() below takes InnoDB row locks on
     * every currently-active admin row; two concurrent admin requests
     * serialise on that shared lock set, so the second one re-reads the count
     * only after the first has committed (or rolled back) — it can no longer
     * observe count=2, remove its admin, and leave the system with zero.
     *
     * The "last active admin is someone else" branch is intentionally kept
     * even though a normal admin caller always counts toward the total
     * themselves: it still fires for callers authenticated via the legacy
     * 'super_admin' role value, which EnsureRole normalises to 'admin' but
     * which the role='admin' filter below does not count.
     */
    private function adminLockoutViolation(User $user, ?string $newRole, mixed $newIsActive): ?string
    {
        if ($user->id === auth()->id()) {
            if ($newRole !== null && $newRole !== 'admin') {
                return 'You cannot change your own role.';
            }
            if ($newIsActive !== null && !$newIsActive) {
                return 'You cannot deactivate your own account.';
            }
        }

        $removesActiveAdmin = $user->role === 'admin' && $user->is_active
            && (($newRole !== null && $newRole !== 'admin')
                || ($newIsActive !== null && !$newIsActive));
        if ($removesActiveAdmin
            && User::where('role', 'admin')->where('is_active', true)->lockForUpdate()->count() <= 1) {
            return 'Cannot remove admin access: this is the last active admin account.';
        }

        return null;
    }

    public function toggle($id)
    {
        $user = User::find($id);
        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        $lockoutResponse = DB::transaction(function () use ($user) {
            $lockout = $this->adminLockoutViolation($user, null, !$user->is_active);
            if ($lockout) {
                return response()->json(['message' => $lockout], 403);
            }

            $user->is_active = !$user->is_active;
            $user->save();

            // Deactivation must also revoke issued tokens — defense-in-depth
            // on top of the ApiTokenAuth is_active check.
            if (!$user->is_active) {
                $user->tokens()->delete();
            }
            return null;
        });
        if ($lockoutResponse) {
            return $lockoutResponse;
        }

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

    public const DELETION_REASONS = [
        'duplicate_account' => 'Duplicate account',
        'user_requested' => 'User requested account deletion',
        'inactive_account' => 'Inactive or abandoned account',
        'policy_violation' => 'Policy violation',
        'test_account' => 'Test or invalid account',
        'other' => 'Other',
    ];

    public function destroy($id)
    {
        $validated = request()->validate([
            'reason' => 'required|string|in:' . implode(',', array_keys(self::DELETION_REASONS)),
            'reason_details' => 'required_if:reason,other|nullable|string|min:3|max:500',
        ]);

        $user = User::find($id);
        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        // Prevent admin from deleting their own account
        if ($user->id === auth()->id()) {
            return response()->json(['message' => 'You cannot delete your own account'], 403);
        }

        // The last-admin check and the deletion share one transaction so a
        // concurrent admin removal cannot pass the same count check; the
        // lockForUpdate on the active-admin set serialises both requests.
        $denied = DB::transaction(function () use ($user, $validated) {
            // Do not allow deleting the last active admin — that would lock
            // every admin out of the admin panel entirely.
            if ($user->role === 'admin' && $user->is_active
                && User::where('role', 'admin')->where('is_active', true)->lockForUpdate()->count() <= 1) {
                return response()->json([
                    'message' => 'Cannot delete user: this is the last active admin account.'
                ], 403);
            }

            // Prevent deletion if user has active pets, appointments, or
            // boardings. Operational records hang off the linked customers
            // row (user_id), not the users.id directly — traverse the real
            // relationship.
            $customerId = $user->customer?->id;
            $hasPets = $customerId && \App\Models\Pet::where('customer_id', $customerId)->exists();
            $hasAppointments = $customerId && \App\Models\Appointment::where('customer_id', $customerId)->exists();
            $hasBoardings = $customerId && \App\Models\Boarding::where('customer_id', $customerId)->exists();

            if ($hasPets || $hasAppointments || $hasBoardings) {
                return response()->json([
                    'message' => 'Cannot delete user with active pets, appointments, or boardings'
                ], 422);
            }

            $reasonLabel = self::DELETION_REASONS[$validated['reason']];
            $reasonDetails = $validated['reason_details'] ?? null;

            if ($user->customer) {
                $user->customer->deletion_reason = mb_substr(
                    $reasonDetails ? "{$reasonLabel}: {$reasonDetails}" : $reasonLabel,
                    0,
                    500
                );
                $user->customer->save();
            }

            ActivityLog::log(auth()->id(), 'user_deleted', "User #{$user->id} ({$user->email}) deleted", [
                'category' => 'user_management',
                'reference_type' => 'user',
                'reference_id' => $user->id,
                'metadata' => [
                    'email' => $user->email,
                    'role' => $user->role,
                    'reason' => $validated['reason'],
                    'reason_label' => $reasonLabel,
                    'reason_details' => $reasonDetails,
                ],
            ]);

            // The linked customer row is kept (deletion_reason records why),
            // but its email must leave the unique index so the same address
            // can register a new account. The hook only fires on delete(), so
            // the live customer row is scrubbed here directly.
            if ($user->customer && $user->customer->email) {
                $user->customer->original_email = $user->customer->email;
                $user->customer->email = "deleted_{$user->customer->id}@customers.invalid";
                $user->customer->save();
            }

            // User::deleting tombstones email/username/employee_no into
            // original_*.
            $user->delete();
            return null;
        });
        if ($denied) {
            return $denied;
        }

        return response()->json(['message' => 'User deleted successfully']);
    }

    public function restore($id)
    {
        $user = User::withTrashed()->find($id);
        if (!$user || !$user->trashed()) {
            return response()->json(['message' => 'User not found or not deleted'], 404);
        }

        if (!$user->restore()) {
            return response()->json([
                'message' => 'Cannot restore: the original email, username, or employee number is now used by another account.'
            ], 422);
        }

        // Put the linked customer's email back too, when it is still free.
        $customer = $user->customer()->withTrashed()->first();
        if ($customer && $customer->original_email) {
            $taken = \App\Models\Customer::withTrashed()
                ->where('id', '!=', $customer->id)
                ->where('email', $customer->original_email)
                ->exists();
            if (!$taken) {
                $customer->email = $customer->original_email;
                $customer->original_email = null;
                $customer->save();
            }
        }

        ActivityLog::log(auth()->id(), 'user_restored', "User #{$user->id} ({$user->email}) restored", [
            'category' => 'user_management',
            'reference_type' => 'user',
            'reference_id' => $user->id,
        ]);

        return response()->json(['message' => 'User restored successfully']);
    }
}
