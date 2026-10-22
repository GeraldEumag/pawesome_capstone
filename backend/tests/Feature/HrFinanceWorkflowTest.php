<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\InventoryItem;
use App\Models\InventoryMonthlyAudit;
use App\Models\Payroll;
use App\Models\SalaryLoan;
use App\Models\ThirteenthMonthAccrual;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Runtime coverage for the HR/finance workflows that lacked feature tests:
 * 13th-month accrual/pay (S-02), salary loans (S-03), remittance/DTR/exports
 * (S-04), and monthly inventory audit (S-05). Bulk payroll generation and
 * barcode lookup are already covered by PayrollEndToEndTest and
 * BarcodeLookupTest.
 */
class HrFinanceWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $employee;
    private User $customer;
    private string $managerToken;
    private string $employeeToken;
    private string $customerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = User::factory()->create([
            'role' => 'manager', 'is_active' => true, 'base_salary' => 45000,
        ]);
        $this->employee = User::factory()->create([
            'role' => 'cashier', 'is_active' => true, 'base_salary' => 25000,
        ]);
        $this->customer = User::factory()->create([
            'role' => 'customer', 'is_active' => true,
        ]);

        $this->managerToken  = $this->manager->createToken('t')->plainTextToken;
        $this->employeeToken = $this->employee->createToken('t')->plainTextToken;
        $this->customerToken = $this->customer->createToken('t')->plainTextToken;
    }

    private function auth(User|string $u): array
    {
        $token = match (true) {
            $u === 'manager'  => $this->managerToken,
            $u === 'employee' => $this->employeeToken,
            $u === 'customer' => $this->customerToken,
            default => $u->createToken('t')->plainTextToken,
        };
        return ['Authorization' => 'Bearer ' . $token];
    }

    // ------------------------------------------------------------------
    // S-02 — 13th-month pay
    // ------------------------------------------------------------------

    public function test_accrue_creates_rows_for_eligible_staff(): void
    {
        $res = $this->postJson('/api/manager/payroll/thirteenth-month/accrue',
            ['year' => 2026, 'month' => 1], $this->auth('manager'));

        $res->assertOk()->assertJsonPath('success', true);

        $accrual = ThirteenthMonthAccrual::where('user_id', $this->employee->id)
            ->where('year', 2026)->first();

        $this->assertNotNull($accrual);
        $this->assertEquals(25000.0, (float) $accrual->jan_basic);
        $this->assertEquals(round(25000 / 12, 2), (float) $accrual->total_accrued);
        $this->assertEquals('accruing', $accrual->status);
    }

    public function test_accrue_is_idempotent_per_month(): void
    {
        foreach (range(1, 2) as $i) {
            $this->postJson('/api/manager/payroll/thirteenth-month/accrue',
                ['year' => 2026, 'month' => 1], $this->auth('manager'))->assertOk();
        }

        $count = ThirteenthMonthAccrual::where('user_id', $this->employee->id)
            ->where('year', 2026)->count();
        $this->assertSame(1, $count);

        // Second month accumulates without touching the first.
        $this->postJson('/api/manager/payroll/thirteenth-month/accrue',
            ['year' => 2026, 'month' => 2], $this->auth('manager'))->assertOk();

        $a = ThirteenthMonthAccrual::where('user_id', $this->employee->id)->first();
        $this->assertEquals(25000.0, (float) $a->jan_basic);
        $this->assertEquals(25000.0, (float) $a->feb_basic);
        $this->assertEquals(round(50000 / 12, 2), (float) $a->total_accrued);
    }

    public function test_accrue_skips_inactive_and_null_salary(): void
    {
        User::factory()->create(['role' => 'receptionist', 'is_active' => false, 'base_salary' => 20000]);
        $noSalary = User::factory()->create(['role' => 'inventory', 'is_active' => true, 'base_salary' => null]);

        $this->postJson('/api/manager/payroll/thirteenth-month/accrue',
            ['year' => 2026, 'month' => 1], $this->auth('manager'))->assertOk();

        $this->assertSame(0, ThirteenthMonthAccrual::where('user_id', $noSalary->id)->count());
    }

    public function test_pay_marks_full_and_partial_then_rejects_repay(): void
    {
        $this->postJson('/api/manager/payroll/thirteenth-month/accrue',
            ['year' => 2026, 'month' => 1], $this->auth('manager'));
        $a = ThirteenthMonthAccrual::where('user_id', $this->employee->id)->first();

        // Partial payment
        $partial = $this->postJson("/api/manager/payroll/thirteenth-month/{$a->id}/pay",
            ['paid_amount' => 500], $this->auth('manager'));
        $partial->assertOk()->assertJsonPath('data.status', 'partial');

        // Remaining
        $full = $this->postJson("/api/manager/payroll/thirteenth-month/{$a->id}/pay",
            [], $this->auth('manager'));
        $full->assertOk()->assertJsonPath('data.status', 'paid');

        // Already paid
        $again = $this->postJson("/api/manager/payroll/thirteenth-month/{$a->id}/pay",
            [], $this->auth('manager'));
        $again->assertStatus(422);
    }

    public function test_pay_rejects_negative_or_invalid_amount(): void
    {
        $this->postJson('/api/manager/payroll/thirteenth-month/accrue',
            ['year' => 2026, 'month' => 1], $this->auth('manager'));
        $a = ThirteenthMonthAccrual::where('user_id', $this->employee->id)->first();

        $neg = $this->postJson("/api/manager/payroll/thirteenth-month/{$a->id}/pay",
            ['paid_amount' => -100], $this->auth('manager'));
        $this->assertSame(422, $neg->status(),
            'Negative paid_amount should be rejected; got ' . $neg->status());

        $badDate = $this->postJson("/api/manager/payroll/thirteenth-month/{$a->id}/pay",
            ['paid_date' => 'not-a-date'], $this->auth('manager'));
        $this->assertSame(422, $badDate->status(),
            'Invalid paid_date should be rejected; got ' . $badDate->status());
    }

    public function test_thirteenth_month_requires_manager_role(): void
    {
        $this->postJson('/api/manager/payroll/thirteenth-month/accrue',
            ['year' => 2026], $this->auth('employee'))->assertForbidden();
        $this->getJson('/api/manager/payroll/thirteenth-month',
            $this->auth('customer'))->assertForbidden();
    }

    // ------------------------------------------------------------------
    // S-03 — Salary loans
    // ------------------------------------------------------------------

    public function test_manager_creates_active_loan_with_full_balance(): void
    {
        $res = $this->postJson('/api/manager/salary-loans', [
            'user_id' => $this->employee->id,
            'loan_type' => 'salary_loan',
            'principal' => 5000,
            'installment_amount' => 500,
            'start_period' => '2026-11-01',
        ], $this->auth('manager'));

        $res->assertStatus(201);
        $loan = SalaryLoan::latest('id')->first();
        $this->assertEquals(5000.0, (float) $loan->balance);
        $this->assertEquals('active', $loan->status);
        $this->assertEquals($this->manager->id, $loan->approved_by);
    }

    public function test_loan_requires_a_person_and_valid_type(): void
    {
        $this->postJson('/api/manager/salary-loans', [
            'loan_type' => 'salary_loan', 'principal' => 1000,
            'installment_amount' => 100, 'start_period' => '2026-11-01',
        ], $this->auth('manager'))->assertStatus(422);

        $this->postJson('/api/manager/salary-loans', [
            'user_id' => $this->employee->id, 'loan_type' => 'bogus',
            'principal' => 1000, 'installment_amount' => 100, 'start_period' => '2026-11-01',
        ], $this->auth('manager'))->assertStatus(422);
    }

    public function test_loan_cancel_only_when_active(): void
    {
        $loan = SalaryLoan::create([
            'user_id' => $this->employee->id, 'loan_type' => 'cash_advance',
            'principal' => 1000, 'balance' => 1000, 'installment_amount' => 100,
            'start_period' => '2026-11-01', 'status' => 'active',
        ]);

        $this->deleteJson("/api/manager/salary-loans/{$loan->id}", [], $this->auth('manager'))
            ->assertOk();
        $this->assertEquals('cancelled', $loan->fresh()->status);

        $this->deleteJson("/api/manager/salary-loans/{$loan->id}", [], $this->auth('manager'))
            ->assertStatus(422);
    }

    public function test_my_loans_scopes_to_own_records_only(): void
    {
        SalaryLoan::create([
            'user_id' => $this->manager->id, 'loan_type' => 'salary_loan',
            'principal' => 9000, 'balance' => 9000, 'installment_amount' => 900,
            'start_period' => '2026-11-01', 'status' => 'active',
        ]);
        $own = SalaryLoan::create([
            'user_id' => $this->employee->id, 'loan_type' => 'salary_loan',
            'principal' => 1000, 'balance' => 1000, 'installment_amount' => 100,
            'start_period' => '2026-11-01', 'status' => 'active',
        ]);

        $res = $this->getJson('/api/my-loans', $this->auth('employee'))->assertOk();
        $ids = collect($res->json('data'))->pluck('id');
        $this->assertContains($own->id, $ids);
        $this->assertCount(1, $ids);
    }

    public function test_employee_self_service_loan_request(): void
    {
        $res = $this->postJson('/api/my-loans', [
            'loan_type' => 'cash_advance', 'principal' => 2000,
            'installment_amount' => 200, 'start_period' => '2026-11-01',
        ], $this->auth('employee'));

        $res->assertStatus(201);
        $this->assertDatabaseHas('salary_loans', [
            'user_id' => $this->employee->id, 'principal' => 2000, 'status' => 'active',
        ]);
    }

    public function test_salary_loans_require_manager_role(): void
    {
        $this->getJson('/api/manager/salary-loans', $this->auth('employee'))->assertForbidden();
        $this->postJson('/api/manager/salary-loans', [
            'user_id' => $this->employee->id, 'loan_type' => 'salary_loan',
            'principal' => 1000, 'installment_amount' => 100, 'start_period' => '2026-11-01',
        ], $this->auth('employee'))->assertForbidden();
    }

    // ------------------------------------------------------------------
    // S-04 — Remittance, DTR, attendance export
    // ------------------------------------------------------------------

    private function seedPayroll(array $over = []): Payroll
    {
        return Payroll::create(array_merge([
            'payroll_id' => 'PR-TEST-' . uniqid(),
            'user_id' => $this->employee->id,
            'employee_name' => $this->employee->name,
            'department' => 'Operations',
            'position' => 'Cashier',
            'employment_type' => 'regular',
            'rate_type' => 'monthly',
            'base_salary' => 25000,
            'gross_pay' => 12500,
            'net_pay' => 11000,
            'sss_contribution' => 625,
            'philhealth_contribution' => 312.5,
            'pagibig_contribution' => 100,
            'pay_period_start' => '2026-10-01',
            'pay_period_end' => '2026-10-15',
            'pay_period_label' => 'Oct 01 - Oct 15, 2026',
            'status' => 'paid',
        ], $over));
    }

    public function test_remittance_returns_contribution_rows_and_totals(): void
    {
        $this->seedPayroll();

        $res = $this->getJson('/api/manager/reports/remittance?period=2026-10&type=sss',
            $this->auth('manager'));

        $res->assertOk()->assertJsonPath('success', true);
        $row = collect($res->json('data'))->first();
        $this->assertEquals(625.0, (float) $row['employee_share']);
        // employer = ee × 8.5/5, total = ee × 13.5/5 (code's documented formula)
        $this->assertEquals(round(625 * 1.7, 2), (float) $row['employer_share']);
        $this->assertEquals(round(625 * 2.7, 2), (float) $row['total']);
        $this->assertEquals(625.0, (float) $res->json('totals.employee_total'));
    }

    public function test_remittance_empty_period_returns_zero_totals(): void
    {
        $res = $this->getJson('/api/manager/reports/remittance?period=2020-01&type=pagibig',
            $this->auth('manager'));
        $res->assertOk();
        $this->assertCount(0, $res->json('data'));
        $this->assertEquals(0, (float) $res->json('totals.grand_total'));
    }

    public function test_remittance_rejects_malformed_period_and_type(): void
    {
        $bad = $this->getJson('/api/manager/reports/remittance?period=bogus&type=sss',
            $this->auth('manager'));
        $this->assertSame(422, $bad->status(),
            'Malformed period should be a 422, got ' . $bad->status());

        $badType = $this->getJson('/api/manager/reports/remittance?period=2026-10&type=hack',
            $this->auth('manager'));
        $this->assertSame(422, $badType->status(),
            'Unknown remittance type should be a 422, got ' . $badType->status());
    }

    public function test_remittance_requires_manager_role(): void
    {
        $this->getJson('/api/manager/reports/remittance?period=2026-10',
            $this->auth('employee'))->assertForbidden();
    }

    public function test_dtr_report_filters_and_computes(): void
    {
        Attendance::create([
            'user_id' => $this->employee->id,
            'date' => '2026-10-20',
            'check_in' => '09:30', 'check_out' => '17:00',
            'status' => 'present', 'source' => 'manual', 'is_late' => true,
        ]);
        Attendance::create([
            'user_id' => $this->manager->id,
            'date' => '2026-10-20',
            'check_in' => '08:00', 'check_out' => '17:00',
            'status' => 'present', 'source' => 'manual',
        ]);

        // Missing dates → 422
        $this->getJson('/api/manager/reports/dtr', $this->auth('manager'))
            ->assertStatus(422);

        $res = $this->getJson(
            '/api/manager/reports/dtr?start_date=2026-10-20&end_date=2026-10-20&user_id=' . $this->employee->id,
            $this->auth('manager'));

        $res->assertOk()->assertJsonPath('success', true);
        $this->assertCount(1, $res->json('data'));
        $row = $res->json('data.0');
        $this->assertEquals('09:30', $row['check_in']);
        $this->assertGreaterThan(0, $row['late_minutes']);
        $this->assertTrue($row['is_late']);
    }

    public function test_attendance_export_returns_data(): void
    {
        Attendance::create([
            'user_id' => $this->employee->id, 'date' => '2026-10-20',
            'check_in' => '08:00', 'status' => 'present',
        ]);

        $res = $this->getJson(
            '/api/attendance/export?start_date=2026-10-01&end_date=2026-10-31&user_id=' . $this->employee->id,
            $this->auth('manager'));

        $res->assertOk()->assertJsonPath('success', true);
        $this->assertGreaterThanOrEqual(1, count($res->json('data')));
    }

    // ------------------------------------------------------------------
    // S-05 — Monthly inventory audit
    // ------------------------------------------------------------------

    public function test_monthly_audit_lists_items_as_pending(): void
    {
        InventoryItem::factory()->create(['name' => 'Audit Item A', 'stock' => 50, 'status' => 'active']);

        $res = $this->getJson('/api/inventory/monthly-audit?month=2026-10',
            $this->auth($this->inventory_user()));

        $res->assertOk()->assertJsonPath('success', true);
        $item = collect($res->json('items'))->firstWhere('name', 'Audit Item A');
        $this->assertEquals('pending', $item['audit_status']);
        $this->assertEquals(50, $item['system_stock']);
    }

    public function test_save_monthly_audit_adjusts_stock_and_records_variance(): void
    {
        $item = InventoryItem::factory()->create(['name' => 'Counted Item', 'stock' => 50, 'sku' => 'AUD-001', 'status' => 'active']);

        $res = $this->postJson('/api/inventory/monthly-audit', [
            'audit_month' => '2026-10',
            'items' => [[
                'inventory_item_id' => $item->id,
                'actual_stock' => 45,
                'reason' => 'physical count',
            ]],
        ], $this->auth($this->inventory_user()));

        $res->assertOk()->assertJsonPath('success', true);

        $audit = InventoryMonthlyAudit::where('inventory_item_id', $item->id)
            ->where('audit_month', '2026-10')->first();
        $this->assertNotNull($audit);
        $this->assertEquals(45, (int) $audit->actual_stock);
        $this->assertEquals(-5, (int) $audit->variance);
        $this->assertEquals('discrepancy', $audit->status);
        // Physical count is authoritative — stock corrected.
        $this->assertEquals(45, (int) $item->fresh()->stock);
    }

    public function test_save_monthly_audit_validation(): void
    {
        $item = InventoryItem::factory()->create(['stock' => 10, 'status' => 'active']);

        // Negative actual_stock
        $this->postJson('/api/inventory/monthly-audit', [
            'audit_month' => '2026-10',
            'items' => [['inventory_item_id' => $item->id, 'actual_stock' => -1]],
        ], $this->auth($this->inventory_user()))->assertStatus(422);

        // Unknown item
        $this->postJson('/api/inventory/monthly-audit', [
            'audit_month' => '2026-10',
            'items' => [['inventory_item_id' => 99999, 'actual_stock' => 5]],
        ], $this->auth($this->inventory_user()))->assertStatus(422);
    }

    public function test_monthly_audit_report_summary(): void
    {
        $item = InventoryItem::factory()->create(['stock' => 10, 'status' => 'active']);

        $this->postJson('/api/inventory/monthly-audit', [
            'audit_month' => '2026-10',
            'items' => [['inventory_item_id' => $item->id, 'actual_stock' => 10]],
        ], $this->auth($this->inventory_user()))->assertOk();

        $res = $this->getJson('/api/inventory/monthly-audit-report?month=2026-10',
            $this->auth($this->inventory_user()));

        $res->assertOk();
        $this->assertEquals(1, $res->json('summary.total_items'));
        $this->assertEquals(1, $res->json('summary.matched_items'));
        $this->assertEquals(0, $res->json('summary.discrepancy_items'));
    }

    public function test_monthly_audit_requires_inventory_role(): void
    {
        $this->getJson('/api/inventory/monthly-audit', $this->auth('employee'))->assertForbidden();
        $this->postJson('/api/inventory/monthly-audit', [
            'audit_month' => '2026-10', 'items' => [],
        ], $this->auth('customer'))->assertForbidden();
    }

    private function inventory_user(): User
    {
        return User::factory()->create(['role' => 'inventory', 'is_active' => true]);
    }
}
