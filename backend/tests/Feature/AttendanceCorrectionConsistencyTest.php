<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendanceCorrection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for attendance-correction approval consistency:
 * an approved correction that changes check_in must recompute the stored
 * is_late flag and status using the same company-schedule rule the kiosk
 * applies at punch time, and the whole approval must be atomic.
 */
class AttendanceCorrectionConsistencyTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $employee;
    private User $unauthorized;

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager      = User::factory()->create(['role' => 'manager', 'is_active' => true]);
        $this->employee     = User::factory()->create(['role' => 'cashier', 'is_active' => true]);
        $this->unauthorized = User::factory()->create(['role' => 'customer', 'is_active' => true]);
    }

    private function auth(User $u): array
    {
        return ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken];
    }

    private function correction(array $overrides = []): AttendanceCorrection
    {
        return AttendanceCorrection::create(array_merge([
            'user_id'             => $this->employee->id,
            'date'                => '2026-10-20',
            'requested_check_in'  => '08:00:00',
            'requested_check_out' => '17:00:00',
            'reason'              => 'Test correction',
            'status'              => 'pending',
        ], $overrides));
    }

    public function test_correction_to_late_check_in_sets_flag_and_status(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'check_in' => '08:00', 'check_out' => '17:00',
            'status' => 'present', 'is_late' => false, 'source' => 'manual',
        ]);
        $correction = $this->correction(['requested_check_in' => '09:30:00']);

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertOk();

        $attendance->refresh();
        $this->assertTrue((bool) $attendance->is_late);
        $this->assertSame('late', $attendance->status);
        $this->assertSame('09:30', $attendance->check_in->format('H:i'));
        $this->assertSame('approved', $correction->fresh()->status);
        $this->assertSame($attendance->id, $correction->fresh()->attendance_id);
    }

    public function test_correction_to_on_time_clears_flag_and_status(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'check_in' => '09:30', 'check_out' => '17:00',
            'status' => 'late', 'is_late' => true, 'source' => 'manual',
        ]);
        $correction = $this->correction();

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertOk();

        $attendance->refresh();
        $this->assertFalse((bool) $attendance->is_late);
        $this->assertSame('present', $attendance->status);
    }

    public function test_correction_into_grace_period_is_on_time(): void
    {
        // Shift start 08:00 + 15 min grace → 08:10 is inside grace.
        $attendance = Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'check_in' => '09:30', 'check_out' => '17:00',
            'status' => 'late', 'is_late' => true, 'source' => 'manual',
        ]);
        $correction = $this->correction(['requested_check_in' => '08:10:00']);

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertOk();

        $attendance->refresh();
        $this->assertFalse((bool) $attendance->is_late);
        $this->assertSame('present', $attendance->status);
    }

    public function test_correction_adding_check_in_to_absent_row_disproves_absence(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'status' => 'absent', 'source' => 'manual',
        ]);
        $correction = $this->correction(['requested_check_in' => '09:30:00']);

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertOk();

        $attendance->refresh();
        $this->assertTrue((bool) $attendance->is_late);
        $this->assertSame('late', $attendance->status);
    }

    public function test_approve_creates_attendance_row_when_missing(): void
    {
        $correction = $this->correction();

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertOk();

        $attendance = Attendance::where('user_id', $this->employee->id)
            ->whereDate('date', '2026-10-20')->sole();
        $this->assertSame('08:00', $attendance->check_in->format('H:i'));
        $this->assertFalse((bool) $attendance->is_late);
        $this->assertSame($attendance->id, $correction->fresh()->attendance_id);
    }

    public function test_unauthorized_role_cannot_approve(): void
    {
        $correction = $this->correction();

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->unauthorized))->assertStatus(403);

        $this->assertSame('pending', $correction->fresh()->status);
    }

    public function test_rejected_correction_leaves_attendance_unchanged(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'check_in' => '09:30', 'check_out' => '17:00',
            'status' => 'late', 'is_late' => true, 'source' => 'manual',
        ]);
        $correction = $this->correction();

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/reject",
            ['remarks' => 'No evidence provided'], $this->auth($this->manager))->assertOk();

        $attendance->refresh();
        $this->assertTrue((bool) $attendance->is_late);
        $this->assertSame('late', $attendance->status);
        $this->assertSame('09:30', $attendance->check_in->format('H:i'));
    }

    public function test_already_reviewed_correction_cannot_be_reapproved(): void
    {
        $correction = $this->correction(['status' => 'rejected']);

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertStatus(422);

        $this->assertDatabaseMissing('attendance', [
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
        ]);
    }

    public function test_on_leave_status_survives_late_correction(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'check_in' => '08:00', 'check_out' => '17:00',
            'status' => 'on_leave', 'is_late' => false, 'source' => 'manual',
        ]);
        $correction = $this->correction(['requested_check_in' => '09:30:00']);

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertOk();

        $attendance->refresh();
        // Status preserved (leave is a separate authority); flag still
        // reflects the corrected punch truthfully.
        $this->assertSame('on_leave', $attendance->status);
        $this->assertTrue((bool) $attendance->is_late);
    }

    public function test_on_leave_status_survives_on_time_correction(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'check_in' => '09:30', 'check_out' => '17:00',
            'status' => 'on_leave', 'is_late' => true, 'source' => 'manual',
        ]);
        $correction = $this->correction();

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertOk();

        $attendance->refresh();
        $this->assertSame('on_leave', $attendance->status);
        $this->assertFalse((bool) $attendance->is_late);
    }

    public function test_early_leave_status_survives_on_time_correction(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'check_in' => '09:30', 'check_out' => '15:00',
            'status' => 'early_leave', 'is_late' => true, 'source' => 'manual',
        ]);
        $correction = $this->correction();

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertOk();

        $attendance->refresh();
        $this->assertSame('early_leave', $attendance->status);
        $this->assertFalse((bool) $attendance->is_late);
    }

    public function test_failed_attendance_save_rolls_back_approval(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'check_in' => '08:00', 'check_out' => '17:00',
            'status' => 'present', 'is_late' => false, 'source' => 'manual',
        ]);
        $correction = $this->correction(['requested_check_in' => '09:30:00']);

        // Force the attendance save to fail inside the approval transaction.
        Attendance::saving(function () {
            throw new \RuntimeException('forced save failure');
        });

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertStatus(500);

        // Both writes rolled back: attendance untouched, correction pending.
        $attendance->refresh();
        $this->assertSame('08:00', $attendance->check_in->format('H:i'));
        $this->assertFalse((bool) $attendance->is_late);
        $this->assertSame('pending', $correction->fresh()->status);
        $this->assertNull($correction->fresh()->attendance_id);
    }

    public function test_dtr_report_reflects_corrected_late_state(): void
    {
        $attendance = Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'check_in' => '08:00', 'check_out' => '17:00',
            'status' => 'present', 'is_late' => false, 'source' => 'manual',
        ]);
        $correction = $this->correction(['requested_check_in' => '09:30:00']);

        $this->postJson(
            "/api/manager/attendance/corrections/{$correction->id}/approve",
            [], $this->auth($this->manager))->assertOk();

        $res = $this->getJson(
            "/api/manager/reports/dtr?start_date=2026-10-20&end_date=2026-10-20&user_id={$this->employee->id}",
            $this->auth($this->manager))->assertOk();

        $row = collect($res->json('data'))->firstWhere('date', '2026-10-20');
        $this->assertSame('09:30', $row['check_in']);
        $this->assertTrue((bool) $row['is_late']);
        $this->assertSame(90, (int) $row['late_minutes']);
    }
}
