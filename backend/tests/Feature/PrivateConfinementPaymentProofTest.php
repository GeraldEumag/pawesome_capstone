<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\MedicalConfinement;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PrivateConfinementPaymentProofTest extends TestCase
{
    use RefreshDatabase;

    public function test_medical_confinement_payment_proof_is_stored_on_private_disk(): void
    {
        Storage::fake('private');
        Storage::fake('public');

        $user = User::factory()->create(['role' => 'customer']);
        $user->plain_text_token = $user->createToken('test-token')->plainTextToken;
        $customer = Customer::factory()->create([
            'user_id' => $user->id,
            'email' => $user->email,
        ]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);
        $service = Service::factory()->create();
        $veterinarian = User::factory()->create(['role' => 'veterinary']);
        $appointment = Appointment::factory()->create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'veterinarian_id' => $veterinarian->id,
        ]);
        $confinement = MedicalConfinement::create([
            'consultation_id' => $appointment->id,
            'customer_id' => $customer->id,
            'customer_email' => $customer->email,
            'customer_name' => $customer->name,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'vet_id' => $veterinarian->id,
            'diagnosis' => 'Test diagnosis',
            'reason_for_confinement' => 'Test reason',
            'payment_status' => 'unpaid',
        ]);

        $this->withHeaders([
            'Authorization' => 'Bearer ' . $user->plain_text_token,
        ])->postJson("/api/customer/medical-confinements/{$confinement->id}/payment-proof", [
            'payment_method' => 'GCash',
            'payment_reference' => 'TEST-REFERENCE',
            'payment_proof' => UploadedFile::fake()->createWithContent(
                'proof.png',
                base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')
            ),
        ])->assertOk();

        $path = $confinement->fresh()->payment_proof;

        $this->assertNotEmpty($path);
        Storage::disk('private')->assertExists($path);
        Storage::disk('public')->assertMissing($path);
    }
}
