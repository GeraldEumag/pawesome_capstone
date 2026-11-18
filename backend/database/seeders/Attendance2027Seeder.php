<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeds realistic full-year 2027 attendance for payroll demos.
 *
 * The data is intentionally imperfect — lates, absences (including a
 * multi-day stretch), approved leaves, undertime, overtime, missed
 * punches, rest-day (Sunday) work, and two worked regular holidays —
 * so generated payroll shows real deductions and premiums.
 *
 * Idempotent: existing attendance rows for a person+date are kept, so
 * the seeder is safe to re-run and never overwrites real records.
 */
class Attendance2027Seeder extends Seeder
{
    public const YEAR = 2027;

    /**
     * Pattern probabilities per persona. Each roll draws one bucket in
     * order: absent → late → undertime → overtime → missed punch → present.
     */
    private const PROFILES = [
        'reliable' => [
            'late' => 0.04, 'absent' => 0.006, 'undertime' => 0.008,
            'overtime' => 0.02, 'missed' => 0.004,
            'leaves' => [['2027-08-16', '2027-08-20', 'Approved vacation leave']],
        ],
        'steady' => [
            'late' => 0.08, 'absent' => 0.018, 'undertime' => 0.02,
            'overtime' => 0.03, 'missed' => 0.008,
        ],
        'frequently_late' => [
            'late' => 0.18, 'absent' => 0.03, 'undertime' => 0.03,
            'overtime' => 0.01, 'missed' => 0.012,
        ],
        'irregular' => [
            'late' => 0.11, 'absent' => 0.045, 'undertime' => 0.03,
            'overtime' => 0.045, 'missed' => 0.02,
        ],
        'mid_year' => [
            'late' => 0.07, 'absent' => 0.015, 'undertime' => 0.02,
            'overtime' => 0.02, 'missed' => 0.008,
        ],
    ];

    /**
     * Persona + scripted events for the seeded demo staff accounts.
     * Any other active staff user falls back to the "steady" profile.
     *
     * Keys: profile, leaves [[start,end,note]], absent_stretch [[start,end]],
     * work_holidays [dates], sundays [week-of-month numbers], start (Y-m-d).
     */
    private const USER_PERSONAS = [
        'admin@example.com'            => ['profile' => 'reliable'],
        'manager@example.com'          => ['profile' => 'reliable'],
        'vet@example.com'              => ['profile' => 'reliable', 'work_holidays' => ['2027-04-09', '2027-11-30']],
        'receptionist@example.com'     => ['profile' => 'steady', 'leaves' => [['2027-03-08', '2027-03-09', 'Sick leave — approved']]],
        'super_receptionist@example.com' => ['profile' => 'steady', 'sundays' => [2], 'leaves' => [['2027-07-05', '2027-07-06', 'Emergency leave — approved']]],
        'cashier@example.com'          => ['profile' => 'steady', 'leaves' => [['2027-11-22', '2027-11-24', 'Approved vacation leave']]],
        'inventory@example.com'        => ['profile' => 'steady'],
        'vettech@example.com'          => ['profile' => 'irregular', 'absent_stretch' => [['2027-03-15', '2027-03-17']]],
    ];

