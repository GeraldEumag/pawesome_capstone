<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * F-09: profile photos were previously served unauthenticated at
 * /api/files/profile-photos/{userId}/view — enumerable by sequential ID.
 * Now: auth required; owner or any staff role may view.
 */
class ProfilePhotoAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::disk('public')->put(
            'profile_photos/owner_1.png',
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')
        );

        $this->owner = User::factory()->create([
            'role'          => 'customer',
            'profile_photo' => 'profile_photos/owner_1.png',
        ]);
    }

    private function headersFor(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('t')->plainTextToken];
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->getJson("/api/files/profile-photos/{$this->owner->id}/view")
            ->assertUnauthorized();
    }

    public function test_owner_can_view_own_photo(): void
    {
        $this->getJson(
            "/api/files/profile-photos/{$this->owner->id}/view",
            $this->headersFor($this->owner)
        )
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png');
    }

    public function test_other_customer_cannot_view_photo(): void
    {
        $other = User::factory()->create(['role' => 'customer']);

        $this->getJson(
            "/api/files/profile-photos/{$this->owner->id}/view",
            $this->headersFor($other)
        )->assertForbidden();
    }

    public function test_staff_can_view_photo(): void
    {
        foreach (['receptionist', 'cashier', 'admin', 'veterinary'] as $role) {
            $staff = User::factory()->create(['role' => $role]);

            $this->getJson(
                "/api/files/profile-photos/{$this->owner->id}/view",
                $this->headersFor($staff)
            )->assertOk();
        }
    }

    public function test_customer_gets_403_not_404_when_enumerating(): void
    {
        // A probing customer is stopped by authorization before any
        // lookup happens — they learn nothing about whether the ID exists.
        $other = User::factory()->create(['role' => 'customer']);

        $this->getJson(
            "/api/files/profile-photos/99999/view",
            $this->headersFor($other)
        )->assertForbidden();
    }

    public function test_staff_gets_404_for_missing_user_and_missing_photo(): void
    {
        $staff = User::factory()->create(['role' => 'admin']);

        $this->getJson(
            "/api/files/profile-photos/99999/view",
            $this->headersFor($staff)
        )->assertNotFound();

        $noPhoto = User::factory()->create(['role' => 'customer', 'profile_photo' => null]);
        $this->getJson(
            "/api/files/profile-photos/{$noPhoto->id}/view",
            $this->headersFor($staff)
        )->assertNotFound();
    }

    public function test_path_outside_profile_photos_dir_is_rejected(): void
    {
        $staff = User::factory()->create(['role' => 'admin']);
        $poisoned = User::factory()->create([
            'role'          => 'customer',
            'profile_photo' => 'payment_proofs/../profile_photos/x.png',
        ]);

        $this->getJson(
            "/api/files/profile-photos/{$poisoned->id}/view",
            $this->headersFor($staff)
        )->assertNotFound();
    }

    public function test_photo_stored_outside_allowed_dir_is_rejected(): void
    {
        $staff = User::factory()->create(['role' => 'admin']);
        Storage::disk('public')->put('payment_proofs/secret.png', 'x');
        $misplaced = User::factory()->create([
            'role'          => 'customer',
            'profile_photo' => 'payment_proofs/secret.png',
        ]);

        $this->getJson(
            "/api/files/profile-photos/{$misplaced->id}/view",
            $this->headersFor($staff)
        )->assertNotFound();
    }
}
