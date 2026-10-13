<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ManagerAttendanceApiTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'role' => $role,
            'is_active' => true,
        ], $attributes));
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('manager-attendance-test')->plainTextToken];
    }

    public function test_manager_and_admin_can_load_filtered_attendance_with_the_documented_response_shape(): void
    {
        $manager = $this->user('manager');
        $admin = $this->user('admin');
        $staff = $this->user('receptionist', ['department' => 'Front Desk']);
        $date = Carbon::today()->toDateString();
        $attendance = Attendance::create([
            'user_id' => $staff->id,
            'date' => $date,
            'status' => 'present',
            'check_in' => '09:00:00',
        ]);

        foreach ([$manager, $admin] as $viewer) {
            $this->withHeaders($this->headers($viewer))
                ->getJson('/api/manager/attendance?' . http_build_query([
                    'date' => $date,
                    'department' => 'Front Desk',
                    'status' => 'present',
                    'search' => $staff->name,
                ]))
                ->assertOk()
                ->assertJsonPath('success', true)
                ->assertJsonPath('count', 1)
                ->assertJsonPath('data.0.id', $attendance->id)
                ->assertJsonPath('data.0.user.id', $staff->id);
        }
    }

    public function test_manager_attendance_empty_results_are_a_successful_empty_array(): void
    {
        $manager = $this->user('manager');

        $this->withHeaders($this->headers($manager))
            ->getJson('/api/manager/attendance?date=2026-01-01')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('count', 0)
            ->assertJsonPath('data', []);
    }

    public function test_unauthorized_roles_cannot_load_manager_attendance(): void
    {
        $receptionist = $this->user('receptionist');

        $this->withHeaders($this->headers($receptionist))
            ->getJson('/api/manager/attendance')
            ->assertForbidden();
    }

    public function test_manager_remarks_update_persists_to_the_attendance_record(): void
    {
        $manager = $this->user('manager');
        $staff = $this->user('receptionist');
        $attendance = Attendance::create([
            'user_id' => $staff->id,
            'date' => Carbon::today()->toDateString(),
            'status' => 'present',
        ]);

        $this->withHeaders($this->headers($manager))
            ->postJson("/api/manager/attendance/{$attendance->id}/remarks", [
                'remarks' => 'Verified against the paper log.',
            ])
            ->assertOk();

        $this->assertDatabaseHas('attendance', [
            'id' => $attendance->id,
            'remarks' => 'Verified against the paper log.',
        ]);
    }
}
