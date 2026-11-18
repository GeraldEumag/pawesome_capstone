<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicRegistrationIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Juan Dela Cruz',
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'suffix' => 'Jr.',
            'username' => 'juandelacruz',
            'email' => 'juan@example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ], $overrides);
    }

    public function test_registration_persists_suffix_and_links_customer_profile(): void
    {
        $this->postJson('/api/auth/register', $this->payload())->assertCreated();

        $user = User::where('email', 'juan@example.com')->firstOrFail();
        $this->assertSame('JR.', $user->suffix);
        $this->assertSame('customer', $user->role);
        $this->assertTrue($user->is_active);
        $this->assertNotSame('Password123!', $user->password);

        $customer = Customer::where('user_id', $user->id)->firstOrFail();
        $this->assertSame('juan@example.com', $customer->email);
    }

    public function test_registration_ignores_privileged_role_and_status_injection(): void
    {
        $this->postJson('/api/auth/register', $this->payload([
            'role' => 'admin',
            'is_active' => false,
            'employee_no' => 'EMP-0001',
        ]))->assertCreated();

        $user = User::where('email', 'juan@example.com')->firstOrFail();
        $this->assertSame('customer', $user->role);
        $this->assertTrue($user->is_active);
        $this->assertNull($user->employee_no);
    }
}
