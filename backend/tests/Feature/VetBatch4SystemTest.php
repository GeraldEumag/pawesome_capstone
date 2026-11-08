<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VetBatch4SystemTest extends TestCase
{
    use RefreshDatabase;

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('batch4-test')->plainTextToken];
    }

    private function staff(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    public function test_veterinary_dashboard_requires_the_veterinary_role(): void
    {
        $this->getJson('/api/veterinary/dashboard')->assertStatus(401);

        $customer = $this->staff('customer');
        $this->withHeaders($this->headers($customer))->getJson('/api/veterinary/dashboard')->assertForbidden();

        $cashier = $this->staff('cashier');
        $this->withHeaders($this->headers($cashier))->getJson('/api/veterinary/dashboard')->assertForbidden();

        $vet = $this->staff('veterinary');
        $this->withHeaders($this->headers($vet))->getJson('/api/veterinary/dashboard')->assertOk();
    }

    public function test_veterinary_lists_appointments_and_patients(): void
    {
        $vet = $this->staff('veterinary');
        $headers = $this->headers($vet);

        $this->withHeaders($headers)->getJson('/api/veterinary/appointments')->assertOk();
        $this->withHeaders($headers)->getJson('/api/veterinary/patients')->assertOk();
        $this->withHeaders($headers)->getJson('/api/veterinary/history')->assertOk();
    }

    public function test_veterinary_medical_confinements_and_consultations_queues(): void
    {
        $vet = $this->staff('veterinary');
        $headers = $this->headers($vet);

        $this->withHeaders($headers)->getJson('/api/veterinary/medical-confinements')->assertOk();
        $this->withHeaders($headers)->getJson('/api/veterinary/consultations')->assertOk();
        $this->withHeaders($headers)->getJson('/api/veterinary/consultations/scheduled')->assertOk();
    }

    public function test_veterinary_reports_respond(): void
    {
        $vet = $this->staff('veterinary');
        $headers = $this->headers($vet);

        $this->withHeaders($headers)->getJson('/api/veterinary/reports/overview')->assertOk();
        $this->withHeaders($headers)->getJson('/api/veterinary/reports/appointments')->assertOk();
    }

    public function test_vet_tech_can_read_intake_but_not_vet_only_history_or_dashboard(): void
    {
        // Vet techs read the shared intake board; clinical history and dashboard
        // remain restricted to veterinarians and administrators.
        $tech = $this->staff('vet_tech');
        $headers = $this->headers($tech);
        $this->withHeaders($headers)->getJson('/api/veterinary/appointments')->assertOk();
        $this->withHeaders($headers)->getJson('/api/veterinary/history')->assertForbidden();
        $this->withHeaders($headers)->getJson('/api/veterinary/dashboard')->assertForbidden();
    }
}
