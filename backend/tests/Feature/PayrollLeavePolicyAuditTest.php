<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Leave-vs-payroll policy coverage (D-19 regression) plus documented-current
 * on_leave+punch behavior pending the D-21 owner decision.
 * June 1–15 2024 = 13 Mon–Sat workdays; Jun 2 & 9 are rest days.
 */
class PayrollLeavePolicyAuditTest extends TestCase
{
    use RefreshDatabase;

    private const START = '2024-06-01';
    private const END = '2024-06-15';

    private const WORKDAYS = [
        '2024-06-01', '2024-06-03', '2024-06-04', '2024-06-05',
        '2024-06-06', '2024-06-07', '2024-06-08', '2024-06-10',
        '2024-06-11', '2024-06-12', '2024-06-13', '2024-06-14',
        '2024-06-15',
    ];

    private const DAILY = 25000 / 26;

    private User $manager;
    private string $managerToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->manager = User::factory()->create([
            'role' => 'manager', 'is_active' => true, 'base_salary' => 45000,
        ]);
        $this->managerToken = $this->manager->createToken('test')->plainTextToken;
    }

    private function staffUser(): User
    {
        return User::factory()->create([
            'role' => 'cashier', 'is_active' => true, 'base_salary' => 25000,
            'department' => 'Operations', 'position' => 'Cashier',
        ]);
    }

    private function punch(User $user, string $date, string $in, string $out, array $extra = []): void
    {
        Attendance::create(array_merge([
            'user_id' => $user->id, 'date' => $date,
            'check_in' => $in, 'check_out' => $out,
            'total_hours' => 8, 'overtime_hours' => 0, 'status' => 'present',
        ], $extra));
    }

    private function punchAllExcept(User $user, string $except): void
    {
        foreach (self::WORKDAYS as $d) {
            if ($d !== $except) {
                $this->punch($user, $d, '08:00', '17:00');
            }
        }
    }

    private function insertLeave(User $user, string $type, string $date, string $status = 'pending'): int
    {
        return DB::table('leave_requests')->insertGetId([
            'user_id' => $user->id, 'type' => $type,
            'start_date' => $date, 'end_date' => $date,
            'reason' => 'audit', 'days_counted' => 1,
            'status' => $status, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function approveLeave(int $leaveId): void
    {
        $this->postJson("/api/manager/leaves/{$leaveId}/approve", [],
            ['Authorization' => 'Bearer ' . $this->managerToken])->assertOk();
    }

    private function computeRow(User $user): ?array
    {
        $res = $this->postJson('/api/manager/payroll/compute', [
            'period_start' => self::START, 'period_end' => self::END,
        ], ['Authorization' => 'Bearer ' . $this->managerToken]);
        $res->assertStatus(200);
        return collect($res->json('data'))->firstWhere('user_id', $user->id);
    }

    /** D-19: approved unpaid_leave deducts like an absence — never a paid day. */
    public function test_approved_unpaid_leave_is_deducted_not_paid(): void
    {
        $user = $this->staffUser();
        $this->punchAllExcept($user, '2024-06-05');

        $this->approveLeave($this->insertLeave($user, 'unpaid_leave', '2024-06-05'));

        // Approval still marks the attendance row for display purposes…
        $this->assertSame('on_leave', Attendance::where('user_id', $user->id)
            ->whereDate('date', '2024-06-05')->value('status'));

        // …but payroll must treat the day as unpaid (absence deduction).
        $row = $this->computeRow($user);
        $this->assertEquals(0, (float) $row['paid_leave_days']);
        $this->assertEquals(1, (float) $row['absent_days']);
        $this->assertEqualsWithDelta(self::DAILY, (float) $row['absent_deductions'], 0.05);
    }

    /** D-19: an on_leave row left over on an unpaid-leave date (pre-existing
     *  or manually marked) is also deducted — the payroll service consults
     *  the covering leave request's type, not just the status string. */
    public function test_on_leave_row_over_unpaid_leave_date_is_deducted(): void
    {
        $user = $this->staffUser();
        $this->punchAllExcept($user, '2024-06-05');
        $this->insertLeave($user, 'unpaid_leave', '2024-06-05', 'approved');
        Attendance::create([
            'user_id' => $user->id, 'date' => '2024-06-05', 'status' => 'on_leave',
        ]);

        $row = $this->computeRow($user);
        $this->assertEquals(0, (float) $row['paid_leave_days']);
        $this->assertEquals(1, (float) $row['absent_days']);
        $this->assertEqualsWithDelta(self::DAILY, (float) $row['absent_deductions'], 0.05);
    }

    /** Pending/rejected leave receives no approved-leave treatment — an
     *  unpunched workday counts as an ordinary absence. */
    public function test_pending_and_rejected_leave_do_not_cover_absence(): void
    {
        $user = $this->staffUser();
        $this->punchAllExcept($user, '2024-06-05');
        $this->insertLeave($user, 'vacation_leave', '2024-06-05', 'pending');
        $this->insertLeave($user, 'sick_leave', '2024-06-05', 'rejected');

        $row = $this->computeRow($user);
        $this->assertEquals(0, (float) $row['paid_leave_days']);
        $this->assertEquals(1, (float) $row['absent_days']);
        $this->assertEqualsWithDelta(self::DAILY, (float) $row['absent_deductions'], 0.05);
    }

    /** Paid leave with no punch: paid day, no deduction — baseline unchanged. */
    public function test_approved_paid_leave_is_paid_and_not_deducted(): void
    {
        $user = $this->staffUser();
        $this->punchAllExcept($user, '2024-06-05');
        $this->approveLeave($this->insertLeave($user, 'vacation_leave', '2024-06-05'));

        $row = $this->computeRow($user);
        $this->assertEquals(1, (float) $row['paid_leave_days']);
        $this->assertEquals(0, (float) $row['absent_days']);
        $this->assertEquals(0, (float) $row['absent_deductions']);
    }

    /** Overlapping approved leaves on the same date: unpaid_leave wins
     *  deterministically — a day covered by unpaid leave is never paid. */
    public function test_overlapping_paid_and_unpaid_leave_resolves_to_unpaid(): void
    {
        $user = $this->staffUser();
        $this->punchAllExcept($user, '2024-06-05');
        // Approved directly (paid first, unpaid second — order must not matter)
        $this->insertLeave($user, 'vacation_leave', '2024-06-05', 'approved');
        $this->insertLeave($user, 'unpaid_leave', '2024-06-05', 'approved');
        Attendance::create([
            'user_id' => $user->id, 'date' => '2024-06-05', 'status' => 'on_leave',
        ]);

        $row = $this->computeRow($user);
        $this->assertEquals(0, (float) $row['paid_leave_days']);
        $this->assertEquals(1, (float) $row['absent_days']);
        $this->assertEqualsWithDelta(self::DAILY, (float) $row['absent_deductions'], 0.05);
    }

    /** An approved paid leave spanning the period boundary only credits the
     *  in-period days; out-of-period days don't affect this run. */
    public function test_leave_spanning_period_boundary_counts_only_in_period_days(): void
    {
        $user = $this->staffUser();
        foreach (self::WORKDAYS as $d) {
            if (!in_array($d, ['2024-06-14', '2024-06-15'], true)) {
                $this->punch($user, $d, '08:00', '17:00');
            }
        }
        // Leave Jun 14–17: only Jun 14 + 15 fall inside Jun 1–15
        DB::table('leave_requests')->insert([
            'user_id' => $user->id, 'type' => 'vacation_leave',
            'start_date' => '2024-06-14', 'end_date' => '2024-06-17',
            'reason' => 'boundary', 'days_counted' => 2,
            'status' => 'approved', 'created_at' => now(), 'updated_at' => now(),
        ]);
        // Mark on_leave for the in-period days (as approval would)
        foreach (['2024-06-14', '2024-06-15'] as $d) {
            Attendance::create(['user_id' => $user->id, 'date' => $d, 'status' => 'on_leave']);
        }

        $row = $this->computeRow($user);
        $this->assertEquals(2, (float) $row['paid_leave_days']);
        $this->assertEquals(0, (float) $row['absent_days']);
    }

    /** Leave entirely outside the payroll period is ignored. */
    public function test_leave_outside_period_is_ignored(): void
    {
        $user = $this->staffUser();
        foreach (self::WORKDAYS as $d) {
            $this->punch($user, $d, '08:00', '17:00');
        }
        $this->insertLeave($user, 'unpaid_leave', '2024-06-20', 'approved');

        $row = $this->computeRow($user);
        $this->assertEquals(0, (float) $row['paid_leave_days']);
        $this->assertEquals(0, (float) $row['absent_days']);
        $this->assertEquals(0, (float) $row['absent_deductions']);
    }

    /** DOCUMENTED CURRENT BEHAVIOR (D-21, pending owner decision): an on_leave
     *  row carrying a check_in still credits a paid leave day AND accrues
     *  late minutes — unchanged by this increment. */
    public function test_on_leave_row_with_late_punch_pays_leave_and_deducts_lateness(): void
    {
        $user = $this->staffUser();
        foreach (self::WORKDAYS as $d) {
            $this->punch($user, $d, '08:00', '17:00');
        }
        Attendance::where('user_id', $user->id)->whereDate('date', '2024-06-05')
            ->update(['status' => 'on_leave', 'check_in' => '09:30']);

        $row = $this->computeRow($user);
        $this->assertEquals(1, (float) $row['paid_leave_days']);
        $this->assertGreaterThan(0, (float) $row['total_late_minutes']);
        $this->assertGreaterThan(0, (float) $row['late_deductions']);
    }
}
