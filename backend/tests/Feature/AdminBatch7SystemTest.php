<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminBatch7SystemTest extends TestCase
{
    use RefreshDatabase;

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('batch7-test')->plainTextToken];
    }

    private function staff(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    public function test_admin_dashboard_requires_the_admin_role(): void
    {
        $this->getJson('/api/admin/dashboard')->assertStatus(401);

        foreach (['customer', 'receptionist', 'cashier', 'inventory', 'veterinary', 'manager'] as $role) {
            $user = $this->staff($role);
            $this->withHeaders($this->headers($user))
                ->getJson('/api/admin/dashboard')
                ->assertForbidden();
        }

        $admin = $this->staff('admin');
        $this->withHeaders($this->headers($admin))->getJson('/api/admin/dashboard')->assertOk();
    }

    public function test_admin_users_and_inventory_views_respond(): void
    {
        $admin = $this->staff('admin');
        $headers = $this->headers($admin);

        $this->withHeaders($headers)->getJson('/api/admin/users')->assertOk();
        $this->withHeaders($headers)->getJson('/api/admin/inventory')->assertOk();
    }

    public function test_admin_user_creation_validates_input(): void
    {
        $admin = $this->staff('admin');
        $invalid = $this->withHeaders($this->headers($admin))->postJson('/api/admin/users', []);
        $invalid->assertStatus(422);
    }
}
