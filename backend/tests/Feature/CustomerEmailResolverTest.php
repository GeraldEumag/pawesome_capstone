<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Pet;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\CustomerEmailResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * CustomerEmailResolver must only follow stable ownership links:
 *  - service_requests.customer_id stores a users.id (never a customers.id)
 *  - pet ownership resolves through the pet's customer
 *  - unlinked walk-in/legacy requests resolve only via stored contact email
 * Email/name guesses must never override an account link.
 */
class CustomerEmailResolverTest extends TestCase
{
    use RefreshDatabase;

    private function request(array $attrs = []): ServiceRequest
    {
        $sr = new ServiceRequest();
        foreach ($attrs as $key => $value) {
            $sr->{$key} = $value;
        }

        return $sr;
    }

    private function linkedAccount(string $email = 'owner@example.com'): array
    {
        $user = User::factory()->create(['role' => 'customer', 'email' => $email]);
        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'email' => $user->email,
        ]);

        return [$user, $customer];
    }

    public function test_pet_ownership_resolves_customer_regardless_of_stored_contact_data(): void
    {
        [$user, $customer] = $this->linkedAccount();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $sr = $this->request([
            'pet_id' => $pet->id,
            'customer_email' => 'spoofed@example.com',
            'customer_name' => 'Someone Else',
        ]);

        $this->assertSame($customer->id, CustomerEmailResolver::forServiceRequest($sr)?->id);
    }

    public function test_customer_id_resolves_through_user_link_never_same_id_customer_row(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'email' => 'owner@example.com']);

        // A decoy customers row whose primary key equals the users.id —
        // the domains must not be interchanged.
        $decoy = new Customer();
        $decoy->id = $user->id;
        $decoy->name = 'Decoy';
        $decoy->email = 'decoy@example.com';
        $decoy->user_id = User::factory()->create(['role' => 'customer'])->id;
        $decoy->save();

        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'email' => $user->email,
        ]);

        $sr = $this->request([
            'customer_id' => $user->id,
            'customer_email' => 'unrelated@example.com',
        ]);

        $this->assertSame($customer->id, CustomerEmailResolver::forServiceRequest($sr)?->id);
        $this->assertNotSame($decoy->id, CustomerEmailResolver::forServiceRequest($sr)?->id);
    }

    public function test_linked_request_without_customer_record_is_unresolved_not_email_guessed(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'email' => 'nolink@example.com']);
        Customer::factory()->create(['email' => 'other@example.com', 'user_id' => null]);

        $sr = $this->request([
            'customer_id' => $user->id,
            'customer_email' => 'other@example.com', // never honored on linked requests
        ]);

        $this->assertNull(CustomerEmailResolver::forServiceRequest($sr));
    }

    public function test_unclaimed_customer_row_matching_account_email_links_legacy_records(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'email' => 'legacy@example.com']);
        $unclaimed = Customer::factory()->create(['email' => 'legacy@example.com', 'user_id' => null]);
        Customer::factory()->create(['email' => 'claimed@example.com', 'user_id' => $user->id]);

        $sr = $this->request(['customer_id' => $user->id]);

        // The user_id-linked row wins; the unclaimed row would only be
        // used when no linked row exists.
        $this->assertNotSame(
            $unclaimed->id,
            CustomerEmailResolver::forServiceRequest($sr)?->id
        );
    }

    public function test_unclaimed_email_match_is_used_when_no_linked_row_exists(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'email' => 'legacy@example.com']);
        $unclaimed = Customer::factory()->create(['email' => 'legacy@example.com', 'user_id' => null]);

        $sr = $this->request(['customer_id' => $user->id]);

        $this->assertSame($unclaimed->id, CustomerEmailResolver::forServiceRequest($sr)?->id);
    }

    public function test_unlinked_request_resolves_contact_record_by_stored_email(): void
    {
        $customer = Customer::factory()->create(['email' => 'walkin@example.com', 'user_id' => null]);

        $sr = $this->request([
            'customer_id' => null,
            'pet_id' => null,
            'customer_email' => 'walkin@example.com',
            'customer_name' => 'Completely Different',
        ]);

        $this->assertSame($customer->id, CustomerEmailResolver::forServiceRequest($sr)?->id);
    }

    public function test_customer_name_alone_never_resolves(): void
    {
        Customer::factory()->create(['name' => 'Unique Solo Name', 'user_id' => null]);

        $sr = $this->request([
            'customer_id' => null,
            'pet_id' => null,
            'customer_email' => null,
            'customer_name' => 'Unique Solo Name',
        ]);

        $this->assertNull(CustomerEmailResolver::forServiceRequest($sr));
    }

    public function test_user_for_customer_resolves_linked_then_unclaimed_accounts(): void
    {
        [$user, $customer] = $this->linkedAccount();
        $this->assertSame($user->id, CustomerEmailResolver::userForCustomer($customer)?->id);

        $unclaimed = Customer::factory()->create(['email' => 'loose@example.com', 'user_id' => null]);
        $account = User::factory()->create(['role' => 'customer', 'email' => 'loose@example.com']);
        $this->assertSame($account->id, CustomerEmailResolver::userForCustomer($unclaimed)?->id);

        $orphan = Customer::factory()->create(['email' => 'nobody@example.com', 'user_id' => null]);
        $this->assertNull(CustomerEmailResolver::userForCustomer($orphan));
        $this->assertNull(CustomerEmailResolver::userForCustomer(null));
    }

    public function test_user_for_service_request_prefers_account_then_contact_link(): void
    {
        [$user, $customer] = $this->linkedAccount();
        $linked = $this->request(['customer_id' => $user->id]);
        $this->assertSame($user->id, CustomerEmailResolver::userForServiceRequest($linked)?->id);

        $unlinkedCustomer = Customer::factory()->create([
            'email' => 'guest@example.com',
            'user_id' => null,
        ]);
        $guestAccount = User::factory()->create(['role' => 'customer', 'email' => 'guest@example.com']);
        $unlinked = $this->request([
            'customer_id' => null,
            'pet_id' => null,
            'customer_email' => 'guest@example.com',
        ]);
        $this->assertSame($guestAccount->id, CustomerEmailResolver::userForServiceRequest($unlinked)?->id);

        $unreachable = $this->request([
            'customer_id' => null,
            'pet_id' => null,
            'customer_email' => 'absent@example.com',
        ]);
        $this->assertNull(CustomerEmailResolver::userForServiceRequest($unreachable));
    }
}
