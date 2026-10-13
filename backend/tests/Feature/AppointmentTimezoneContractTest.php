<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppointmentTimezoneContractTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_customer_iso_schedule_uses_store_timezone_and_persists_the_utc_instant(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-13 12:00:00', 'Asia/Manila'));
        $user = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $customer = Customer::factory()->create(['user_id' => $user->id, 'email' => $user->email]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'dog']);
        $service = Service::factory()->create([
            'name' => 'General Check-up',
            'category' => 'Consultation',
            'duration_minutes' => 30,
        ]);
        $storeLocalSchedule = Carbon::now('Asia/Manila')->addDay()->setTime(10, 0);
        $utcSchedule = $storeLocalSchedule->copy()->utc();

        $this->withHeaders(['Authorization' => 'Bearer ' . $user->createToken('timezone-contract')->plainTextToken])
            ->postJson('/api/customer/appointments', [
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'scheduled_at' => $utcSchedule->toISOString(),
            ])
            ->assertCreated()
            ->assertJsonPath('scheduled_at', $utcSchedule->toISOString());

        $this->assertDatabaseHas('appointments', [
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'scheduled_at' => $utcSchedule->format('Y-m-d H:i:s'),
        ]);
    }
}
