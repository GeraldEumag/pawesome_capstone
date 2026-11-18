<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\LeaveBalance;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ManagerLeaveWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->manager = User::factory()->create(['role' => 'manager', 'is_active' => true]);
        $this->employee = User::factory()->create(['role' => 'receptionist', 'is_active' => true]);
    }

    private function headers(): array
    {
        return ['Authorization' => 'Bearer ' . $this->manager->createToken('leave-test')->plainTextToken];
    }

    private function leave(array $overrides = []): int
    {
        return DB::table('leave_requests')->insertGetId(array_merge([
            'user_id' => $this->employee->id,
            'type' => 'vacation_leave',
            'start_date' => '2026-06-03',
            'end_date' => '2026-06-03',
            'reason' => 'Personal leave',
            'half_day' => 1,
            'days_counted' => 0.5,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    private function balance(): LeaveBalance
    {
        return LeaveBalance::create([
            'user_id' => $this->employee->id,
            'leave_type' => 'vacation_leave',
            'year' => 2026,
            'total_days' => 5,
            'used_days' => 0,
            'remaining_days' => 5,
        ]);
    }

    public function test_approval_and_cancellation_atomically_reconcile_balance_and_attendance(): void
    {
        $balance = $this->balance();
        $leaveId = $this->leave();

        $this->withHeaders($this->headers())
            ->postJson("/api/manager/leaves/{$leaveId}/approve")
            ->assertOk()
            ->assertJsonPath('days_counted', 0.5);

        $this->assertDatabaseHas('leave_requests', [
            'id' => $leaveId,
            'status' => 'approved',
            'reviewed_by' => $this->manager->id,
        ]);
        $this->assertDatabaseHas('leave_balances', [
            'id' => $balance->id,
            'used_days' => 0.5,
            'remaining_days' => 4.5,
        ]);
        $this->assertDatabaseHas('attendance', [
            'user_id' => $this->employee->id,
            'date' => '2026-06-03',
            'status' => 'on_leave',
        ]);

        $this->withHeaders($this->headers())
            ->deleteJson("/api/manager/leaves/{$leaveId}/cancel")
            ->assertOk();

        $this->assertDatabaseHas('leave_requests', [
            'id' => $leaveId,
            'status' => 'cancelled',
            'cancelled_by' => $this->manager->id,
        ]);
        $this->assertDatabaseHas('leave_balances', [
            'id' => $balance->id,
            'used_days' => 0,
            'remaining_days' => 5,
        ]);
        $this->assertDatabaseHas('attendance', [
            'user_id' => $this->employee->id,
            'date' => '2026-06-03',
            'status' => 'absent',
        ]);
    }

    public function test_repeated_approval_does_not_deduct_leave_balance_twice(): void
    {
        $balance = $this->balance();
        $leaveId = $this->leave();
        $this->withHeaders($this->headers())->postJson("/api/manager/leaves/{$leaveId}/approve")->assertOk();
        $this->withHeaders($this->headers())->postJson("/api/manager/leaves/{$leaveId}/approve")->assertStatus(422);

        $balance->refresh();
        $this->assertEquals(0.5, (float) $balance->used_days);
        $this->assertEquals(4.5, (float) $balance->remaining_days);
    }

    public function test_approval_rejects_overlap_with_another_approved_leave(): void
    {
        $balance = $this->balance();
        $this->leave(['status' => 'approved']);
        $pending = $this->leave(['start_date' => '2026-06-03', 'end_date' => '2026-06-04']);

        $this->withHeaders($this->headers())
            ->postJson("/api/manager/leaves/{$pending}/approve")
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertDatabaseHas('leave_requests', ['id' => $pending, 'status' => 'pending']);
        $this->assertDatabaseHas('leave_balances', ['id' => $balance->id, 'used_days' => 0]);
    }

    public function test_cancelling_one_overlapping_legacy_leave_preserves_remaining_leave_attendance(): void
    {
        $first = $this->leave(['status' => 'approved']);
        $this->leave(['status' => 'approved']);
        Attendance::create([
            'user_id' => $this->employee->id,
            'date' => '2026-06-03',
            'status' => 'on_leave',
        ]);

        $this->withHeaders($this->headers())
            ->deleteJson("/api/manager/leaves/{$first}/cancel")
            ->assertOk();

        $this->assertDatabaseHas('attendance', [
            'user_id' => $this->employee->id,
            'date' => '2026-06-03',
            'status' => 'on_leave',
        ]);
    }
}
