<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A soft-deleted user used to keep its email/username/employee_no under the
 * DB unique indexes, so the same identity could never register again —
 * the live site reported "email already taken" for deleted accounts.
 *
 * Tombstoning on delete (User::deleting / Customer::deleting hooks) now frees
 * the unique values while preserving them in original_* for the restore path.
 */
class DeletedUserEmailReuseTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $this->adminToken = $this->admin->createToken('t')->plainTextToken;
    }

    private function adminAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->adminToken];
    }

    private function registerPayload(string $email, string $username): array
    {
        return [
            'name'       => 'Test Person',
            'first_name' => 'Test',
            'last_name'  => 'Person',
            'username'   => $username,
            'email'      => $email,
            'password'   => 'Password123!',
        ];
    }

    /** The reported bug: delete a user, then register the same email again. */
    public function test_re_registration_succeeds_after_user_delete(): void
    {
        $email = 'reuse-me@gmail.com';
        $username = 'reuseme';

        $this->postJson('/api/auth/register', $this->registerPayload($email, $username))
            ->assertStatus(201);

        $oldUser = User::where('email', $email)->firstOrFail();
        $oldCustomerId = $oldUser->customer->id;

        $this->deleteJson("/api/admin/users/{$oldUser->id}", ['reason' => 'user_requested'], $this->adminAuth())
            ->assertOk();

        // The trashed row keeps a tombstone, not the real identity.
        $trashed = User::withTrashed()->findOrFail($oldUser->id);
        $this->assertNotNull($trashed->deleted_at);
        $this->assertSame("deleted_{$oldUser->id}@users.invalid", $trashed->email);
        $this->assertSame("deleted_{$oldUser->id}", $trashed->username);
        $this->assertSame($email, $trashed->original_email);
        $this->assertSame($username, $trashed->original_username);

        // The linked customer row's email is scrubbed too (row is kept for
        // audit, but customers.email must free the address).
        $customer = Customer::findOrFail($oldCustomerId);
        $this->assertSame("deleted_{$customer->id}@customers.invalid", $customer->email);
        $this->assertSame($email, $customer->original_email);

        // The actual fix: the same email AND username register cleanly.
        $this->postJson('/api/auth/register', $this->registerPayload($email, $username))
            ->assertStatus(201);

        $this->assertDatabaseHas('users', [
            'email' => $email,
            'username' => $username,
            'deleted_at' => null,
        ]);
        $this->assertDatabaseHas('customers', ['email' => $email]);
    }

    /** Restore must put the original identity back so the account can log in. */
    public function test_restore_brings_back_original_identity(): void
    {
        $user = User::factory()->create([
            'role' => 'cashier',
            'email' => 'cashier1@example.com',
            'username' => 'cashier1',
            'is_active' => true,
        ]);
        $employeeNo = $user->employee_no; // auto-assigned PAW-#### for staff

        $this->deleteJson("/api/admin/users/{$user->id}", ['reason' => 'test_account'], $this->adminAuth())
            ->assertOk();

        $trashed = User::withTrashed()->findOrFail($user->id);
        $this->assertSame("deleted_{$user->id}@users.invalid", $trashed->email);
        $this->assertSame("DEL-{$user->id}", $trashed->employee_no);

        $this->postJson("/api/admin/users/{$user->id}/restore", [], $this->adminAuth())
            ->assertOk();

        $restored = $user->fresh();
        $this->assertNull($restored->deleted_at);
        $this->assertSame('cashier1@example.com', $restored->email);
        $this->assertSame('cashier1', $restored->username);
        $this->assertSame($employeeNo, $restored->employee_no);
        $this->assertNull($restored->original_email);
        $this->assertNull($restored->original_username);
        $this->assertNull($restored->original_employee_no);
    }

    /** A deleted account's reclaimed email must not be stolen back on restore. */
    public function test_restore_refused_when_email_was_reclaimed(): void
    {
        $email = 'taken-again@gmail.com';

        $old = User::factory()->create(['role' => 'customer', 'email' => $email, 'username' => 'oldacct']);

        $this->deleteJson("/api/admin/users/{$old->id}", ['reason' => 'test_account'], $this->adminAuth())
            ->assertOk();

        // A brand-new account re-registers the freed email.
        $this->postJson('/api/auth/register', $this->registerPayload($email, 'newacct'))
            ->assertStatus(201);

        $this->postJson("/api/admin/users/{$old->id}/restore", [], $this->adminAuth())
            ->assertStatus(422);

        // The row stays trashed and keeps its tombstone — no identity theft.
        $still = User::withTrashed()->findOrFail($old->id);
        $this->assertNotNull($still->deleted_at);
        $this->assertSame("deleted_{$old->id}@users.invalid", $still->email);
    }

    /** Admin customer delete frees customers.email for a new record. */
    public function test_customer_delete_frees_email_and_restore_conflict_is_refused(): void
    {
        $email = 'walk-customer@example.com';
        $customer = Customer::create([
            'name' => 'Old Customer',
            'email' => $email,
            'is_active' => true,
        ]);

        $this->deleteJson("/api/admin/customers/{$customer->id}", [], $this->adminAuth())
            ->assertOk();

        $trashedCustomer = Customer::withTrashed()->findOrFail($customer->id);
        $this->assertSame("deleted_{$customer->id}@customers.invalid", $trashedCustomer->email);
        $this->assertSame($email, $trashedCustomer->original_email);

        // Same email on a new customer now validates and inserts.
        $this->postJson('/api/admin/customers', [
            'name' => 'New Customer',
            'email' => $email,
        ], $this->adminAuth())->assertStatus(201);

        // Restoring the old row must refuse — the address belongs to someone else.
        $this->postJson("/api/admin/customers/{$customer->id}/restore", [], $this->adminAuth())
            ->assertStatus(422);
        $this->assertNotNull(Customer::withTrashed()->findOrFail($customer->id)->deleted_at);
    }

    /** Customer restore returns the email when nobody claimed it. */
    public function test_customer_restore_returns_original_email(): void
    {
        $customer = Customer::create([
            'name' => 'Returning Customer',
            'email' => 'return@example.com',
            'is_active' => true,
        ]);

        $this->deleteJson("/api/admin/customers/{$customer->id}", [], $this->adminAuth())->assertOk();
        $this->postJson("/api/admin/customers/{$customer->id}/restore", [], $this->adminAuth())->assertOk();

        $restored = $customer->fresh();
        $this->assertNull($restored->deleted_at);
        $this->assertSame('return@example.com', $restored->email);
        $this->assertNull($restored->original_email);
    }

    /** The salaries route also deletes users — the hook must cover it too. */
    public function test_salary_route_delete_frees_the_email(): void
    {
        $email = 'staff-gone@example.com';
        $user = User::factory()->create(['role' => 'cashier', 'email' => $email, 'username' => 'staffgone']);

        $this->deleteJson("/api/admin/salaries/{$user->id}", [], $this->adminAuth())
            ->assertOk();

        $this->assertSame("deleted_{$user->id}@users.invalid", User::withTrashed()->findOrFail($user->id)->email);

        $this->postJson('/api/auth/register', $this->registerPayload($email, 'staffgone'))
            ->assertStatus(201);
    }

    /**
     * Receptionist customer delete deactivates AND soft-deletes the linked
     * account, so its email is freed for re-registration.
     */
    public function test_receptionist_customer_delete_frees_account_email(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist', 'is_active' => true]);
        $token = $receptionist->createToken('t')->plainTextToken;

        $email = 'reception-deleted@example.com';
        $user = User::factory()->create(['role' => 'customer', 'email' => $email, 'username' => 'receptgone']);
        $customer = Customer::create([
            'user_id' => $user->id,
            'name' => 'Recept Customer',
            'email' => $email,
            'is_active' => true,
        ]);

        $this->deleteJson("/api/receptionist/customers/{$customer->id}", [
            'reason' => 'Duplicate account',
        ], ['Authorization' => "Bearer {$token}"])->assertOk();

        // Both rows tombstoned; the user is trashed and inactive.
        $trashedUser = User::withTrashed()->findOrFail($user->id);
        $this->assertNotNull($trashedUser->deleted_at);
        $this->assertSame("deleted_{$user->id}@users.invalid", $trashedUser->email);
        $this->assertFalse((bool) $trashedUser->is_active);
        $this->assertSame(
            "deleted_{$customer->id}@customers.invalid",
            Customer::withTrashed()->findOrFail($customer->id)->email
        );

        $this->postJson('/api/auth/register', $this->registerPayload($email, 'receptgone'))
            ->assertStatus(201);
    }

    /**
     * Deployed leftover: an account deleted BEFORE tombstoning kept a live
     * customers row holding the email — registration hit a 500 duplicate on
     * customers.email. The orphan must be reclaimed, not collide.
     */
    public function test_register_reclaims_customer_orphaned_by_pre_fix_deletion(): void
    {
        $email = 'orphan@gmail.com';
        $user = User::factory()->create([
            'role' => 'customer', 'email' => $email, 'username' => 'olduser', 'is_active' => true,
        ]);
        $customer = Customer::create([
            'user_id' => $user->id, 'name' => 'OLD USER', 'email' => $email, 'is_active' => true,
        ]);

        // Post-migration state of a pre-fix deletion: tombstoned user row,
        // live customer row still carrying the real email.
        DB::table('users')->where('id', $user->id)->update([
            'deleted_at'        => now(),
            'original_email'    => $email,
            'original_username' => 'olduser',
            'email'             => "deleted_{$user->id}@users.invalid",
            'username'          => "deleted_{$user->id}",
        ]);

        $this->postJson('/api/auth/register', $this->registerPayload($email, 'newuser'))
            ->assertStatus(201);

        $newUser = User::where('email', $email)->firstOrFail();
        $customer->refresh();
        $this->assertSame($newUser->id, $customer->user_id);
        $this->assertSame(1, Customer::where('email', $email)->count());
    }

    /** A walk-in customer record with no live account must not block sign-up. */
    public function test_register_reclaims_walk_in_customer_without_live_user(): void
    {
        $email = 'walkin@gmail.com';
        $customer = Customer::create([
            'user_id' => null, 'name' => 'WALK IN', 'email' => $email, 'is_active' => true,
        ]);

        $this->postJson('/api/auth/register', $this->registerPayload($email, 'walkin'))
            ->assertStatus(201);

        $newUser = User::where('email', $email)->firstOrFail();
        $this->assertSame($newUser->id, $customer->refresh()->user_id);
    }

    /** A customer row still linked to a LIVE user keeps the email protected. */
    public function test_register_blocked_when_email_belongs_to_live_linked_customer(): void
    {
        $email = 'taken@gmail.com';
        $live = User::factory()->create([
            'role' => 'customer', 'email' => 'other@gmail.com', 'username' => 'liveu', 'is_active' => true,
        ]);
        Customer::create([
            'user_id' => $live->id, 'name' => 'LIVE', 'email' => $email, 'is_active' => true,
        ]);

        $this->postJson('/api/auth/register', $this->registerPayload($email, 'newbie'))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->assertSame(0, User::where('email', $email)->count());
    }
}
