<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class MedicalRecordFormPayloadTest extends TestCase
{
    use DatabaseTransactions;

    public function test_veterinary_form_can_finalize_with_blank_optional_numeric_vitals(): void
    {
        $vet = User::factory()->create(['role' => 'veterinary', 'is_active' => true]);
        $customer = Customer::factory()->create();
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create(['category' => 'Consultation']);
        $appointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $vet->id,
            'status' => 'scheduled',
            'scheduled_at' => Carbon::now()->addDay(),
        ]);
        $headers = ['Authorization' => 'Bearer ' . $vet->createToken('medical-record-form')->plainTextToken];
        $start = $this->withHeaders($headers)
            ->postJson("/api/veterinary/consultations/{$appointment->id}/start")
            ->assertOk();
        $recordId = $start->json('medical_record.id');

        $this->withHeaders($headers)
            ->putJson("/api/veterinary/medical-records/{$recordId}", [
                'appointment_id' => $appointment->id,
                'pet_id' => $pet->id,
                'visit_date' => now()->toISOString(),
                'chief_complaint' => '',
                'symptoms' => '',
                'diagnosis' => 'Routine checkup findings',
                'treatment_plan' => 'Continue routine care',
                'weight_kg' => '',
                'temperature_celsius' => '',
                'heart_rate' => '',
                'respiratory_rate' => '',
                'notes' => '',
                'status' => 'finalized',
                'prescriptions' => [],
            ])
            ->assertOk()
            ->assertJsonPath('record.status', 'finalized');

        $this->assertDatabaseHas('medical_records', [
            'id' => $recordId,
            'status' => 'finalized',
            'weight_kg' => null,
            'temperature_celsius' => null,
            'heart_rate' => null,
            'respiratory_rate' => null,
        ]);
    }
}
