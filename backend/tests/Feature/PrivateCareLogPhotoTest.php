<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\BoardingCareLog;
use App\Models\Customer;
use App\Models\MedicalConfinement;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PrivateCareLogPhotoTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        Storage::fake('public');
    }

    private function png(string $name = 'care.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, base64_decode(self::PNG));
    }

    private function actingWithToken(User $user): static
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $user->createToken('t')->plainTextToken]);
    }

    private function ownerFixture(): array
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = Customer::factory()->create(['user_id' => $user->id, 'email' => $user->email]);
        $pet = Pet::factory()->create(['customer_id' => $customer->id]);

        return [$user, $customer, $pet];
    }

    public function test_boarding_care_log_photo_is_private_and_access_controlled(): void
    {
        [$owner, $customer, $pet] = $this->ownerFixture();
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        $cashier = User::factory()->create(['role' => 'cashier']);
        $inventory = User::factory()->create(['role' => 'inventory']);
        $veterinary = User::factory()->create(['role' => 'veterinary']);
        $otherCustomer = User::factory()->create(['role' => 'customer']);

        $boarding = Boarding::create([
            'pet_id' => $pet->id,
            'customer_id' => $customer->id,
            'customer_email' => $customer->email,
            'check_in' => now()->toDateString(),
            'check_out' => now()->addDay()->toDateString(),
            'status' => 'checked_in',
        ]);

        $response = $this->actingWithToken($receptionist)
            ->post("/api/receptionist/boarding-requests/{$boarding->id}/care-logs", [
                'log_type' => 'feeding',
                'notes' => 'Ate well',
                'photo' => $this->png(),
            ], ['Accept' => 'application/json'])
            ->assertCreated();

        $logId = $response->json('care_log.id');
        $path = BoardingCareLog::findOrFail($logId)->photo_path;

        Storage::disk('private')->assertExists($path);
        Storage::disk('public')->assertMissing($path);

        // The API must expose an authenticated URL, never the storage path.
        $this->assertSame("/api/files/care-logs/{$logId}/view", $response->json('care_log.photo_url'));
        $this->assertArrayNotHasKey('photo_path', $response->json('care_log'));

        $viewUrl = "/api/files/care-logs/{$logId}/view";

        $this->actingWithToken($owner)->get($viewUrl)->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->actingWithToken($receptionist)->get($viewUrl)->assertOk();
        $this->actingWithToken($veterinary)->get($viewUrl)->assertOk();

        $this->actingWithToken($cashier)->get($viewUrl)->assertForbidden();
        $this->actingWithToken($inventory)->get($viewUrl)->assertForbidden();
        $this->actingWithToken($otherCustomer)->get($viewUrl)->assertForbidden();
        $this->getJson($viewUrl)->assertForbidden();
    }

    public function test_confinement_care_log_photo_is_private_and_owner_can_view(): void
    {
        [$owner, $customer, $pet] = $this->ownerFixture();
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        $veterinarian = User::factory()->create(['role' => 'veterinary']);
        $service = Service::factory()->create();
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
            'diagnosis' => 'Observation',
            'reason_for_confinement' => 'Test',
            'status' => 'admitted',
            'payment_status' => 'unpaid',
        ]);

        $response = $this->actingWithToken($receptionist)
            ->post("/api/receptionist/medical-confinements/{$confinement->id}/care-logs", [
                'log_type' => 'medication',
                'notes' => 'Dose administered',
                'photo' => $this->png(),
            ], ['Accept' => 'application/json'])
            ->assertCreated();

        $log = BoardingCareLog::findOrFail($response->json('care_log.id'));

        Storage::disk('private')->assertExists($log->photo_path);
        Storage::disk('public')->assertMissing($log->photo_path);

        $this->actingWithToken($owner)
            ->get("/api/files/care-logs/{$log->id}/view")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png');
    }
}