    /** Non-account employees created for the payroll demo. */
    private const DEMO_EMPLOYEES = [
        [
            'employee_no' => 'PAW-9001', 'first_name' => 'MARIA', 'last_name' => 'SANTOS',
            'position' => 'Pet Groomer', 'department' => 'Grooming',
            'hire_date' => '2024-03-01', 'base_salary' => 18500,
            'email' => 'maria.santos.staff@pawesome.local',
            'persona' => [
                'profile' => 'frequently_late',
                'leaves' => [['2027-02-15', '2027-02-16', 'Sick leave — approved']],
            ],
        ],
        [
            'employee_no' => 'PAW-9002', 'first_name' => 'JUAN', 'last_name' => 'DELA CRUZ',
            'position' => 'Kennel Attendant', 'department' => 'Pet Hotel',
            'hire_date' => '2023-07-15', 'base_salary' => 16500,
            'email' => 'juan.delacruz.staff@pawesome.local',
            'persona' => [
                'profile' => 'irregular', 'sundays' => [1, 3],
                'absent_stretch' => [['2027-05-10', '2027-05-12']],
            ],
        ],
        [
            'employee_no' => 'PAW-9003', 'first_name' => 'ANNA', 'last_name' => 'REYES',
            'position' => 'Pet Care Assistant', 'department' => 'Pet Hotel',
            'hire_date' => '2025-01-10', 'base_salary' => 17200,
            'email' => 'anna.reyes.staff@pawesome.local',
            'persona' => [
                'profile' => 'steady',
                'leaves' => [['2027-09-06', '2027-09-08', 'Approved vacation leave']],
            ],
        ],
        [
            'employee_no' => 'PAW-9004', 'first_name' => 'CARLOS', 'last_name' => 'MENDOZA',
            'position' => 'Veterinary Assistant', 'department' => 'Veterinary',
            'hire_date' => '2027-06-14', 'base_salary' => 16000,
            'email' => 'carlos.mendoza.staff@pawesome.local',
            'persona' => ['profile' => 'mid_year', 'start' => '2027-06-14'],
        ],
    ];

    public function run(): void
    {
        // Registered in DatabaseSeeder for demo/local init only — keep test
        // databases deterministic; tests call runSeed() directly.
        if (app()->environment('testing')) {
            return;
        }

        $this->runSeed();
    }

    public function runSeed(): void
    {
        $this->seedHolidays();

        $people = $this->resolvePeople();
        $total = 0;

        foreach ($people as $person) {
            $count = $this->seedPerson(
                $person['key'],
                $person['user_id'] ?? null,
                $person['employee_id'] ?? null,
                $person['persona']
            );
            $total += $count;
            $this->command?->info("{$person['key']}: {$count} attendance rows");
        }

        $this->command?->info('Attendance2027Seeder complete: ' . count($people) . " people, {$total} new rows.");
    }

