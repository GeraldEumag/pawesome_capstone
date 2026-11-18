<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Phase6AttendanceSecurityTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->manager = User::factory()->create(['role' => 'manager', 'is_active' => true]);
        $this->customer = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        SystemSetting::set('attendance_kiosk_pin', 'test-kiosk-pin');
    }

    private function bearer(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('phase6-security')->plainTextToken];
    }

    public function test_kiosk_rejects_customer_bearer_and_query_string_tokens(): void
    {
        $this->getJson('/api/kiosk/log', $this->bearer($this->customer))->assertUnauthorized();
        $token = $this->customer->createToken('query-token')->plainTextToken;
        $this->getJson('/api/kiosk/log?token=' . urlencode($token))->assertUnauthorized();
    }

    public function test_kiosk_pin_cannot_turn_a_customer_barcode_into_staff_attendance(): void
    {
        $this->postJson('/api/kiosk/punch', ['barcode' => (string) $this->customer->id], [
            'X-Kiosk-Pin' => 'test-kiosk-pin',
            'Idempotency-Key' => '47eac4a4-5e83-4d09-8c89-2b3831eb1714',
        ])->assertForbidden();

        $this->assertSame(0, Attendance::count());
    }

    public function test_kiosk_pin_does_not_authorize_reading_the_staff_attendance_log(): void
    {
        $this->getJson('/api/kiosk/log', ['X-Kiosk-Pin' => 'test-kiosk-pin'])
            ->assertForbidden();
    }

    public function test_replaying_the_same_punch_key_returns_the_original_result_without_a_second_action(): void
    {
        $staff = User::factory()->create([
            'role' => 'cashier',
            'is_active' => true,
            'employee_no' => 'PHASE7-001',
        ]);
        $headers = [
            'X-Kiosk-Pin' => 'test-kiosk-pin',
            'Idempotency-Key' => '47eac4a4-5e83-4d09-8c89-2b3831eb1715',
        ];
        $payload = ['barcode' => $staff->employee_no];

        $first = $this->postJson('/api/kiosk/punch', $payload, $headers)->assertOk();
        $replay = $this->postJson('/api/kiosk/punch', $payload, $headers)->assertOk();

        $this->assertSame($first->json(), $replay->json());
        $attendance = Attendance::where('user_id', $staff->id)->sole();
        $this->assertNotNull($attendance->check_in);
        $this->assertNull($attendance->check_out);
        $this->assertSame(1, DB::table('attendance_punch_idempotency')->count());
    }

    public function test_reusing_an_idempotency_key_for_a_different_employee_conflicts(): void
    {
        $firstStaff = User::factory()->create(['role' => 'cashier', 'is_active' => true, 'employee_no' => 'PHASE7-002']);
        $secondStaff = User::factory()->create(['role' => 'cashier', 'is_active' => true, 'employee_no' => 'PHASE7-003']);
        $headers = [
            'X-Kiosk-Pin' => 'test-kiosk-pin',
            'Idempotency-Key' => '47eac4a4-5e83-4d09-8c89-2b3831eb1716',
        ];

        $this->postJson('/api/kiosk/punch', ['barcode' => $firstStaff->employee_no], $headers)->assertOk();
        $this->postJson('/api/kiosk/punch', ['barcode' => $secondStaff->employee_no], $headers)->assertStatus(409);
        $this->assertSame(1, Attendance::count());
    }

    public function test_unverified_biometric_and_arbitrary_terminal_punches_are_disabled(): void
    {
        $headers = $this->bearer($this->manager);
        $this->postJson('/api/manager/biometric/verify-punch', [
            'credential_id' => 'forged-credential',
            'type' => 'check_in',
        ], $headers)->assertStatus(503);
        $this->postJson('/api/manager/biometric/terminal-punch', [
            'terminal_id' => 'untrusted',
            'user_id' => $this->customer->id,
            'type' => 'check_in',
            'timestamp' => '2099-01-01 09:00:00',
        ], $headers)->assertStatus(503);

        $this->assertSame(0, Attendance::count());
    }
}
