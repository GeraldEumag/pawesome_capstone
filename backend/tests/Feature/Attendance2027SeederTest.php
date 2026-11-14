<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use Carbon\Carbon;
use Database\Seeders\Attendance2027Seeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The deployed payroll demo depends on Attendance2027Seeder producing
 * realistic, imperfect full-year 2027 attendance that the payroll engine
 * actually computes against. These tests pin the seeder's coverage,
 * imperfection, idempotency, and payroll linkage.
 */
class Attendance2027SeederTest extends TestCase
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
            'base_salary' => 45000,
            'employee_no' => 'PAW-0001',
        ]);
        $this->managerToken = $this->manager->createToken('test-token')->plainTextToken;

        // Known persona emails + one account that falls back to "steady".
        User::factory()->create(['role' => 'vet_tech', 'email' => 'vettech@example.com', 'is_active' => true, 'base_salary' => 20000, 'employee_no' => 'PAW-0010']);
        User::factory()->create(['role' => 'veterinary', 'email' => 'vet@example.com', 'is_active' => true, 'base_salary' => 55000, 'employee_no' => 'PAW-0011']);
        User::factory()->create(['role' => 'cashier', 'email' => 'cashier@example.com', 'is_active' => true, 'base_salary' => 19000, 'employee_no' => 'PAW-0012']);
    }

    /** Match a seeded row by calendar date (the date attribute is a Carbon cast). */
    private function rowOn($rows, string $date): ?Attendance
    {
        return $rows->first(fn ($r) => Carbon::parse($r->date)->toDateString() === $date);
    }

    public function test_run_is_a_no_op_in_testing_environment(): void
    {
        (new Attendance2027Seeder)->run();

        $this->assertSame(0, Attendance::count());
    }

    public function test_seeds_imperfect_full_year_attendance(): void
    {
        (new Attendance2027Seeder)->runSeed();

        $vettech = User::where('email', 'vettech@example.com')->firstOrFail();
        $rows = Attendance::where('user_id', $vettech->id)->whereYear('date', 2027)->get();

        $this->assertGreaterThan(250, $rows->count(), 'Expected ~290+ Mon–Sat rows for the irregular persona');

        // Full-year coverage: at least one row in every month.
        for ($m = 1; $m <= 12; $m++) {
            $this->assertTrue(
                $rows->contains(fn ($r) => Carbon::parse($r->date)->month === $m),
                "No 2027 attendance rows for month {$m}"
            );
        }

        // Imperfection is the point — every irregular pattern must appear.
        $this->assertGreaterThan(10, $rows->where('status', 'late')->count(), 'irregular persona needs real lateness');
        $this->assertGreaterThan(3, $rows->where('status', 'absent')->count());
        $this->assertGreaterThan(0, $rows->where('status', 'early_leave')->count(), 'undertime days expected');
        $this->assertGreaterThan(0, $rows->where('overtime_hours', '>', 0)->count(), 'overtime days expected');
        $this->assertGreaterThan(0, $rows->whereNotNull('check_in')->whereNull('check_out')->count(), 'missed check-outs expected');

        // The scripted 3-day absent stretch (Mar 15–17) is present.
        foreach (['2027-03-15', '2027-03-16', '2027-03-17'] as $d) {
            $this->assertSame('absent', $this->rowOn($rows, $d)?->status, "stretch day {$d} should be absent");
        }

        // Holiday days are left unpunched for non-holiday-workers.
        $this->assertNull($this->rowOn($rows, '2027-12-25'), 'Christmas should have no punch');
    }

    public function test_vet_works_the_scripted_holidays(): void
    {
        (new Attendance2027Seeder)->runSeed();

        $vet = User::where('email', 'vet@example.com')->firstOrFail();
        foreach (['2027-04-09', '2027-11-30'] as $holiday) {
            $row = Attendance::where('user_id', $vet->id)->whereDate('date', $holiday)->first();
            $this->assertNotNull($row, "vet should have a worked-holiday punch on {$holiday}");
            $this->assertSame('present', $row->status);
        }
    }

    public function test_employees_and_mid_year_hire_are_seeded(): void
    {
        (new Attendance2027Seeder)->runSeed();

        foreach (['PAW-9001', 'PAW-9002', 'PAW-9003', 'PAW-9004'] as $no) {
            $this->assertDatabaseHas('employees', ['employee_no' => $no]);
        }

        $midYear = Employee::where('employee_no', 'PAW-9004')->firstOrFail();
        $rows = Attendance::where('employee_id', $midYear->id)->whereYear('date', 2027)->get();

        $this->assertGreaterThan(0, $rows->count());
        $this->assertNull(
            $rows->first(fn ($r) => Carbon::parse($r->date)->lt(Carbon::parse('2027-06-14'))),
            'mid-year hire must not have attendance before the 2027-06-14 hire date'
        );
        $this->assertNotNull($this->rowOn($rows, '2027-06-14'), 'hire date itself should be worked');
    }

    public function test_seeder_is_idempotent(): void
    {
        $seeder = new Attendance2027Seeder;
        $seeder->runSeed();
        $first = Attendance::whereYear('date', 2027)->count();
        $this->assertGreaterThan(0, $first);

        $seeder->runSeed();
        $this->assertSame($first, Attendance::whereYear('date', 2027)->count(), 're-running must not duplicate rows');
    }

    public function test_seeded_2027_holidays_exist(): void
    {
        (new Attendance2027Seeder)->runSeed();

        $this->assertDatabaseHas('holidays', ['date' => '2027-12-25', 'type' => 'regular']);
        $this->assertDatabaseHas('holidays', ['date' => '2027-03-26', 'name' => 'Good Friday']);
        $this->assertDatabaseHas('holidays', ['date' => '2027-08-21', 'type' => 'special_non_working']);
    }

    public function test_payroll_engine_computes_from_seeded_attendance(): void
    {
        (new Attendance2027Seeder)->runSeed();

        $groomer = Employee::where('employee_no', 'PAW-9001')->firstOrFail();

        $response = $this->postJson('/api/manager/payroll/compute', [
            'period_start' => '2027-06-01',
            'period_end'   => '2027-06-15',
        ], ['Authorization' => 'Bearer ' . $this->managerToken]);

        $response->assertStatus(200)->assertJsonPath('success', true);

        $row = collect($response->json('data'))->firstWhere('employee_id', $groomer->id);
        $this->assertNotNull($row, 'groomer row missing from compute output');

        $this->assertGreaterThan(0, $row['working_days']);
        $this->assertGreaterThan(0, $row['present_days']);
        // The frequently-late persona must show real payroll consequences.
        $this->assertTrue(
            $row['late_days'] > 0 || $row['absent_days'] > 0,
            'imperfect attendance should produce lates or absences in the period'
        );
        $this->assertGreaterThan(0, (float) $row['gross_pay']);
    }
}
