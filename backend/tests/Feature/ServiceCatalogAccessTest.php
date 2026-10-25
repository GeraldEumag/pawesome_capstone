<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Service catalog overhaul coverage: unified ServiceCatalogController mounts,
 * manager full CRUD, veterinary medical-category restriction, reason-required
 * disable/delete, and active-appointment delete blocking.
 */
class ServiceCatalogAccessTest extends TestCase
{
    use RefreshDatabase;

    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['customer', 'receptionist', 'manager', 'veterinary', 'admin'] as $role) {
            $this->users[$role] = User::factory()->create(['role' => $role]);
        }
    }

    private function as(string $role): static
    {
        return $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->users[$role]->createToken('t')->plainTextToken,
        ]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Test Consultation',
            'category' => 'Consultation',
            'price' => 500,
            'description' => 'Test service',
            'duration_minutes' => 30,
        ], $overrides);
    }

    // ─── Index: all services incl. inactive + metadata ───────────────────

    public function test_index_returns_inactive_services_and_categories(): void
    {
        Service::factory()->create(['name' => 'Active One', 'is_active' => true]);
        Service::factory()->create(['name' => 'Inactive One', 'is_active' => false]);

        $res = $this->as('manager')->getJson('/api/manager/services');
        $res->assertOk()->assertJsonPath('success', true);

        $names = collect($res->json('data'))->pluck('name');
        $this->assertContains('Active One', $names);
        $this->assertContains('Inactive One', $names);
        $this->assertEquals(Service::VALID_CATEGORIES, $res->json('categories'));
    }

    // ─── Manager full CRUD ───────────────────────────────────────────────

    public function test_manager_can_crud_services(): void
    {
        $create = $this->as('manager')->postJson('/api/manager/services', $this->payload());
        $create->assertCreated();
        $id = $create->json('data.id');

        $this->as('manager')->putJson("/api/manager/services/{$id}", [
            'price' => 750,
        ])->assertOk()->assertJsonPath('data.price', '750.00');

        $this->as('manager')->deleteJson("/api/manager/services/{$id}", [
            'reason' => 'Duplicate entry cleanup',
        ])->assertOk();

        $this->assertSoftDeleted('services', ['id' => $id]);
    }

    public function test_manager_can_crud_hotel_and_boarding_rooms(): void
    {
        $hotel = $this->as('manager')->postJson('/api/manager/hotel-rooms', [
            'room_number' => 'H-900',
            'name' => 'Manager Suite',
            'type' => 'kennel',
            'size' => 'large',
            'capacity' => 2,
            'daily_rate' => 1500,
        ]);
        $hotel->assertCreated();
        $hotelId = $hotel->json('room.id');

        $this->as('manager')->putJson("/api/manager/hotel-rooms/{$hotelId}", [
            'status' => 'maintenance',
        ])->assertOk();

        $this->as('manager')->deleteJson("/api/manager/hotel-rooms/{$hotelId}", [
            'reason' => 'Room decommissioned',
        ])->assertOk();

        // allowed_species is derived from room_type — callers don't send it,
        // and a contradictory value is corrected server-side.
        $boarding = $this->as('manager')->postJson('/api/manager/boarding-rooms', [
            'room_code' => 'DOG-T-01',
            'room_name' => 'Test Kennel',
            'room_type' => 'dog_standard',
            'allowed_species' => ['cat'],
            'max_capacity' => 1,
            'total_rooms' => 2,
            'daily_rate' => 800,
        ]);
        $boarding->assertCreated();
        $boardingId = $boarding->json('room.id');
        $this->assertSame(['dog'], $boarding->json('room.allowed_species'));

        $this->as('manager')->putJson("/api/manager/boarding-rooms/{$boardingId}", [
            'is_active' => false,
        ])->assertOk();

        // Changing room_type re-derives species.
        $this->as('manager')->putJson("/api/manager/boarding-rooms/{$boardingId}", [
            'room_type' => 'cat_condo',
        ])->assertOk();
        $this->assertSame(['cat'], \App\Models\BoardingRoom::find($boardingId)->allowed_species);

        $this->as('manager')->deleteJson("/api/manager/boarding-rooms/{$boardingId}", [
            'reason' => 'Duplicate room type',
        ])->assertOk();
    }

    public function test_hotel_room_manual_occupied_status_is_rejected(): void
    {
        $create = $this->as('manager')->postJson('/api/manager/hotel-rooms', [
            'room_number' => 'H-901',
            'name' => 'Guard Room',
            'type' => 'standard',
            'size' => 'small',
            'capacity' => 1,
            'daily_rate' => 500,
        ])->assertCreated();

        $this->as('manager')->putJson('/api/manager/hotel-rooms/' . $create->json('room.id'), [
            'status' => 'occupied',
        ])->assertStatus(422);
    }

    // ─── Veterinary medical-category restriction ─────────────────────────

    public function test_vet_can_manage_medical_category_services(): void
    {
        $create = $this->as('veterinary')->postJson('/api/veterinary/services', $this->payload());
        $create->assertCreated();
        $id = $create->json('data.id');

        $this->as('veterinary')->putJson("/api/veterinary/services/{$id}", [
            'price' => 600,
        ])->assertOk();
    }

    public function test_vet_cannot_create_frontdesk_category(): void
    {
        $this->as('veterinary')->postJson('/api/veterinary/services', $this->payload([
            'category' => 'Grooming',
        ]))->assertForbidden();

        $this->as('veterinary')->postJson('/api/veterinary/services', $this->payload([
            'category' => 'Hotel',
        ]))->assertForbidden();
    }

    public function test_vet_cannot_edit_or_delete_frontdesk_service(): void
    {
        $grooming = Service::factory()->create(['category' => 'Grooming']);

        $this->as('veterinary')->putJson("/api/veterinary/services/{$grooming->id}", [
            'price' => 100,
        ])->assertForbidden();

        $this->as('veterinary')->deleteJson("/api/veterinary/services/{$grooming->id}", [
            'reason' => 'Trying to remove',
        ])->assertForbidden();
    }

    public function test_vet_cannot_move_service_out_of_medical_categories(): void
    {
        $consult = Service::factory()->create(['category' => 'Consultation']);

        $this->as('veterinary')->putJson("/api/veterinary/services/{$consult->id}", [
            'category' => 'Grooming',
        ])->assertForbidden();
    }

    // ─── Reason requirements ─────────────────────────────────────────────

    public function test_disable_requires_reason(): void
    {
        $service = Service::factory()->create(['is_active' => true]);

        $this->as('receptionist')->putJson("/api/receptionist/services/{$service->id}", [
            'is_active' => false,
        ])->assertStatus(422);

        $this->as('receptionist')->putJson("/api/receptionist/services/{$service->id}", [
            'is_active' => false,
            'reason' => 'Temporarily unavailable',
        ])->assertOk();
        $this->assertFalse($service->fresh()->is_active);
    }

    public function test_delete_requires_reason(): void
    {
        $service = Service::factory()->create();

        $this->as('receptionist')->deleteJson("/api/receptionist/services/{$service->id}", [
            'reason' => '',
        ])->assertStatus(422);
    }

    // ─── Delete blocking semantics ───────────────────────────────────────

    private function appointmentFor(Service $service, string $status): Appointment
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        return Appointment::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'status' => $status,
            'scheduled_at' => now()->addDay(),
        ]);
    }

    public function test_delete_blocked_by_active_appointment(): void
    {
        $service = Service::factory()->create();
        $this->appointmentFor($service, 'requested');
        $this->appointmentFor($service, 'scheduled');

        $this->as('manager')->deleteJson("/api/manager/services/{$service->id}", [
            'reason' => 'Trying to remove',
        ])->assertStatus(422);

        $this->assertNull($service->fresh()->deleted_at);
    }

    public function test_delete_allowed_when_only_completed_appointments(): void
    {
        $service = Service::factory()->create();
        $this->appointmentFor($service, 'completed');
        $this->appointmentFor($service, 'cancelled');

        $this->as('manager')->deleteJson("/api/manager/services/{$service->id}", [
            'reason' => 'Service discontinued',
        ])->assertOk();

        $this->assertSoftDeleted('services', ['id' => $service->id]);
    }

    // ─── Role boundaries ─────────────────────────────────────────────────

    public function test_customer_cannot_access_management_endpoints(): void
    {
        $this->as('customer')->getJson('/api/manager/services')->assertForbidden();
        $this->as('customer')->getJson('/api/receptionist/services')->assertForbidden();
        $this->as('customer')->postJson('/api/veterinary/services', $this->payload())->assertForbidden();
    }

    public function test_receptionist_retains_access_and_super_roles_bypass(): void
    {
        $this->as('receptionist')->getJson('/api/receptionist/services')->assertOk();
        // admin bypasses staff role checks on any mount
        $this->as('admin')->getJson('/api/manager/services')->assertOk();
        $this->as('admin')->getJson('/api/admin/services')->assertOk();
    }
}
