<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KioskPinTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        SystemSetting::set('attendance_kiosk_pin', '4821');
    }

    public function test_correct_pin_unlocks_the_kiosk(): void
    {
        $this->postJson('/api/kiosk/verify', ['pin' => '4821'])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Kiosk unlocked.');
    }

    public function test_wrong_pin_is_rejected(): void
    {
        $this->postJson('/api/kiosk/verify', ['pin' => '0000'])
            ->assertStatus(401)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Invalid kiosk PIN.');
    }

    public function test_blank_pin_fails_validation(): void
    {
        $this->postJson('/api/kiosk/verify', ['pin' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['pin']);
    }

    public function test_no_configured_pin_never_unlocks(): void
    {
        SystemSetting::set('attendance_kiosk_pin', '');

        $this->postJson('/api/kiosk/verify', ['pin' => ''])->assertStatus(422);
        $this->postJson('/api/kiosk/verify', ['pin' => 'anything'])->assertStatus(401);
    }
}