    private function seedHolidays(): void
    {
        $now = now();
        $holidays = [
            // Regular holidays (2027 PH calendar)
            ['2027-01-01', "New Year's Day", 'regular', true],
            ['2027-03-25', 'Maundy Thursday', 'regular', false],
            ['2027-03-26', 'Good Friday', 'regular', false],
            ['2027-04-09', 'Araw ng Kagitingan (Bataan and Corregidor Day)', 'regular', false],
            ['2027-05-01', 'Labor Day', 'regular', true],
            ['2027-06-12', 'Independence Day', 'regular', true],
            ['2027-08-30', 'National Heroes Day', 'regular', false],
            ['2027-11-30', 'Bonifacio Day', 'regular', true],
            ['2027-12-25', 'Christmas Day', 'regular', true],
            ['2027-12-30', 'Rizal Day', 'regular', true],
            // Special non-working holidays
            ['2027-02-06', 'Chinese New Year', 'special_non_working', false],
            ['2027-03-27', 'Black Saturday', 'special_non_working', false],
            ['2027-08-21', 'Ninoy Aquino Day', 'special_non_working', true],
            ['2027-11-01', "All Saints' Day", 'special_non_working', true],
            ['2027-11-02', "All Souls' Day", 'special_non_working', false],
            ['2027-12-08', 'Feast of the Immaculate Conception', 'special_non_working', true],
            ['2027-12-24', 'Christmas Eve', 'special_non_working', false],
            ['2027-12-31', 'Last Day of the Year', 'special_non_working', false],
            // EDSA is a special working day in Proclamation No. 1427.
            ['2027-02-25', 'EDSA People Power Revolution Anniversary', 'special_working', false],
        ];

        foreach ($holidays as [$date, $name, $type, $recurring]) {
            DB::table('holidays')->insertOrIgnore([
                'date' => $date,
                'name' => $name,
                'type' => $type,
                'year' => self::YEAR,
                'is_recurring' => $recurring,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    /**
     * @return array<int, array{key:string, user_id:?int, employee_id:?int, persona:array}>
     */
    private function resolvePeople(): array
    {
        $people = [];

        User::where('role', '!=', 'customer')
            ->where('is_active', true)
            ->get()
            ->each(function (User $user) use (&$people) {
                $people[] = [
                    'key' => "user:{$user->email}",
                    'user_id' => $user->id,
                    'employee_id' => null,
                    'persona' => self::USER_PERSONAS[$user->email] ?? ['profile' => 'steady'],
                ];
            });

        foreach (self::DEMO_EMPLOYEES as $spec) {
            $persona = $spec['persona'];
            unset($spec['persona']);
            $employee = Employee::updateOrCreate(
                ['employee_no' => $spec['employee_no']],
                array_merge($spec, ['employment_status' => 'regular', 'employment_type' => 'full_time', 'is_active' => true])
            );
            $people[] = [
                'key' => "employee:{$employee->employee_no}",
                'user_id' => null,
                'employee_id' => $employee->id,
                'persona' => $persona,
            ];
        }

        return $people;
    }

    private function seedPerson(string $key, ?int $userId, ?int $employeeId, array $persona): int
    {
        $profile = self::PROFILES[$persona['profile'] ?? 'steady'];
        $leaves = $persona['leaves'] ?? $profile['leaves'] ?? [];
        $stretches = $persona['absent_stretch'] ?? $profile['absent_stretch'] ?? [];
        $workHolidays = $persona['work_holidays'] ?? [];
        $sundayWeeks = $persona['sundays'] ?? [];
        $start = isset($persona['start']) ? Carbon::parse($persona['start']) : null;

        $holidays = $this->holidayMap();
        $keyField = $userId ? 'user_id' : 'employee_id';
        $keyId = $userId ?? $employeeId;

        $existing = Attendance::where($keyField, $keyId)
            ->whereYear('date', self::YEAR)
            ->pluck('date')
            ->map(fn ($d) => Carbon::parse($d)->toDateString())
            ->flip();

        // Deterministic RNG per person — identical data across re-runs and envs.
        mt_srand(crc32($key . '|' . self::YEAR));

        $rows = [];
        foreach (CarbonPeriod::create(self::YEAR . '-01-01', self::YEAR . '-12-31') as $day) {
            $ds = $day->toDateString();
            if ($existing->has($ds) || ($start && $day->lt($start))) {
                continue;
            }

            if ($day->dayOfWeek === 0) {
                $weekOfMonth = intdiv($day->day - 1, 7) + 1;
                if (in_array($weekOfMonth, $sundayWeeks, true)) {
                    $rows[] = $this->punch($userId, $employeeId, $ds, $this->t(7, mt_rand(54, 59)), $this->t(17, mt_rand(0, 10)), 'present', 'barcode', 'Rest-day duty');
                }
                continue;
            }

            if (isset($holidays[$ds])) {
                if (in_array($ds, $workHolidays, true)) {
                    $rows[] = $this->punch($userId, $employeeId, $ds, $this->t(7, mt_rand(50, 62)), $this->t(17, mt_rand(0, 15)), 'present', 'barcode', 'Worked holiday — ' . $holidays[$ds]);
                }
                continue;
            }

            $leaveNote = $this->inBlocks($leaves, $ds);
            if ($leaveNote !== null) {
                $rows[] = $this->blank($userId, $employeeId, $ds, 'on_leave', 'manual', $leaveNote);
                continue;
            }
            if ($this->inBlocks($stretches, $ds) !== null) {
                $rows[] = $this->blank($userId, $employeeId, $ds, 'absent', 'manual', 'Absent — no approved leave');
                continue;
            }

            $roll = mt_rand(0, 1000) / 1000;
            if ($roll < $profile['absent']) {
                $rows[] = $this->blank($userId, $employeeId, $ds, 'absent', 'manual', mt_rand(0, 1) ? 'Absent — sick, no leave filed' : 'Absent — no time record');
            } elseif ($roll < $profile['absent'] + $profile['late']) {
                $rows[] = $this->punch($userId, $employeeId, $ds, $this->t(8, mt_rand(18, 105)), $this->t(17, mt_rand(0, 15)), 'late', 'barcode', null, ['is_late' => true]);
            } elseif ($roll < $profile['absent'] + $profile['late'] + $profile['undertime']) {
                $rows[] = $this->punch($userId, $employeeId, $ds, $this->t(7, mt_rand(50, 65)), $this->t(15, mt_rand(20, 90)), 'early_leave', 'barcode', 'Left early — personal errand', ['is_early_leave' => true]);
            } elseif ($roll < $profile['absent'] + $profile['late'] + $profile['undertime'] + $profile['overtime']) {
                $rows[] = $this->punch($userId, $employeeId, $ds, $this->t(7, mt_rand(50, 65)), $this->t(17, mt_rand(60, 160)), 'present', 'barcode', 'Overtime — facility work');
            } elseif ($roll < $profile['absent'] + $profile['late'] + $profile['undertime'] + $profile['overtime'] + $profile['missed']) {
                $rows[] = $this->punch($userId, $employeeId, $ds, $this->t(7, mt_rand(52, 66)), null, 'present', 'barcode', 'Missed check-out — pending correction');
            } else {
                $rows[] = $this->punch($userId, $employeeId, $ds, $this->t(7, mt_rand(42, 62)), $this->t(17, mt_rand(0, 20)), 'present', 'barcode');
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            Attendance::insert($chunk);
        }

        return count($rows);
    }

    private function punch(?int $userId, ?int $employeeId, string $date, string $in, ?string $out, string $status, string $source, ?string $notes = null, array $flags = []): array
    {
        $total = 0;
        $overtime = 0;
        if ($out !== null) {
            $inMin = (int) substr($in, 0, 2) * 60 + (int) substr($in, 3, 2);
            $outMin = (int) substr($out, 0, 2) * 60 + (int) substr($out, 3, 2);
            $workMinutes = ($outMin - $inMin) - 60;
            $total = round(max(0, $workMinutes) / 60, 2);
            $overtime = round(max(0, $total - 8), 2);
        }

        return [
            'user_id' => $userId,
            'employee_id' => $employeeId,
            'date' => $date,
            'check_in' => $in,
            'check_out' => $out,
            'break_time' => '01:00',
            'total_hours' => $total,
            'overtime_hours' => $overtime,
            'status' => $status,
            'is_late' => $flags['is_late'] ?? false,
            'is_early_leave' => $flags['is_early_leave'] ?? false,
            'source' => $source,
            'notes' => $notes,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    private function blank(?int $userId, ?int $employeeId, string $date, string $status, string $source, ?string $notes): array
    {
        return [
            'user_id' => $userId,
            'employee_id' => $employeeId,
            'date' => $date,
            'check_in' => null,
            'check_out' => null,
            'break_time' => null,
            'total_hours' => 0,
            'overtime_hours' => 0,
            'status' => $status,
            'is_late' => false,
            'is_early_leave' => false,
            'source' => $source,
            'notes' => $notes,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    private function inBlocks(array $blocks, string $date): ?string
    {
        foreach ($blocks as $block) {
            if ($date >= $block[0] && $date <= $block[1]) {
                return $block[2] ?? '1';
            }
        }
        return null;
    }

    /** @return array<string, string> date => holiday name */
    private function holidayMap(): array
    {
        return DB::table('holidays')
            ->where('year', self::YEAR)
            ->pluck('name', 'date')
            ->map(fn ($name) => (string) $name)
            ->all();
    }

    /** @param int $minutes minutes past the given hour */
    private function t(int $hour, int $minutes): string
    {
        return sprintf('%02d:%02d:00', $hour + intdiv($minutes, 60), $minutes % 60);
    }
}
