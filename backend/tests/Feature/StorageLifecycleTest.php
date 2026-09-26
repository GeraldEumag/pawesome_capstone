<?php

namespace Tests\Feature;

use App\Models\Boarding;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\FileStorageService;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\UnableToWriteFile;
use Mockery;
use Tests\TestCase;

class StorageLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        Storage::fake('public');
    }

    private function png(string $name = 'proof.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, base64_decode(self::PNG));
    }

    private function actingWithToken(User $user): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $user->createToken('t')->plainTextToken]);
    }

    private function approvedServiceRequest(User $customer): ServiceRequest
    {
        return ServiceRequest::create([
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_name' => 'Buddy',
            'request_type' => 'grooming',
            'service_name' => 'Full Groom',
            'price' => 500,
            'total_amount' => 500,
            'status' => 'approved',
            'payment_status' => 'unpaid',
        ]);
    }

    public function test_payment_proof_flows_from_customer_to_cashier_and_rejected_proof_is_retained_on_resubmit(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $cashier = User::factory()->create(['role' => 'cashier']);
        $request = $this->approvedServiceRequest($customer);

        // Customer uploads proof -> DB pending, file on private disk only.
        $this->actingWithToken($customer)
            ->postJson("/api/customer/requests/{$request->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'REF-001',
                'payment_proof' => $this->png(),
            ])->assertOk()->assertJsonPath('payment_status', 'pending');

        $firstPath = $request->fresh()->payment_proof;
        $this->assertSame('pending', $request->fresh()->payment_status);
        $this->assertMatchesRegularExpression('#^payment-proofs/proof_\d+_[A-Za-z0-9]{10}\.png$#', $firstPath);
        Storage::disk('private')->assertExists($firstPath);
        Storage::disk('public')->assertMissing($firstPath);

        // Cashier (next role) sees it in the queue with a secure proof URL, and can open it.
        $queue = $this->actingWithToken($cashier)->getJson('/api/cashier/payment-requests')->assertOk()->json('payments');
        $item = collect($queue)->first(fn ($p) => $p['type'] === 'service_request' && $p['id'] === $request->id);
        $this->assertNotNull($item, 'Service request proof should be visible to cashier');
        $this->assertStringEndsWith("/api/files/payment-proofs/service-request/{$request->id}/view", $item['proof_url']);

        $this->actingWithToken($cashier)
            ->get("/api/files/payment-proofs/service-request/{$request->id}/view")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png')
            ->assertHeader('Content-Disposition', "inline; filename=payment_proof_{$request->id}.png");

        // Cashier rejects, customer resubmits: new file referenced, rejected proof kept as evidence.
        $this->actingWithToken($cashier)
            ->postJson("/api/cashier/payment-requests/{$request->id}/reject", [
                'type' => 'service_request',
                'rejection_reason' => 'Blurry screenshot',
            ])->assertOk();
        $this->assertSame('rejected', $request->fresh()->payment_status);

        $this->actingWithToken($customer)
            ->postJson("/api/customer/requests/{$request->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'REF-002',
                'payment_proof' => $this->png('proof2.png'),
            ])->assertOk();

        $secondPath = $request->fresh()->payment_proof;
        $this->assertNotSame($firstPath, $secondPath);
        $this->assertSame('pending', $request->fresh()->payment_status);
        Storage::disk('private')->assertExists($secondPath);
        Storage::disk('private')->assertExists($firstPath);
    }

    public function test_cash_payment_needs_no_proof_and_appears_in_cashier_queue(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $cashier = User::factory()->create(['role' => 'cashier']);
        $request = $this->approvedServiceRequest($customer);

        // Cash: no proof file or reference required — cashier verifies at the counter.
        $this->actingWithToken($customer)
            ->postJson("/api/customer/requests/{$request->id}/payment-proof", [
                'payment_method' => 'cash',
            ])->assertOk()->assertJsonPath('payment_status', 'pending');

        $fresh = $request->fresh();
        $this->assertSame('cash', $fresh->payment_method);
        $this->assertSame('pending', $fresh->payment_status);
        $this->assertNull($fresh->payment_proof);

        $queue = $this->actingWithToken($cashier)
            ->getJson('/api/cashier/payment-requests')
            ->assertOk()
            ->json('payments');

        $this->assertNotNull(
            collect($queue)->first(fn ($p) => $p['type'] === 'service_request' && $p['id'] === $request->id),
            'Cash submissions must be visible to the cashier for verification'
        );
    }

    public function test_digital_payment_requires_proof_and_known_method(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $request = $this->approvedServiceRequest($customer);

        // GCash/Maya still require a proof file.
        $this->actingWithToken($customer)
            ->postJson("/api/customer/requests/{$request->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'REF-001',
            ])->assertStatus(422);

        // Unknown methods are rejected.
        $this->actingWithToken($customer)
            ->postJson("/api/customer/requests/{$request->id}/payment-proof", [
                'payment_method' => 'paypal',
                'payment_reference' => 'REF-001',
                'payment_proof' => $this->png(),
            ])->assertStatus(422);

        $this->assertSame('unpaid', $request->fresh()->payment_status);
    }

    public function test_storage_write_failure_returns_503_and_leaves_record_unchanged(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $request = $this->approvedServiceRequest($customer);

        $failingDisk = Mockery::mock(FilesystemAdapter::class);
        $failingDisk->shouldReceive('putFileAs')->andThrow(UnableToWriteFile::atLocation('payment-proofs/x.png', 'bucket unreachable'));
        Storage::set('private', $failingDisk);

        $this->actingWithToken($customer)
            ->postJson("/api/customer/requests/{$request->id}/payment-proof", [
                'payment_method' => 'gcash',
                'payment_reference' => 'REF-001',
                'payment_proof' => $this->png(),
            ])->assertStatus(503)->assertJsonStructure(['message']);

        $fresh = $request->fresh();
        $this->assertNull($fresh->payment_proof);
        $this->assertSame('unpaid', $fresh->payment_status);
    }

    public function test_failed_db_write_deletes_new_file_and_keeps_old_file(): void
    {
        Storage::disk('private')->put('pet_photos/old.png', 'old');
        $storedPath = null;

        try {
            FileStorageService::storeAndPersist(
                $this->png('new.png'), 'pet_photos', 'private',
                function (string $path) use (&$storedPath) {
                    $storedPath = $path;
                    throw new \RuntimeException('DB write failed');
                },
                oldPath: 'pet_photos/old.png',
            );
            $this->fail('Exception should propagate');
        } catch (\RuntimeException $e) {
            $this->assertSame('DB write failed', $e->getMessage());
        }

        $this->assertNotNull($storedPath);
        Storage::disk('private')->assertMissing($storedPath);
        Storage::disk('private')->assertExists('pet_photos/old.png');
    }

    public function test_pet_photo_replacement_deletes_old_file_only_after_success(): void
    {
        $owner = User::factory()->create(['role' => 'customer']);
        $customer = Customer::factory()->create(['user_id' => $owner->id, 'email' => $owner->email]);
        Storage::disk('private')->put('pet_photos/old.png', base64_decode(self::PNG));
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'image' => 'pet_photos/old.png']);

        $this->actingWithToken($owner)->putJson("/api/pets/{$pet->id}", [
            'name' => $pet->name,
            'species' => 'Dog',
            'image' => $this->png('new.png'),
        ])->assertOk();

        $newPath = $pet->fresh()->image;
        $this->assertNotSame('pet_photos/old.png', $newPath);
        Storage::disk('private')->assertExists($newPath);
        Storage::disk('private')->assertMissing('pet_photos/old.png');

        // Update without a file must not wipe the stored image.
        $this->actingWithToken($owner)->putJson("/api/pets/{$pet->id}", [
            'name' => 'Renamed',
            'species' => 'Dog',
        ])->assertOk();
        $this->assertSame($newPath, $pet->fresh()->image);
    }

    public function test_profile_photo_replacement_deletes_previous_file(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        Storage::disk('public')->put('profile_photos/old.png', base64_decode(self::PNG));
        $user->forceFill(['profile_photo' => 'profile_photos/old.png'])->save();

        $this->actingWithToken($user)
            ->postJson('/api/auth/profile-photo', ['profile_photo' => $this->png('me.png')])
            ->assertOk();

        $newPath = $user->fresh()->getRawOriginal('profile_photo');
        Storage::disk('public')->assertExists($newPath);
        Storage::disk('public')->assertMissing('profile_photos/old.png');

        $this->get("/api/files/profile-photos/{$user->id}/view")
            ->assertOk()
            ->assertHeader('Content-Disposition', "inline; filename=profile_{$user->id}.png");
    }

    public function test_vaccination_card_header_is_well_formed(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        Storage::disk('private')->put('vaccination_cards/card.png', base64_decode(self::PNG));
        $boarding = Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in' => now()->toDateString(),
            'check_out' => now()->addDay()->toDateString(),
            'status' => 'pending',
            'vaccination_card' => 'vaccination_cards/card.png',
        ]);

        $this->actingWithToken($admin)
            ->get("/api/files/vaccination-cards/{$boarding->id}/view")
            ->assertOk()
            ->assertHeader('Content-Disposition', "inline; filename=vaccination_card_{$boarding->id}.png");
    }

    public function test_inventory_upload_rejects_non_image_and_never_writes_to_public_path(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $before = glob(public_path('uploads/inventory/*')) ?: [];

        $this->actingWithToken($admin)->post('/api/inventory/items', [
            'name' => 'Shell Item',
            'category' => 'Toys',
            'price' => 10,
            'stock' => 1,
            'photo' => UploadedFile::fake()->createWithContent('shell.php', '<?php echo "pwned";'),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->assertSame($before, glob(public_path('uploads/inventory/*')) ?: []);
        $this->assertSame([], Storage::disk('public')->allFiles('inventory'));
        $this->assertDatabaseMissing('inventory_items', ['name' => 'Shell Item']);
    }

    public function test_inventory_business_validation_failure_removes_uploaded_photo(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        // Missing sku/reorder_level fails InventoryService validation after the file is stored.
        $this->actingWithToken($admin)->post('/api/inventory/items', [
            'name' => 'Incomplete Item',
            'category' => 'Toys',
            'price' => 10,
            'photo' => $this->png('toy.png'),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->assertSame([], Storage::disk('public')->allFiles('inventory'));
    }

    public function test_inventory_photo_is_stored_on_public_disk_and_exposed_via_photo_url(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $response = $this->actingWithToken($admin)->post('/api/inventory/items', [
            'name' => 'Chew Toy',
            'sku' => 'TOY-TEST-001',
            'category' => 'Toys',
            'price' => 10,
            'stock' => 1,
            'reorder_level' => 1,
            'is_sellable' => 0,
            'photo' => $this->png('toy.png'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $item = InventoryItem::where('name', 'Chew Toy')->firstOrFail();
        $this->assertMatchesRegularExpression('#^inventory/inv_\d+_[A-Za-z0-9]{10}\.png$#', $item->photo);
        Storage::disk('public')->assertExists($item->photo);
        $this->assertSame(Storage::disk('public')->url($item->photo), $response->json('item.photo_url'));
    }
}
