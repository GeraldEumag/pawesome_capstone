<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use App\Services\Payroll\PayrollComputationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ManagerPeopleEndpointTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private string $managerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = User::factory()->create([
            'role' => 'manager',
            'is_active' => true,
        ]);
        $this->managerToken = $this->manager->createToken('test-token')->plainTextToken;
    }

    private function managerAuth(): array
    {
        return ['Authorization' => 'Bearer ' . $this->managerToken];
    }

    public function test_people_lists_users_and_non_account_employees(): void
    {
        $staff = User::factory()->create(['role' => 'cashier', 'is_active' => true]);

        $employee = Employee::create([
            'employee_no' => 'PAW-9998',
            'first_name' => 'Juan',
            'last_name' => 'Cruz',
            'is_active' => true,
        ]);

        $response = $this->getJson('/api/manager/people', $this->managerAuth());

        $response->assertStatus(200)->assertJsonPath('success', true);

        $people = collect($response->json('data'));

        $accountRow = $people->firstWhere('user_id', $staff->id);
        $this->assertNotNull($accountRow);
        $this->assertSame('account', $accountRow['person_type']);
        $this->assertSame('user-' . $staff->id, $accountRow['id']);
        $this->assertSame($staff->employee_no, $accountRow['employee_no']);

        $employeeRow = $people->firstWhere('employee_id', $employee->id);
        $this->assertNotNull($employeeRow);
        $this->assertSame('employee', $employeeRow['person_type']);
        $this->assertSame('employee-' . $employee->id, $employeeRow['id']);
        $this->assertSame('PAW-9998', $employeeRow['employee_no']);
    }

    public function test_people_dedupes_account_linked_employees(): void
    {
        $staff = User::factory()->create(['role' => 'cashier', 'is_active' => true]);

        Employee::create([
            'employee_no' => 'PAW-9997',
            'first_name' => 'Linked',
            'last_name' => 'Person',
            'user_id' => $staff->id,
            'is_active' => true,
        ]);

        $response = $this->getJson('/api/manager/people', $this->managerAuth());
        $people = collect($response->json('data'));

        $this->assertCount(
            1,
            $people->filter(fn ($p) => $p['name'] === $staff->name || $p['name'] === 'LINKED PERSON'),
            'Linked person should appear exactly once (as the account row)'
        );
    }

    public function test_attendance_index_filters_by_employee_id(): void
    {
        $employee = Employee::create([
            'employee_no' => 'PAW-9996',
            'first_name' => 'Ana',
            'last_name' => 'Santos',
            'is_active' => true,
        ]);

        Attendance::create([
            'employee_id' => $employee->id,
            'date' => '2026-10-15',
            'check_in' => '08:00',
            'check_out' => '17:00',
            'status' => 'present',
        ]);

        $other = Employee::create([
            'employee_no' => 'PAW-9995',
            'first_name' => 'Other',
            'last_name' => 'Person',
            'is_active' => true,
        ]);
        Attendance::create([
            'employee_id' => $other->id,
            'date' => '2026-10-15',
            'check_in' => '08:00',
            'status' => 'present',
        ]);

        $response = $this->getJson(
            "/api/manager/attendance?employee_id={$employee->id}",
            $this->managerAuth()
        );

        $response->assertStatus(200);
        $rows = collect($response->json('data'));
        $this->assertCount(1, $rows);
        $this->assertSame($employee->id, $rows->first()['employee_id']);
    }

    public function test_payroll_index_filters_by_employee_id(): void
    {
        $employee = Employee::create([
            'employee_no' => 'PAW-9994',
            'first_name' => 'Pedro',
            'last_name' => 'Reyes',
            'is_active' => true,
        ]);

        Payroll::create([
            'payroll_id' => 'PAY-2026-9001',
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'department' => 'Operations',
            'position' => 'Groomer',
            'base_salary' => 10000,
            'pay_period_start' => '2026-10-01',
            'pay_period_end' => '2026-10-15',
            'pay_period_label' => 'Oct 01 - Oct 15, 2026',
            'status' => 'draft',
            'gross_pay' => 5000,
            'net_pay' => 4500,
        ]);

        $response = $this->getJson(
            "/api/manager/payroll?employee_id={$employee->id}",
            $this->managerAuth()
        );

        $response->assertStatus(200);
        $rows = collect($response->json('data'));
        $this->assertCount(1, $rows);
        $this->assertSame($employee->id, $rows->first()['employee_id']);
    }

    public function test_linked_employee_not_double_counted_in_payroll_compute(): void
    {
        $staff = User::factory()->create([
            'role' => 'cashier',
            'is_active' => true,
            'base_salary' => 20000,
        ]);

        Employee::create([
            'employee_no' => 'PAW-9993',
            'first_name' => 'Dup',
            'last_name' => 'Person',
            'user_id' => $staff->id,
            'is_active' => true,
            'base_salary' => 20000,
        ]);

        $service = app(PayrollComputationService::class);

        $this->assertCount(
            0,
            $service->activeEmployees(),
            'activeEmployees should exclude account-linked records'
        );

        $rows = $service->computeForAllEmployees('2026-10-01', '2026-10-15');
        $this->assertCount(
            0,
            $rows,
            'computeForAllEmployees should not pay a linked person a second time'
        );
    }
}
