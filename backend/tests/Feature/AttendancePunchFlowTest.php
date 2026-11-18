<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AttendancePunchFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.timezone' => 'Asia/Manila']);
        $this->employee = User::factory()->create([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => null,
            'hourly_rate' => null,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function headers(): array
    {
        return ['Authorization' => 'Bearer ' . $this->employee->createToken('attendance-punch-test')->plainTextToken];
    }

    public function test_time_in_and_out_record_local_date_late_and_early_leave_once(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-03 08:30:00', 'Asia/Manila'));
        $this->withHeaders($this->headers())
            ->postJson('/api/attendance/check-in')
            ->assertOk()
            ->assertJsonPath('data.is_late', true)
            ->assertJsonPath('data.status', 'late');

        $attendance = Attendance::where('user_id', $this->employee->id)->sole();
        $this->assertSame('2026-06-03', $attendance->date->toDateString());
        $this->assertSame('08:30', $attendance->check_in->format('H:i'));
        $this->assertNull($attendance->approved_by);
        $this->assertNull($attendance->salary_rate);

        Carbon::setTestNow(Carbon::parse('2026-06-03 16:00:00', 'Asia/Manila'));
        $this->withHeaders($this->headers())
            ->postJson('/api/attendance/check-out')
            ->assertOk()
            ->assertJsonPath('data.is_early_leave', true)
            ->assertJsonPath('data.status', 'early_leave');

        $attendance->refresh();
        $this->assertSame('16:00', $attendance->check_out->format('H:i'));
        $this->assertEquals(6.5, (float) $attendance->total_hours);

        $this->withHeaders($this->headers())
            ->postJson('/api/attendance/check-out')
            ->assertStatus(422);
        $this->assertSame(1, Attendance::where('user_id', $this->employee->id)->count());
    }

    public function test_duplicate_time_in_and_time_out_without_time_in_are_rejected(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-03 08:00:00', 'Asia/Manila'));
        $this->withHeaders($this->headers())->postJson('/api/attendance/check-in')->assertOk();
        $this->withHeaders($this->headers())->postJson('/api/attendance/check-in')->assertStatus(422);
        $this->assertSame(1, Attendance::where('user_id', $this->employee->id)->count());

        $other = User::factory()->create(['role' => 'receptionist', 'is_active' => true]);
        $this->withHeaders(['Authorization' => 'Bearer ' . $other->createToken('no-punch')->plainTextToken])
            ->postJson('/api/attendance/check-out')
            ->assertNotFound();
    }

    public function test_self_service_attendance_is_staff_only_and_reports_the_manila_business_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-03 00:30:00', 'Asia/Manila'));
        $payrollUser = User::factory()->create(['role' => 'payroll', 'is_active' => true]);
        $this->withHeaders(['Authorization' => 'Bearer ' . $payrollUser->createToken('payroll-attendance')->plainTextToken])
            ->getJson('/api/my-attendance')
            ->assertOk()
            ->assertJsonPath('today', '2026-06-03');

        $customer = User::factory()->create(['role' => 'customer', 'is_active' => true]);
        $this->withHeaders(['Authorization' => 'Bearer ' . $customer->createToken('customer-attendance')->plainTextToken])
            ->getJson('/api/my-attendance')
            ->assertForbidden();
    }
}
