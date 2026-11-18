<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\MedicalConfinement;
use App\Models\Pet;
use App\Models\User;
use App\Models\WardBed;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The receptionist admissions screen reads the confinement list and must
 * show the assigned ward bed (relation `wardBed`, serialized as `ward_bed`).
 */
class ReceptionistConfinementListTest extends TestCase
{
    use RefreshDatabase;

    public function test_receptionist_list_includes_assigned_ward_bed(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist', 'is_active' => true]);
        $customerUser = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $customer = Customer::factory()->create(['user_id' => $customerUser->id, 'email' => $customerUser->email]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $bed = WardBed::create(['name' => 'GEN-LIST-1', 'ward' => 'general', 'daily_rate' => 800, 'status' => 'occupied']);
        $appointment = Appointment::factory()->create(['customer_id' => $customer->id, 'pet_id' => $pet->id]);

        $confinement = MedicalConfinement::create([
            'consultation_id' => $appointment->id,
            'vet_id' => User::factory()->create(['role' => 'veterinary', 'is_active' => true])->id,
            'customer_id' => $customer->id,
            'customer_email' => $customer->email,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'diagnosis' => 'Dehydration',
            'reason_for_confinement' => 'Needs IV fluids and monitoring',
            'status' => 'bed_assigned',
            'payment_status' => 'unpaid',
            'ward_bed_id' => $bed->id,
            'daily_rate' => 800,
        ]);

        $token = $receptionist->createToken('test')->plainTextToken;
        $row = collect($this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/receptionist/medical-confinements')
            ->assertOk()
            ->json('medical_confinements'))
            ->firstWhere('id', $confinement->id);

        $this->assertNotNull($row);
        $this->assertSame('GEN-LIST-1', $row['ward_bed']['name'] ?? null);
    }
}
