<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Final-stage payroll audit — reproduction tests for suspected defects.
 *
 * Each test asserts the CORRECT expected behaviour. A test that fails against
 * the current implementation is the executed proof of the defect; it must pass
 * after the corresponding minimal fix.
 *
 * F-001: attendance deductions (absent/late/undertime) are subtracted from
 *        grossPay AND included in totalDeductions → net_pay double-charges.
 * F-002: Api\PayrollController::store persists client-supplied gross_pay /
 *        net_pay verbatim without a server-side recompute.
 * F-003: Payroll::boot payroll_id uses count()+1 → collides after soft-deletes.
 */
class PayrollAuditDefectReproductionTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private string $managerToken;

    private const START = '2024-06-01';
    private const END = '2024-06-15';

    // Jun 1–15 2024 Mon–Sat workdays (Jun 2 & 9 are Sundays)
    private const WORKDAYS = [
        '2024-06-01', '2024-06-03', '2024-06-04', '2024-06-05',
        '2024-06-06', '2024-06-07', '2024-06-08', '2024-06-10',
        '2024-06-11', '2024-06-12', '2024-06-13', '2024-06-14',
        '2024-06-15',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = User::factory()->create([
            'role' => 'manager',
            'is_active' => true,
            'base_salary' => 45000,
        ]);
        $this->managerToken = $this->manager->createToken('test')->plainTextToken;
    }

    private function managerAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->managerToken];
    }

    private function staffUser(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => 26000,
            'department' => 'Operations',
            'position' => 'Cashier',
        ], $overrides));
    }

    private function punchAllWorkdays(User $user, array $except = []): void
    {
        foreach (self::WORKDAYS as $day) {
            if (in_array($day, $except, true)) {
                continue;
            }
            Attendance::create([
                'user_id' => $user->id,
                'date' => $day,
                'check_in' => '08:00',
                'check_out' => '17:00',
                'total_hours' => 8,
                'overtime_hours' => 0,
                'status' => 'present',
            ]);
        }
    }

    /**
     * F-001 — an absent day must cost the employee ONE daily rate, not two.
     *
     * ₱26,000/mo → daily ₱1,000 · period base ₱13,000 · 1 absence ₱1,000.
     * Earned gross = 13,000 − 1,000 = 12,000.
     * Statutory per cutoff: SSS 585 + PhilHealth 325 + Pag-IBIG 100.
     * Tax: taxable monthly-equiv = 24,000 − 2,020 = 21,980 → 15% band →
     *      172.05 monthly → 86.03 per cutoff.
     * Correct net = 12,000 − (585 + 325 + 100 + 86.03) = 10,903.97
     * (stored rounded value 10,903.98).
     * Buggy net (double-charge) = 12,000 − 1,000 − 1,096.03 = 9,903.97.
     */
    public function test_absent_day_is_charged_once_not_twice(): void
    {
        $user = $this->staffUser();
        $this->punchAllWorkdays($user, ['2024-06-05']); // 1 auto-absence

        $res = $this->postJson('/api/manager/payroll/compute', [
            'period_start' => self::START,
            'period_end' => self::END,
        ], $this->managerAuth())->assertStatus(200);

        $row = collect($res->json('data'))->firstWhere('user_id', $user->id);
        $this->assertNotNull($row);

        $this->assertEqualsWithDelta(12000.0, (float) $row['gross_pay'], 0.01);
        $this->assertEqualsWithDelta(1000.0, (float) $row['absent_deductions'], 0.01);
        // Pre-2025 SSS (4.5% EE on MSC 26,000 = 1,170/mo → 585/cutoff);
        // PhilHealth 5%/2 = 650/mo → 325; Pag-IBIG post-Feb-2024 MFS 10k
        // (2% → 200/mo → 100); tax on monthly taxable 21,980 → 86.03/cutoff.
        $this->assertEqualsWithDelta(585.0, (float) $row['sss_contribution'], 0.01);
        $this->assertEqualsWithDelta(325.0, (float) $row['philhealth_contribution'], 0.01);
        $this->assertEqualsWithDelta(100.0, (float) $row['pagibig_contribution'], 0.01);
        $this->assertEqualsWithDelta(86.03, (float) $row['tax_deduction'], 0.05);

        // The absence is already removed from gross — it must not also be
        // part of the deduction total applied to reach net.
        // 585 SSS + 325 PhilHealth + 100 Pag-IBIG + 86.03 tax = 1096.03
        $this->assertEqualsWithDelta(
            1096.03,
            (float) $row['total_deductions'],
            0.05,
            'total_deductions must not re-include attendance deductions already removed from gross'
        );
        $this->assertEqualsWithDelta(
            10903.98,
            (float) $row['net_pay'],
            0.05,
            'net_pay double-charges the ₱1,000 absence'
        );
    }

    /**
     * F-002 — manual payroll store must not trust client-supplied totals.
     * Submitted gross/net are wildly wrong; the server must recompute
     * through PayrollComputationService like update() already does.
     */
    public function test_manual_payroll_store_recomputes_totals_server_side(): void
    {
        $user = $this->staffUser();
        $this->punchAllWorkdays($user);

        $res = $this->postJson('/api/manager/payroll', [
            'user_id' => $user->id,
            'pay_period_start' => self::START,
            'pay_period_end' => self::END,
            'base_salary' => 26000,
            'gross_pay' => 99999.99, // tampered — must be ignored
            'net_pay' => 88888.88,   // tampered — must be ignored
        ], $this->managerAuth());

        $res->assertStatus(200);
        $payroll = Payroll::where('user_id', $user->id)
            ->whereDate('pay_period_start', self::START)
            ->whereDate('pay_period_end', self::END)
            ->firstOrFail();

        $this->assertNotEquals(99999.99, (float) $payroll->gross_pay,
            'store() persisted the client-supplied gross_pay without recompute');
        $this->assertNotEquals(88888.88, (float) $payroll->net_pay,
            'store() persisted the client-supplied net_pay without recompute');

        // Full attendance, no adjustments: gross = 13,000 period base.
        $this->assertEqualsWithDelta(13000.0, (float) $payroll->gross_pay, 0.05);
        $this->assertLessThan((float) $payroll->gross_pay, (float) $payroll->net_pay);
        $this->assertGreaterThan(0, (float) $payroll->net_pay);
    }

    /**
     * F-003 — payroll_id generation must survive soft-deleted rows.
     * count()+1 reuses the sequence number of the trashed row while the
     * unique index still holds it → duplicate-key failure.
     */
    public function test_payroll_id_generation_survives_soft_deleted_rows(): void
    {
        $user = $this->staffUser();
        $this->punchAllWorkdays($user);

        // First manual payroll → PAY-YYYY-0001
        $first = $this->postJson('/api/manager/payroll', [
            'user_id' => $user->id,
            'pay_period_start' => '2024-06-01',
            'pay_period_end' => '2024-06-15',
            'base_salary' => 26000,
            'gross_pay' => 13000,
            'net_pay' => 11000,
        ], $this->managerAuth());
        $first->assertStatus(200);
        $firstId = $first->json('data.payroll_id');

        // Soft-delete it — the unique payroll_id index keeps the value.
        $payroll = Payroll::where('payroll_id', $firstId)->firstOrFail();
        $payroll->delete();

        // Second create must get a fresh id, not collide with the trashed row.
        $second = $this->postJson('/api/manager/payroll', [
            'user_id' => $user->id,
            'pay_period_start' => '2024-06-16',
            'pay_period_end' => '2024-06-30',
            'base_salary' => 26000,
            'gross_pay' => 13000,
            'net_pay' => 11000,
        ], $this->managerAuth());

        $second->assertStatus(200, 'payroll_id collided with a soft-deleted row: ' . $second->getContent());
        $this->assertNotSame($firstId, $second->json('data.payroll_id'));
    }
}
