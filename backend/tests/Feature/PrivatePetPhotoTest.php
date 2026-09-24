<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PrivatePetPhotoTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_pet_photo_is_private_and_owner_authorized(): void
    {
        Storage::fake('private');
        Storage::fake('public');

        $owner = User::factory()->create(['role' => 'customer']);
        $ownerToken = $owner->createToken('test-token')->plainTextToken;
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $ownerToken,
        ])->postJson('/api/customer/pets', [
            'name' => 'Buddy',
            'species' => 'Dog',
            'image' => UploadedFile::fake()->createWithContent(
                'pet.png',
                base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')
            ),
        ])->assertCreated();

        $pet = $response->json('pet');
        $path = $pet['image'];

        $this->assertNotEmpty($path);
        Storage::disk('private')->assertExists($path);
        Storage::disk('public')->assertMissing($path);
        $this->withHeaders(['Authorization' => 'Bearer ' . $ownerToken])
            ->getJson("/api/files/pet-photos/{$pet['id']}/view")
            ->assertOk();

        $this->withHeaders(['Authorization' => 'Bearer ' . $ownerToken])
            ->putJson("/api/pets/{$pet['id']}", [
                'name' => 'Buddy',
                'species' => 'Dog',
                'image' => UploadedFile::fake()->createWithContent(
                    'pet-updated.png',
                    base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')
                ),
            ])->assertOk();

        $updatedPath = \App\Models\Pet::findOrFail($pet['id'])->image;
        $this->assertNotSame($path, $updatedPath);
        Storage::disk('private')->assertMissing($path);
        Storage::disk('private')->assertExists($updatedPath);
        Storage::disk('public')->assertMissing($updatedPath);

        $other = User::factory()->create(['role' => 'customer']);
        $this->withHeaders([
            'Authorization' => 'Bearer ' . $other->createToken('test-token')->plainTextToken,
        ])->getJson("/api/files/pet-photos/{$pet['id']}/view")
            ->assertForbidden();
    }
}
