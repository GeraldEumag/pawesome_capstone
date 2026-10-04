<?php

namespace Tests\Feature;

use App\Mail\AccountWelcomeMail;
use App\Mail\CustomerNotificationMail;
use App\Mail\EmailVerificationMail;
use App\Mail\PasswordChangedMail;
use App\Mail\PasswordResetMail;
use App\Mail\PaymentReceiptMail;
use App\Models\Customer;
use App\Models\EmailDelivery;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * P6-A: customer email preference is server-authoritative via a real API,
 * and every customer-facing template renders through the shared layout.
 */
class EmailPreferencesAndTemplatesTest extends TestCase
{
    use RefreshDatabase;

    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['customer', 'cashier'] as $role) {
            $this->users[$role] = User::factory()->create(['role' => $role]);
        }
    }

    private function as(string $role): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $this->users[$role]->createToken('t')->plainTextToken]);
    }

    public function test_customer_reads_and_updates_email_preference(): void
    {
        $customer = Customer::factory()->create(['user_id' => $this->users['customer']->id]);

        $this->as('customer')->getJson('/api/customer/notification-preferences')
            ->assertOk()
            ->assertJson(['email' => true]);

        $this->as('customer')->putJson('/api/customer/notification-preferences', ['email' => false])
            ->assertOk()
            ->assertJson(['email' => false]);

        $this->assertFalse((bool) ($customer->fresh()->notification_preferences['email'] ?? true));

        $this->as('customer')->putJson('/api/customer/notification-preferences', ['email' => true])->assertOk();
        $this->assertTrue((bool) ($customer->fresh()->notification_preferences['email'] ?? true));
    }

    public function test_preference_requires_boolean(): void
    {
        Customer::factory()->create(['user_id' => $this->users['customer']->id]);

        $this->as('customer')->putJson('/api/customer/notification-preferences', ['email' => 'maybe'])
            ->assertStatus(422);
    }

    public function test_staff_role_is_blocked_and_customerless_customer_gets_404(): void
    {
        // Role middleware rejects non-customers outright.
        $this->as('cashier')->getJson('/api/customer/notification-preferences')->assertStatus(403);

        // A customer-role user with no linked customer record gets 404.
        $this->as('customer')->getJson('/api/customer/notification-preferences')->assertStatus(404);
    }

    public function test_disabled_preference_gates_lifecycle_intent(): void
    {
        Mail::fake();
        $customer = Customer::factory()->create(['user_id' => $this->users['customer']->id]);

        $this->as('customer')->putJson('/api/customer/notification-preferences', ['email' => false])->assertOk();

        $sr = ServiceRequest::create([
            'customer_id' => $this->users['customer']->id,
            'customer_name' => $this->users['customer']->name,
            'customer_email' => $this->users['customer']->email,
            'pet_name' => 'Buddy',
            'request_type' => 'grooming',
            'service_name' => 'Full Groom',
            'price' => 500,
            'total_amount' => 500,
            'status' => 'approved',
            'payment_status' => 'unpaid',
        ]);

        $this->as('customer')->postJson("/api/customer/requests/{$sr->id}/payment-proof", [
            'payment_method' => 'cash',
        ])->assertOk();

        // The preference flows through the customer record — no intent.
        $this->assertSame(0, EmailDelivery::where('event_key', 'payment.proof_submitted')->count());
    }

    public function test_all_customer_facing_templates_render_via_shared_layout(): void
    {
        $cases = [
            'verify' => new EmailVerificationMail('tok123', 'test@example.com', 'Test User'),
            'password-reset' => new PasswordResetMail('tok123', 'test@example.com'),
            'password-changed' => new PasswordChangedMail('test@example.com', 'Test User'),
            'account-welcome' => new AccountWelcomeMail('tok123', 'test@example.com', 'Test User', 'testuser', 'customer'),
            'notification' => new CustomerNotificationMail('Booking Update', "Your booking is confirmed.", 'info'),
            'payment-receipt' => new PaymentReceiptMail('service_request', [
                'receipt_number' => 'SR-REC-1',
                'customer_name' => 'Test',
                'total_amount' => 100,
                'items' => [['product_name' => 'Groom', 'quantity' => 1, 'price' => 100.0, 'subtotal' => 100.0]],
            ]),
        ];

        foreach ($cases as $name => $mailable) {
            $html = $mailable->render();
            $this->assertStringContainsString('Pawesome Retreat Inc.', $html, "{$name} missing shared footer");
            $this->assertStringContainsString('class="container"', $html, "{$name} missing shared container");
        }
    }
}
