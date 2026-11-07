<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\LandingPageContent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LandingPageContentAdminTest extends TestCase
{
    use RefreshDatabase;

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('landing-admin-test')->plainTextToken];
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin', 'is_active' => true]);
    }

    private function seedSection(string $key = 'hero', bool $active = true): LandingPageContent
    {
        return LandingPageContent::create([
            'section_key' => $key,
            'content_type' => 'json',
            'content_data' => ['title' => 'Original title', 'subtitle' => 'Original subtitle'],
            'is_active' => $active,
        ]);
    }

    public function test_admin_can_list_all_sections(): void
    {
        $this->seedSection('hero');
        $this->seedSection('about');

        $this->withHeaders($this->authHeaders($this->admin()))
            ->getJson('/api/admin/landing-page')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.section_key', 'hero');
    }

    public function test_admin_can_show_a_single_section(): void
    {
        $this->seedSection('hero');

        $this->withHeaders($this->authHeaders($this->admin()))
            ->getJson('/api/admin/landing-page/hero')
            ->assertOk()
            ->assertJsonPath('data.section_key', 'hero')
            ->assertJsonPath('data.content_data.title', 'Original title');
    }

    public function test_show_rejects_unknown_section_key(): void
    {
        $this->withHeaders($this->authHeaders($this->admin()))
            ->getJson('/api/admin/landing-page/not_a_section')
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_show_returns_404_for_missing_section(): void
    {
        $this->withHeaders($this->authHeaders($this->admin()))
            ->getJson('/api/admin/landing-page/about')
            ->assertStatus(404);
    }

    public function test_admin_can_update_section_content_and_activation(): void
    {
        $section = $this->seedSection('hero', false);
        $admin = $this->admin();

        $this->withHeaders($this->authHeaders($admin))
            ->putJson('/api/admin/landing-page/hero', [
                'content_data' => ['title' => 'New title', 'subtitle' => 'New subtitle'],
                'is_active' => true,
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.title', 'New title');

        $this->assertDatabaseHas('landing_page_contents', [
            'id' => $section->id,
            'is_active' => true,
            'updated_by' => $admin->id,
        ]);
        $this->assertSame('New title', $section->fresh()->content_data['title']);
    }

    public function test_update_requires_content_data_array(): void
    {
        $this->seedSection('hero');
        $headers = $this->authHeaders($this->admin());

        $this->withHeaders($headers)
            ->putJson('/api/admin/landing-page/hero', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['content_data']);

        $this->withHeaders($headers)
            ->putJson('/api/admin/landing-page/hero', ['content_data' => 'a string, not an array'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['content_data']);
    }

    public function test_update_rejects_unknown_section_and_missing_section(): void
    {
        $headers = $this->authHeaders($this->admin());

        $this->withHeaders($headers)
            ->putJson('/api/admin/landing-page/not_a_section', ['content_data' => ['title' => 'x']])
            ->assertStatus(422);

        $this->withHeaders($headers)
            ->putJson('/api/admin/landing-page/about', ['content_data' => ['title' => 'x']])
            ->assertStatus(404);
    }

    public function test_public_endpoint_reflects_update_after_cache_flush(): void
    {
        $this->seedSection('hero');

        // Prime the public cache with the old content.
        $this->getJson('/api/landing-page')
            ->assertOk()
            ->assertJsonPath('data.hero.title', 'Original title');

        $this->withHeaders($this->authHeaders($this->admin()))
            ->putJson('/api/admin/landing-page/hero', [
                'content_data' => ['title' => 'Updated hero', 'subtitle' => 'Updated subtitle'],
            ])
            ->assertOk();

        $this->getJson('/api/landing-page')
            ->assertOk()
            ->assertJsonPath('data.hero.title', 'Updated hero');
    }

    public function test_inactive_section_is_hidden_from_public_endpoint(): void
    {
        $this->seedSection('hero', true);
        $this->seedSection('about', false);

        $response = $this->getJson('/api/landing-page')->assertOk();

        $this->assertArrayHasKey('hero', $response->json('data'));
        $this->assertArrayNotHasKey('about', $response->json('data'));
    }

    public function test_admin_can_upload_a_section_image(): void
    {
        Storage::fake('public');

        // Minimal valid 1x1 PNG so the `image`/`mimes` rules see real image bytes
        // without needing the GD extension.
        $png = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        );
        $file = UploadedFile::fake()->createWithContent('hero.png', $png);

        $response = $this->withHeaders($this->authHeaders($this->admin()))
            ->post('/api/admin/landing-page/upload-image', [
                'image' => $file,
                'section' => 'hero',
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $path = $response->json('data.path');
        $this->assertStringStartsWith('landing-page/', $path);
        Storage::disk('public')->assertExists($path);
    }

    public function test_upload_image_validates_image_and_section(): void
    {
        Storage::fake('public');
        $headers = $this->authHeaders($this->admin());

        $this->withHeaders($headers)
            ->post('/api/admin/landing-page/upload-image', ['section' => 'hero'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['image']);

        $this->withHeaders($headers)
            ->post('/api/admin/landing-page/upload-image', [
                'image' => UploadedFile::fake()->create('notes.txt', 12, 'text/plain'),
                'section' => 'not_a_section',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['image', 'section']);
    }

    public function test_customer_is_forbidden_from_admin_landing_endpoints(): void
    {
        $this->seedSection('hero');
        $customerUser = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        Customer::factory()->create(['user_id' => $customerUser->id, 'email' => $customerUser->email]);
        $headers = $this->authHeaders($customerUser);

        $this->withHeaders($headers)->getJson('/api/admin/landing-page')->assertForbidden();
        $this->withHeaders($headers)->getJson('/api/admin/landing-page/hero')->assertForbidden();
        $this->withHeaders($headers)
            ->putJson('/api/admin/landing-page/hero', ['content_data' => []])
            ->assertForbidden();
        $this->withHeaders($headers)
            ->post('/api/admin/landing-page/upload-image', [])
            ->assertForbidden();
    }

    public function test_guest_gets_401_on_admin_landing_endpoints(): void
    {
        $this->getJson('/api/admin/landing-page')->assertUnauthorized();
        $this->putJson('/api/admin/landing-page/hero', ['content_data' => []])->assertUnauthorized();
    }
}
