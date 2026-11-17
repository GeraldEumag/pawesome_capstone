<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Finalization regression suite — M-01 display reconciliation, M-02
 * maker-checker gate for unlinked payrolls, payroll_id collision retry,
 * and additional F-002 tamper probes.
 *
 * M-01: Payroll::total_deductions is the true component sum (statutory +
 *       tax + manual + loans) — never derived from gross − net so the
 *       net=0 floor can't overstate it.
 * M-02: unlinked rows (no user_id/employee_id) require approval by a
 *       DIFFERENT authorized manager; release needs a recorded approval
 *       that only approve() can write — PUT-status bypass is blocked.
 * ID  : store()/generate() retry the whole DB op on payroll_id collision.
 */
class PayrollFinalizationTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $approver;
    private string $managerToken;
    private string $approverToken;

    private const START = '2024-06-01';
    private const END = '2024-06-15';

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = User::factory()->create([
            'role' => 'manager', 'is_active' => true, 'base_salary' => 45000,
        ]);
        $this->approver = User::factory()->create([
            'role' => 'manager', 'is_active' => true, 'base_salary' => 45000,
        ]);
        $this->managerToken = $this->manager->createToken('test')->plainTextToken;
        $this->approverToken = $this->approver->createToken('test')->plainTextToken;
    }

    private function managerAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->managerToken];
    }

    private function approverAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->approverToken];
    }

    private function staffUser(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'cashier', 'is_active' => true, 'base_salary' => 26000,
            'department' => 'Operations', 'position' => 'Cashier',
        ], $overrides));
    }

    private function createUnlinkedPayroll(array $overrides = []): Payroll
    {
        $res = $this->postJson('/api/manager/payroll', array_merge([
            'employee_name' => 'Contractual Worker',
            'pay_period_start' => self::START,
            'pay_period_end' => self::END,
            'base_salary' => 13000,
            'gross_pay' => 13000,
            'net_pay' => 11000,
        ], $overrides), $this->managerAuth());
        $res->assertStatus(200);

        return Payroll::findOrFail($res->json('data.id'));
    }

    /* ---------------- M-01: total_deductions accessor --------------- */

    public function test_index_rows_carry_component_sum_total_deductions(): void
    {
        $user = $this->staffUser();
        // Full attendance → earned gross so this is the non-floor case where
        // total_deductions must also equal gross − net.
        foreach (['2024-06-01','2024-06-03','2024-06-04','2024-06-05','2024-06-06','2024-06-07','2024-06-08','2024-06-10','2024-06-11','2024-06-12','2024-06-13','2024-06-14','2024-06-15'] as $day) {
            Attendance::create([
                'user_id' => $user->id, 'date' => $day,
                'check_in' => '08:00', 'check_out' => '17:00',
                'total_hours' => 8, 'overtime_hours' => 0, 'status' => 'present',
            ]);
        }
        $this->postJson('/api/manager/payroll', [
            'user_id' => $user->id,
            'pay_period_start' => self::START,
            'pay_period_end' => self::END,
            'base_salary' => 26000,
            'salary_loan' => 500,
            'deductions' => 250,
            'gross_pay' => 0, 'net_pay' => 0, // tampered — recomputed anyway
        ], $this->managerAuth())->assertStatus(200);

        $row = Payroll::where('user_id', $user->id)->firstOrFail();
        $expected = $row->sss_contribution + $row->philhealth_contribution
            + $row->pagibig_contribution + $row->tax_deduction
            + $row->deductions + $row->salary_loan + $row->cash_advance;

        $this->assertEqualsWithDelta($expected, $row->total_deductions, 0.01,
            'total_deductions accessor must equal the component sum');

        $res = $this->getJson('/api/manager/payroll', $this->managerAuth())->assertStatus(200);
        $api = collect($res->json('data'))->firstWhere('id', $row->id);
        $this->assertNotNull($api);
        $this->assertEqualsWithDelta($expected, (float) $api['total_deductions'], 0.01,
            'index payload must carry the component-sum total_deductions');
        // Non-floor case: total_deductions reconciles with gross − net.
        $this->assertEqualsWithDelta(
            (float) $row->gross_pay - (float) $row->net_pay,
            (float) $api['total_deductions'], 0.01
        );
    }

    public function test_total_deductions_is_true_component_sum_not_gross_minus_net(): void
    {
        // deductions > gross → net floors at 0 → gross − net = gross would
        // overstate the deduction total; the accessor must stay the true sum.
        $payroll = Payroll::create([
            'employee_name' => 'Floor Case',
            'department' => 'Operations',
            'position' => 'Staff',
            'pay_period_start' => self::START,
            'pay_period_end' => self::END,
            'pay_period_label' => 'Jun 01 - Jun 15, 2024',
            'base_salary' => 10000,
            'gross_pay' => 1000,
            'net_pay' => 0, // floored
            'deductions' => 2000,
            'status' => 'draft',
        ]);

        $this->assertEqualsWithDelta(2000, $payroll->total_deductions, 0.01,
            'accessor must report the component sum even when net is floored');
        $this->assertGreaterThan(
            (float) $payroll->gross_pay - (float) $payroll->net_pay,
            (float) $payroll->total_deductions,
            'sanity: gross − net (=1000) diverges from total (2000) at the floor'
        );
    }

    /* ------------- M-02: maker-checker on unlinked rows ------------- */

    public function test_unlinked_row_is_flagged_and_creator_cannot_self_approve(): void
    {
        $payroll = $this->createUnlinkedPayroll();
        $this->assertTrue($payroll->is_unlinked);
        $this->assertSame($this->manager->id, $payroll->processed_by);

        $this->postJson("/api/manager/payroll/{$payroll->id}/approve", [],
            $this->managerAuth())
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertSame('draft', $payroll->fresh()->status,
            'rejected self-approval must not transition status');
    }

    public function test_different_manager_can_approve_and_release_unlinked_row(): void
    {
        $payroll = $this->createUnlinkedPayroll();

        $this->postJson("/api/manager/payroll/{$payroll->id}/approve", [],
            $this->approverAuth())->assertStatus(200);

        $payroll = $payroll->fresh();
        $this->assertSame('pending', $payroll->status);
        $this->assertSame($this->approver->id, $payroll->approved_by,
            'approve() must record who approved it');
        $this->assertNotNull($payroll->approved_at);

        $this->postJson("/api/manager/payroll/{$payroll->id}/release",
            ['payment_method' => 'Cash'], $this->approverAuth())->assertStatus(200);
        $this->assertSame('paid', $payroll->fresh()->status);
    }

    public function test_put_pending_bypass_cannot_release_unlinked_row(): void
    {
        $payroll = $this->createUnlinkedPayroll();

        // Creator bypasses approve() via PUT status=pending — allowed field,
        // but release must still require the recorded approval.
        $this->putJson("/api/manager/payroll/{$payroll->id}", [
            'status' => 'pending',
        ], $this->managerAuth())->assertStatus(200);

        $payroll = $payroll->fresh();
        $this->assertSame('pending', $payroll->status);
        $this->assertNull($payroll->approved_by);

        $this->postJson("/api/manager/payroll/{$payroll->id}/release",
            ['payment_method' => 'Cash'], $this->approverAuth())
            ->assertStatus(422)
            ->assertJsonPath('success', false);
        $this->assertSame('pending', $payroll->fresh()->status,
            'unlinked row must not be paid without recorded approval');
    }

    public function test_linked_row_creator_can_still_self_approve(): void
    {
        $user = $this->staffUser();
        $res = $this->postJson('/api/manager/payroll', [
            'user_id' => $user->id,
            'pay_period_start' => self::START,
            'pay_period_end' => self::END,
            'base_salary' => 26000,
        ], $this->managerAuth())->assertStatus(200);
        $payroll = Payroll::findOrFail($res->json('data.id'));
        $this->assertFalse($payroll->is_unlinked);

        $this->postJson("/api/manager/payroll/{$payroll->id}/approve", [],
            $this->managerAuth())->assertStatus(200);
        $this->assertSame($this->manager->id, $payroll->fresh()->approved_by,
            'approve() must stamp approved_by for linked rows too');
    }

    /* ---------- payroll_id collision retry (store + generate) ------- */

    /**
     * A listener that steals the ID the in-flight model just computed — a
     * deterministic stand-in for a concurrent writer winning the race.
     */
    private function injectIdThief(?bool &$collided = null): void
    {
        // Force the model to boot BEFORE registering the thief — otherwise
        // this listener is registered ahead of the boot() creating hook and
        // sees an empty payroll_id (the hook hasn't run yet).
        new Payroll;
        $stolen = false;
        Payroll::creating(function (Payroll $payroll) use (&$stolen, &$collided) {
            if ($stolen || empty($payroll->payroll_id)) {
                return;
            }
            $stolen = true;
            $collided = true;
            // Raw insert bypasses events (no recursion) and claims the id.
            DB::table('payrolls')->insert([
                'payroll_id' => $payroll->payroll_id,
                'employee_name' => 'Concurrent Writer',
                'department' => 'Operations',
                'position' => 'Staff',
                'pay_period_label' => 'Stolen ID Fixture',
                'pay_period_start' => '2024-01-01',
                'pay_period_end' => '2024-01-15',
                'base_salary' => 0, 'gross_pay' => 0, 'net_pay' => 0,
                'status' => 'draft',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        });
    }

    public function test_store_recovers_from_payroll_id_collision(): void
    {
        $user = $this->staffUser();
        $this->injectIdThief();

        $res = $this->postJson('/api/manager/payroll', [
            'user_id' => $user->id,
            'pay_period_start' => self::START,
            'pay_period_end' => self::END,
            'base_salary' => 26000,
        ], $this->managerAuth());

        $res->assertStatus(200);
        $this->assertTrue(
            Payroll::where('employee_name', 'Concurrent Writer')->exists(),
            'competitor row must have stolen the first id'
        );
        $new = Payroll::where('user_id', $user->id)->latest()->firstOrFail();
        $this->assertNotSame(
            Payroll::where('employee_name', 'Concurrent Writer')->first()->payroll_id,
            $new->payroll_id,
            'retry must regenerate a fresh unique payroll_id'
        );
    }

    public function test_generate_recovers_from_payroll_id_collision(): void
    {
        $user = $this->staffUser();
        $collided = false;
        $this->injectIdThief($collided);

        $res = $this->postJson('/api/manager/payroll/generate', [
            'period_start' => self::START,
            'period_end' => self::END,
        ], $this->managerAuth());

        $res->assertStatus(200);
        $this->assertTrue($collided, 'the id thief must have forced a collision');
        $row = Payroll::where('user_id', $user->id)->first();
        $this->assertNotNull($row, 'generate must still produce the payroll row after collision');
        $this->assertNotNull($row->payroll_id);
        $this->assertSame(1, Payroll::where('user_id', $user->id)->count(),
            'the retry must not produce a duplicate row for the employee');
        // NOTE: updateOrCreate wraps its write in a savepoint while the
        // RefreshDatabase transaction is active, so the stolen competitor row
        // is rolled back together with the colliding attempt. In production
        // the concurrent commit lives on another connection and survives —
        // the retry then recomputes MAX+1 exactly as the store() test proves.
        $ids = Payroll::pluck('payroll_id');
        $this->assertSame($ids->count(), $ids->unique()->count(),
            'all payroll_ids must remain unique after the collision');
    }

    /* ------------------ F-002 extra tamper probes ------------------- */

    public function test_store_rejects_negative_deduction_values(): void
    {
        $this->postJson('/api/manager/payroll', [
            'employee_name' => 'Tampered',
            'pay_period_start' => self::START,
            'pay_period_end' => self::END,
            'base_salary' => 13000,
            'gross_pay' => 13000,
            'net_pay' => 11000,
            'deductions' => -500,
        ], $this->managerAuth())->assertStatus(422);
    }

    public function test_store_ignores_spoofed_status_and_attribution_fields(): void
    {
        $user = $this->staffUser();
        $res = $this->postJson('/api/manager/payroll', [
            'user_id' => $user->id,
            'pay_period_start' => self::START,
            'pay_period_end' => self::END,
            'base_salary' => 26000,
            'status' => 'paid',               // spoof — must be dropped
            'approved_by' => $this->manager->id, // spoof — not a validated field
            'processed_by' => $this->approver->id,
        ], $this->managerAuth())->assertStatus(200);

        $payroll = Payroll::findOrFail($res->json('data.id'));
        $this->assertSame('draft', $payroll->status);
        $this->assertNull($payroll->approved_by);
        $this->assertSame($this->manager->id, $payroll->processed_by);
    }
}
