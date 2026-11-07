<?php

namespace Tests\Feature;

use App\Models\ClinicPaymentAccount;
use App\Models\Customer;
use App\Models\PaymentReceipt;
use App\Models\ProviderConfig;
use App\Models\ReceiptExtraction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReceiptScannerSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function authHeaders(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('receipt-settings-test')->plainTextToken];
    }

    private function manager(): User
    {
        return User::factory()->create(['role' => 'manager', 'is_active' => true]);
    }

    public function test_manager_can_read_settings(): void
    {
        ProviderConfig::updateOrCreate(['provider' => 'gcash'], [
            'reference_pattern' => '^[A-Z0-9]{10,13}$',
            'min_length' => 10,
            'max_length' => 13,
            'reference_labels' => ['Ref No.'],
            'accepted_status_texts' => ['Completed'],
            'active' => true,
        ]);

        $this->withHeaders($this->authHeaders($this->manager()))
            ->getJson('/api/manager/receipt-scanner/settings')
            ->assertOk()
            ->assertJsonStructure(['enabled', 'chain', 'thresholds', 'providers', 'clinic_accounts'])
            ->assertJsonPath('providers.0.provider', 'gcash');
    }

    public function test_manager_update_saves_provider_and_clinic_account(): void
    {
        $headers = $this->authHeaders($this->manager());

        $this->withHeaders($headers)
            ->putJson('/api/manager/receipt-scanner/settings', [
                'providers' => [[
                    'provider' => 'maya',
                    'reference_pattern' => '^[0-9]{12}$',
                    'min_length' => 12,
                    'max_length' => 12,
                    'reference_labels' => ['Ref No.'],
                    'accepted_status_texts' => ['Successful'],
                    'active' => true,
                ]],
                'clinic_accounts' => [[
                    'provider' => 'maya',
                    'account_name' => 'Pawesome Retreat Inc.',
                    'account_last4' => '4567',
                    'active' => true,
                ]],
            ])
            ->assertOk()
            ->assertJsonPath('clinic_accounts.0.account_name', 'Pawesome Retreat Inc.');

        $this->assertDatabaseHas('provider_configs', ['provider' => 'maya', 'min_length' => 12]);
        $this->assertDatabaseHas('clinic_payment_accounts', ['account_name' => 'Pawesome Retreat Inc.', 'active' => true]);
    }

    public function test_omitted_clinic_account_is_deactivated_not_deleted(): void
    {
        $account = ClinicPaymentAccount::create([
            'provider' => 'gcash',
            'account_name' => 'Old Account',
            'account_last4' => '1111',
            'active' => true,
        ]);

        $this->withHeaders($this->authHeaders($this->manager()))
            ->putJson('/api/manager/receipt-scanner/settings', ['clinic_accounts' => []])
            ->assertOk();

        $this->assertDatabaseHas('clinic_payment_accounts', ['id' => $account->id, 'active' => false]);
    }

    public function test_invalid_provider_is_rejected(): void
    {
        $this->withHeaders($this->authHeaders($this->manager()))
            ->putJson('/api/manager/receipt-scanner/settings', [
                'providers' => [['provider' => 'paypal']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['providers.0.provider']);
    }

    public function test_metrics_endpoint_returns_per_reader_breakdown(): void
    {
        $receipt = PaymentReceipt::create([
            'payable_type' => 'service_request',
            'payable_id' => 1,
            'disk' => 'private',
            'disk_path' => 'payment-proofs/metrics.png',
            'mime' => 'image/png',
            'size_bytes' => 68,
            'sha256' => hash('sha256', 'metrics-test'),
            'status' => PaymentReceipt::STATUS_READY,
        ]);

        ReceiptExtraction::create([
            'receipt_id' => $receipt->id,
            'reader' => 'vision',
            'reader_version' => 'test',
            'reference_normalized' => 'ABC1234567',
            'latency_ms' => 1200,
        ]);

        $this->withHeaders($this->authHeaders($this->manager()))
            ->getJson('/api/manager/receipt-scanner/metrics')
            ->assertOk()
            ->assertJsonPath('total_receipts', 1)
            ->assertJsonPath('per_reader.0.reader', 'vision')
            ->assertJsonPath('per_reader.0.reads', 1)
            ->assertJsonPath('per_reader.0.with_reference', 1)
            ->assertJsonPath('per_reader.0.auto_fill_rate', 1)
            ->assertJsonPath('per_reader.0.avg_latency_ms', 1200);
    }

    public function test_customer_cannot_access_receipt_scanner_settings(): void
    {
        $customerUser = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        Customer::factory()->create(['user_id' => $customerUser->id, 'email' => $customerUser->email]);
        $headers = $this->authHeaders($customerUser);

        $this->withHeaders($headers)->getJson('/api/manager/receipt-scanner/settings')->assertForbidden();
        $this->withHeaders($headers)->getJson('/api/manager/receipt-scanner/metrics')->assertForbidden();
    }
}
