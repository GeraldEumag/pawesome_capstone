<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Reason-required staff actions in the receptionist module:
 * disabling or deleting a service must carry an auditable reason,
 * and formatted service requests must expose stored reasons.
 */
class ReceptionistReasonRequiredTest extends TestCase
{
    use RefreshDatabase;

    private function actingWithToken(User $user): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $user->createToken('t')->plainTextToken]);
    }

    private function receptionist(): User
    {
        return User::factory()->create(['role' => 'receptionist']);
    }

    public function test_disabling_service_without_reason_is_rejected(): void
    {
        $service = Service::factory()->create(['is_active' => true]);

        $this->actingWithToken($this->receptionist())
            ->putJson("/api/receptionist/services/{$service->id}", ['is_active' => false])
            ->assertStatus(422);

        $this->assertTrue($service->fresh()->is_active);
        $this->assertDatabaseMissing('activity_logs', ['action' => 'service_disabled']);
    }

    public function test_disabling_service_with_reason_succeeds_and_logs(): void
    {
        $staff = $this->receptionist();
        $service = Service::factory()->create(['is_active' => true]);

        $this->actingWithToken($staff)
            ->putJson("/api/receptionist/services/{$service->id}", [
                'is_active' => false,
                'reason'    => 'Maintenance or facility issue',
            ])->assertOk();

        $this->assertFalse($service->fresh()->is_active);

        $log = ActivityLog::where('action', 'service_disabled')->sole();
        $this->assertSame($staff->id, $log->user_id);
        $this->assertSame($service->id, $log->metadata['service_id']);
        $this->assertSame('Maintenance or facility issue', $log->metadata['reason']);
    }

    public function test_enabling_service_requires_no_reason(): void
    {
        $service = Service::factory()->create(['is_active' => false]);

        $this->actingWithToken($this->receptionist())
            ->putJson("/api/receptionist/services/{$service->id}", ['is_active' => true])
            ->assertOk();

        $this->assertTrue($service->fresh()->is_active);
        $this->assertDatabaseMissing('activity_logs', ['action' => 'service_disabled']);
    }

    public function test_service_edit_form_without_is_active_is_unaffected(): void
    {
        $service = Service::factory()->create(['is_active' => true]);

        $this->actingWithToken($this->receptionist())
            ->putJson("/api/receptionist/services/{$service->id}", [
                'name'  => 'Renamed Service',
                'price' => 500,
            ])->assertOk();

        $this->assertSame('Renamed Service', $service->fresh()->name);
    }

    public function test_deleting_service_without_reason_is_rejected(): void
    {
        $service = Service::factory()->create();

        $this->actingWithToken($this->receptionist())
            ->deleteJson("/api/receptionist/services/{$service->id}")
            ->assertStatus(422);

        $this->assertNull($service->fresh()->deleted_at);
        $this->assertDatabaseMissing('activity_logs', ['action' => 'service_deleted']);
    }

    public function test_deleting_service_with_reason_soft_deletes_and_logs(): void
    {
        $staff = $this->receptionist();
        $service = Service::factory()->create();

        $this->actingWithToken($staff)
            ->deleteJson("/api/receptionist/services/{$service->id}", [
                'reason' => 'Service permanently discontinued',
            ])->assertOk();

        $this->assertNotNull($service->fresh()->deleted_at);

        $log = ActivityLog::where('action', 'service_deleted')->sole();
        $this->assertSame($staff->id, $log->user_id);
        $this->assertSame('Service permanently discontinued', $log->metadata['reason']);
    }

    public function test_formatted_request_exposes_rejection_and_cancellation_reasons(): void
    {
        $request = ServiceRequest::create([
            'customer_name'      => 'Reason Test Customer',
            'customer_email'     => 'reason@example.com',
            'pet_name'           => 'Test Pet',
            'service_name'       => 'Grooming',
            'request_type'       => 'grooming',
            'request_date'       => now()->toDateString(),
            'status'             => 'rejected',
            'rejection_reason'   => 'Fully booked for the selected date/time',
            'cancellation_reason' => null,
        ]);

        $response = $this->actingWithToken($this->receptionist())
            ->getJson('/api/receptionist/requests')
            ->assertOk();

        $row = collect($response->json('requests'))->firstWhere('id', $request->id);
        $this->assertSame('Fully booked for the selected date/time', $row['rejection_reason']);
        $this->assertNull($row['cancellation_reason']);
    }
}
