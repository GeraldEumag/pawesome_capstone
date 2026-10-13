<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\BoardingRoom;
use App\Models\BoardingRoomReservation;
use App\Models\Customer;
use App\Models\Holiday;
use App\Models\HotelRoom;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Services\Payroll\PayrollComputationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeletionReasonAuditTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('deletion-audit')->plainTextToken];
    }

    private function room(): BoardingRoom
    {
        return BoardingRoom::create([
            'room_code' => 'AUDIT-' . uniqid(),
            'room_name' => 'Audit Dog Room',
            'room_type' => 'dog_standard',
            'hotel_category' => 'dog_hotel',
            'allowed_species' => ['dog'],
            'max_capacity' => 1,
            'total_rooms' => 1,
            'daily_rate' => 800,
            'is_active' => true,
            'customer_selectable' => true,
        ]);
    }

    private function customerPet(): array
    {
        $user = $this->user('customer');
        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id, 'species' => 'dog']);

        return [$customer, $pet];
    }

    public function test_admin_service_delete_requires_reason_and_records_actor_target_and_reason(): void
    {
        $admin = $this->user('admin');
        $other = $this->user('manager');
        $service = Service::factory()->create();

        $this->withHeaders($this->headers($admin))
            ->deleteJson("/api/admin/services/{$service->id}", ['reason' => '   '])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');

        $this->withHeaders($this->headers($admin))
            ->deleteJson("/api/admin/services/{$service->id}", ['reason' => str_repeat('x', 501)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');

        $this->assertDatabaseHas('services', ['id' => $service->id, 'deleted_at' => null]);
        $this->assertDatabaseMissing('activity_logs', [
            'action' => 'service_deleted',
            'reference_id' => (string) $service->id,
        ]);

        $this->withHeaders($this->headers($admin))
            ->deleteJson("/api/admin/services/{$service->id}", [
                'reason' => 'Catalog entry retired',
                'user_id' => $other->id,
            ])
            ->assertOk();

        $this->assertSoftDeleted('services', ['id' => $service->id]);
        $log = ActivityLog::where('action', 'service_deleted')
            ->where('reference_id', (string) $service->id)
            ->firstOrFail();
        $this->assertSame($admin->id, $log->user_id);
        $this->assertSame('admin', $log->actor_role);
        $this->assertSame('Catalog entry retired', $log->metadata['reason']);
        $this->assertNotNull($log->created_at);
    }

    public function test_receptionist_service_delete_keeps_its_reasoned_audit_behavior(): void
    {
        $receptionist = $this->user('receptionist');
        $service = Service::factory()->create();

        $this->withHeaders($this->headers($receptionist))
            ->deleteJson("/api/receptionist/services/{$service->id}", ['reason' => 'Service discontinued'])
            ->assertOk();

        $this->assertSoftDeleted('services', ['id' => $service->id]);
        $log = ActivityLog::where('action', 'service_deleted')
            ->where('reference_id', (string) $service->id)
            ->firstOrFail();
        $this->assertSame($receptionist->id, $log->user_id);
        $this->assertSame('Service discontinued', $log->metadata['reason']);
    }

    public function test_receptionist_hotel_room_delete_requires_reason_and_is_audited(): void
    {
        $receptionist = $this->user('receptionist');
        $room = HotelRoom::factory()->create();

        $this->withHeaders($this->headers($receptionist))
            ->deleteJson("/api/receptionist/hotel-rooms/{$room->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');

        $this->withHeaders($this->headers($receptionist))
            ->deleteJson("/api/receptionist/hotel-rooms/{$room->id}", ['reason' => 'Room removed from inventory'])
            ->assertOk();

        $this->assertSoftDeleted('hotel_rooms', ['id' => $room->id]);
        $log = ActivityLog::where('action', 'hotel_room_deleted')
            ->where('reference_id', (string) $room->id)
            ->firstOrFail();
        $this->assertSame($receptionist->id, $log->user_id);
        $this->assertSame('Room removed from inventory', $log->metadata['reason']);
    }

    public function test_boarding_room_delete_requires_reason_and_retains_rooms_with_active_reservations(): void
    {
        $receptionist = $this->user('receptionist');
        [$customer, $pet] = $this->customerPet();
        $room = $this->room();
        BoardingRoomReservation::create([
            'room_id' => $room->id,
            'source_type' => 'pet_hotel',
            'source_id' => 999,
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'check_in_date' => Carbon::tomorrow()->toDateString(),
            'check_out_date' => Carbon::tomorrow()->toDateString(),
            'status' => 'in_stay',
        ]);

        $this->withHeaders($this->headers($receptionist))
            ->deleteJson("/api/receptionist/boarding-rooms/{$room->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');

        $this->withHeaders($this->headers($receptionist))
            ->deleteJson("/api/receptionist/boarding-rooms/{$room->id}", ['reason' => 'Facility remodel'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Cannot delete room with active reservations');

        $this->assertDatabaseHas('boarding_rooms', ['id' => $room->id, 'deleted_at' => null]);
        $this->assertDatabaseMissing('activity_logs', [
            'action' => 'boarding_room_deleted',
            'reference_id' => (string) $room->id,
        ]);
    }

    public function test_customers_cannot_call_staff_deletion_endpoints(): void
    {
        $customer = $this->user('customer');
        $service = Service::factory()->create();
        $hotelRoom = HotelRoom::factory()->create();
        $holiday = Holiday::create([
            'date' => '2026-10-21',
            'name' => 'Protected Holiday',
            'type' => 'regular',
            'year' => 2026,
            'is_recurring' => false,
        ]);

        $this->withHeaders($this->headers($customer))
            ->deleteJson("/api/admin/services/{$service->id}", ['reason' => 'Unauthorized'])
            ->assertForbidden();
        $this->withHeaders($this->headers($customer))
            ->deleteJson("/api/receptionist/hotel-rooms/{$hotelRoom->id}", ['reason' => 'Unauthorized'])
            ->assertForbidden();
        $this->withHeaders($this->headers($customer))
            ->deleteJson("/api/manager/holidays/{$holiday->id}", ['reason' => 'Unauthorized'])
            ->assertForbidden();

        $this->assertDatabaseHas('services', ['id' => $service->id, 'deleted_at' => null]);
        $this->assertDatabaseHas('hotel_rooms', ['id' => $hotelRoom->id, 'deleted_at' => null]);
        $this->assertDatabaseHas('holidays', ['id' => $holiday->id, 'deleted_at' => null]);
    }

    public function test_holiday_archive_requires_reason_audits_actor_and_preserves_historical_payroll(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-13 12:00:00'));
        $manager = $this->user('manager');
        $past = Holiday::create([
            'date' => '2026-10-12',
            'name' => 'Archived Past Regular Holiday',
            'type' => 'regular',
            'year' => 2026,
            'is_recurring' => false,
            'created_by' => $manager->id,
        ]);
        $future = Holiday::create([
            'date' => '2026-10-14',
            'name' => 'Archived Future Regular Holiday',
            'type' => 'regular',
            'year' => 2026,
            'is_recurring' => false,
            'created_by' => $manager->id,
        ]);

        $this->withHeaders($this->headers($manager))
            ->deleteJson("/api/manager/holidays/{$past->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');

        $this->withHeaders($this->headers($manager))
            ->deleteJson("/api/manager/holidays/{$past->id}", ['reason' => 'Holiday entry withdrawn'])
            ->assertOk();
        $this->withHeaders($this->headers($manager))
            ->deleteJson("/api/manager/holidays/{$future->id}", ['reason' => 'Holiday entry withdrawn'])
            ->assertOk();

        $this->assertSoftDeleted('holidays', ['id' => $past->id]);
        $log = ActivityLog::where('action', 'holiday_deleted')
            ->where('reference_id', (string) $past->id)
            ->firstOrFail();
        $this->assertSame($manager->id, $log->user_id);
        $this->assertSame('Holiday entry withdrawn', $log->metadata['reason']);
        $this->assertNotNull($log->created_at);

        $stats = app(PayrollComputationService::class)->attendanceStats(
            $manager,
            collect(),
            '2026-10-12',
            '2026-10-14'
        );
        $this->assertSame(1, $stats['regular_holiday_unworked_days']);
    }
}
