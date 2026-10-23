<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\MedicalRecord;
use App\Models\Pet;
use App\Models\Prescription;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * UX handoff hardening: the billing page can trigger consultation completion
 * without re-sending clinical fields, and prescription rows can link to
 * inventory items while still allowing custom medication names.
 */
class VetUxHandoffTest extends TestCase
{
    use RefreshDatabase;

    private function userWithToken(string $role): User
    {
        $user = User::factory()->create([
            'role' => $role,
            'is_active' => true,
        ]);

        $user->plain_text_token = $user->createToken('test-token')->plainTextToken;

        return $user;
    }

    private function authHeader(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->plain_text_token];
    }

    private function startedAppointment(User $vet, array $overrides = []): Appointment
    {
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create();

        $appointment = Appointment::factory()->create(array_merge([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'in_consultation',
            'scheduled_at' => now(),
            'started_at' => now(),
        ], $overrides));

        MedicalRecord::create([
            'pet_id' => $pet->id,
            'appointment_id' => $appointment->id,
            'veterinarian_id' => $vet->id,
            'visit_date' => now(),
            'status' => MedicalRecord::STATUS_FINALIZED,
        ]);

        return $appointment;
    }

    public function test_complete_with_empty_body_preserves_clinical_fields(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->startedAppointment($vet, [
            'diagnosis' => 'Otitis externa',
            'treatment_notes' => 'Ear flush and drops',
            'prescription' => 'Otomax BID x7d',
            'vet_remarks' => 'Recheck in a week',
            'outcome' => 'discharged_home',
            'follow_up_required' => true,
            'follow_up_due' => now()->addWeek()->toDateString(),
        ]);

        $this->withHeaders($this->authHeader($vet))
            ->postJson("/api/veterinary/consultations/{$appointment->id}/complete", [])
            ->assertOk()
            ->assertJsonPath('consultation.status', 'checkout');

        $appointment->refresh();
        $this->assertSame('Otitis externa', $appointment->diagnosis);
        $this->assertSame('Ear flush and drops', $appointment->treatment_notes);
        $this->assertSame('Otomax BID x7d', $appointment->prescription);
        $this->assertSame('Recheck in a week', $appointment->vet_remarks);
        $this->assertSame('discharged_home', $appointment->outcome);
        $this->assertTrue((bool) $appointment->follow_up_required);
        $this->assertNotNull($appointment->follow_up_due);
    }

    public function test_prescription_linked_to_inventory_resolves_item_name(): void
    {
        $vet = $this->userWithToken('veterinary');
        $appointment = $this->startedAppointment($vet);

        $item = InventoryItem::factory()->create([
            'name' => 'Amoxicillin 250mg Tablets',
            'status' => 'active',
            'item_class' => 'medicine',
            'is_service_consumable' => true,
        ]);

        $response = $this->withHeaders($this->authHeader($vet))
            ->postJson('/api/veterinary/medical-records', [
                'pet_id' => $appointment->pet_id,
                'appointment_id' => $appointment->id,
                'visit_date' => now()->toISOString(),
                'prescriptions' => [
                    [
                        'inventory_item_id' => $item->id,
                        'medication_name' => 'Name typed wrong on purpose',
                        'dosage' => '250mg',
                        'frequency' => 'BID',
                        'duration' => '7 days',
                    ],
                    [
                        'medication_name' => 'Custom Compounded Suspension',
                        'dosage' => '5ml',
                        'frequency' => 'TID',
                        'duration' => '10 days',
                    ],
                ],
            ]);

        $response->assertCreated();

        $linked = Prescription::whereNotNull('inventory_item_id')->firstOrFail();
        $this->assertSame($item->id, (int) $linked->inventory_item_id);
        $this->assertSame('Amoxicillin 250mg Tablets', $linked->medication_name);

        $custom = Prescription::whereNull('inventory_item_id')->firstOrFail();
        $this->assertSame('Custom Compounded Suspension', $custom->medication_name);
    }

    public function test_inventory_items_endpoint_exposes_item_class(): void
    {
        $vet = $this->userWithToken('veterinary');
        InventoryItem::factory()->create([
            'status' => 'active',
            'item_class' => 'medicine',
            'is_service_consumable' => true,
            'stock' => 25,
        ]);

        $response = $this->withHeaders($this->authHeader($vet))
            ->getJson('/api/veterinary/inventory-items')
            ->assertOk();

        $items = $response->json('items');
        $this->assertNotEmpty($items);
        $this->assertSame('medicine', $items[0]['item_class']);
    }

    public function test_cashier_verifying_linked_service_request_completes_visit(): void
    {
        $vet = $this->userWithToken('veterinary');
        $cashier = $this->userWithToken('cashier');
        $customerUser = $this->userWithToken('customer');
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        $serviceRequest = \App\Models\ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'pet_id' => $pet->id,
            'request_type' => 'veterinary',
            'service_name' => 'Veterinary Consultation',
            'pet_name' => $pet->name,
            'customer_name' => $customer->name,
            'customer_email' => 'owner@example.com',
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'booking_channel' => 'walk_in',
        ]);

        $appointment = $this->startedAppointment($vet, [
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_request_id' => $serviceRequest->id,
            'status' => 'checkout',
        ]);

        $this->withHeaders($this->authHeader($cashier))
            ->postJson("/api/cashier/payment-requests/{$serviceRequest->id}/verify", [
                'type' => 'service_request',
                'payment_method' => 'cash',
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $appointment->refresh();
        $this->assertSame('paid', $appointment->payment_status);
        $this->assertSame('completed', $appointment->status);
        $this->assertNotNull($appointment->completed_at);
    }

    public function test_receptionist_can_approve_vet_request_at_rescheduled_slot(): void
    {
        $receptionist = $this->userWithToken('receptionist');
        $vet = $this->userWithToken('veterinary');
        $customerUser = $this->userWithToken('customer');
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        // The requested slot already passed — approving as-is must fail.
        $serviceRequest = \App\Models\ServiceRequest::create([
            'customer_id' => $customerUser->id,
            'pet_id' => $pet->id,
            'request_type' => 'veterinary',
            'service_name' => 'Veterinary Consultation',
            'pet_name' => $pet->name,
            'customer_name' => $customer->name,
            'customer_email' => 'owner@example.com',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'request_date' => now()->subDay()->toDateString(),
            'request_time' => '09:00',
        ]);

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/requests/{$serviceRequest->id}/approve", [
                'veterinarian_id' => $vet->id,
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.veterinarian_id.0', 'Choose another available appointment time or veterinarian.');

        $newDate = now()->addDays(3)->toDateString();
        $newTime = '14:00';

        $this->withHeaders($this->authHeader($receptionist))
            ->postJson("/api/receptionist/requests/{$serviceRequest->id}/approve", [
                'veterinarian_id' => $vet->id,
                'request_date' => $newDate,
                'request_time' => $newTime,
            ])
            ->assertOk();

        $serviceRequest->refresh();
        $this->assertSame('approved', $serviceRequest->status);
        $this->assertSame($newDate, $serviceRequest->request_date);
        $this->assertSame($newTime, $serviceRequest->request_time);

        $appointment = Appointment::where('service_request_id', $serviceRequest->id)->firstOrFail();
        $this->assertSame('scheduled', $appointment->status);
        $this->assertSame($vet->id, (int) $appointment->veterinarian_id);
        $this->assertSame(
            \Carbon\Carbon::parse("{$newDate} {$newTime}", 'Asia/Manila')->setTimezone('UTC')->toDateTimeString(),
            $appointment->scheduled_at->setTimezone('UTC')->toDateTimeString()
        );
    }
}
