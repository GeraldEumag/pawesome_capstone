<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class SystemThemeSettingsTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function public_settings_preserve_the_existing_default_for_a_fresh_install(): void
    {
        $this->getJson('/api/settings/public')
            ->assertOk()
            ->assertJsonPath('theme_color', 'blush-pink');
    }

    #[Test]
    public function admin_can_select_cream_white_as_a_system_theme(): void
    {
        $admin = User::factory()->admin()->create();
        $token = $admin->createToken('theme-test')->plainTextToken;

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/settings/theme', ['theme_color' => 'cream-white'])
            ->assertOk()
            ->assertJsonPath('theme_color', 'cream-white');

        $this->getJson('/api/settings/public')
            ->assertOk()
            ->assertJsonPath('theme_color', 'cream-white');
    }

    #[Test]
    public function admin_cannot_save_an_unknown_theme_preset(): void
    {
        $admin = User::factory()->admin()->create();
        $token = $admin->createToken('theme-test')->plainTextToken;

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/settings/theme', ['theme_color' => 'not-a-preset'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('theme_color');
    }
}
