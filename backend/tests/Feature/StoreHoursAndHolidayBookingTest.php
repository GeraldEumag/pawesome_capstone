<?php

namespace Tests\Feature;

use App\Models\Holiday;
use App\Models\User;
use App\Support\StoreHours;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class StoreHoursAndHolidayBookingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-12-01 08:00:00', 'Asia/Manila'));
        StoreHours::clearCache();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        StoreHours::clearCache();
        Holiday::clearCache(2026, 2027);
        parent::tearDown();
    }

    public function test_store_is_open_every_day_from_ten_to_six(): void
    {
        $this->assertSame('10:00', StoreHours::opensAt());
        $this->assertSame('18:00', StoreHours::closesAt());
        $this->assertSame([0, 1, 2, 3, 4, 5, 6], StoreHours::openDays());
        $this->assertTrue(StoreHours::isOpenDay(Carbon::parse('2026-12-06'))); // Sunday
    }

    public function test_public_settings_expose_store_hours(): void
    {
        $this->getJson('/api/settings/public')
            ->assertOk()
            ->assertJsonPath('store_hours.open', '10:00')
            ->assertJsonPath('store_hours.close', '18:00')
            ->assertJsonPath('store_hours.label', '10:00 AM – 6:00 PM');
    }

    public function test_store_hours_change_applies_after_cache_clear(): void
    {
        DB::table('system_settings')->updateOrInsert(['key' => 'store_close_time'], ['value' => '17:00', 'created_at' => now(), 'updated_at' => now()]);
        StoreHours::clearCache();

        $this->assertSame('17:00', StoreHours::closesAt());
    }

    public function test_sunday_is_bookable_for_grooming(): void
    {
        $this->getJson('/api/availability/grooming?date=2026-12-06')
            ->assertOk()
            ->assertJsonPath('available', true)
            ->assertJsonPath('holiday', null);
    }

    public function test_philippine_holiday_blocks_grooming_and_vet_availability(): void
    {
        $this->getJson('/api/availability/grooming?date=2026-12-25')
            ->assertOk()
            ->assertJsonPath('available', false)
            ->assertJsonPath('holiday', 'Christmas Day');

        $this->getJson('/api/availability/veterinary?date=2026-12-25')
            ->assertOk()
            ->assertJsonPath('holiday', 'Christmas Day');
        $this->assertSame([], $this->getJson('/api/availability/veterinary?date=2026-12-25')->json('slots'));
    }

    public function test_soft_deleted_holiday_is_not_blocked(): void
    {
        $this->assertSame('Christmas Eve', Holiday::blockedNameOn('2026-12-24'));

        Holiday::where('date', '2026-12-24')->delete();
        Holiday::clearCache(2026);

        $this->assertNull(Holiday::blockedNameOn('2026-12-24'));
    }

    public function test_hotel_stay_covering_a_holiday_is_reported(): void
    {
        $blocked = Holiday::blockedBetween('2026-12-24', '2026-12-26');

        $this->assertSame(['2026-12-24', '2026-12-25'], array_column($blocked, 'date'));
    }

    public function test_public_blocked_holiday_endpoint_lists_range(): void
    {
        $response = $this->getJson('/api/holidays/blocked?from=2026-12-20&to=2026-12-31')
            ->assertOk()
            ->json('data');

        $names = array_column($response, 'name', 'date');
        $this->assertSame('Christmas Day', $names['2026-12-25']);
        $this->assertSame('Rizal Day', $names['2026-12-30']);
    }

    public function test_holiday_slots_are_visible_to_staff_only_when_overridden(): void
    {
        $this->getJson('/api/availability/grooming?date=2026-12-25&holiday_override=1')
            ->assertJsonPath('available', false);

        $customer = User::factory()->customer()->create();
        $this->actingAs($customer)
            ->getJson('/api/availability/grooming?date=2026-12-25&holiday_override=1')
            ->assertJsonPath('available', false);

        $receptionist = User::factory()->create(['role' => 'receptionist']);
        $this->actingAs($receptionist)
            ->getJson('/api/availability/grooming?date=2026-12-25&holiday_override=1')
            ->assertJsonPath('available', true);
    }

    public function test_staff_override_is_required_to_book_a_holiday_slot(): void
    {
        $this->assertFalse(\App\Services\BookingAvailabilityService::isServiceTimeAvailable('grooming', '2026-12-25', '10:00', null));
        $this->assertTrue(\App\Services\BookingAvailabilityService::isServiceTimeAvailable('grooming', '2026-12-25', '10:00', null, null, null, null, false, true));
    }

    public function test_new_holiday_is_blocked_after_manager_adds_it(): void
    {
        $this->assertNull(Holiday::blockedNameOn('2027-01-10'));

        Holiday::create([
            'date' => '2027-01-10',
            'name' => 'Test Closure',
            'type' => 'regular',
            'year' => 2027,
            'is_recurring' => false,
        ]);
        Holiday::clearCache(2027);

        $this->assertSame('Test Closure', Holiday::blockedNameOn('2027-01-10'));
    }
}
