<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MyLeaveSelfServiceTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): User
    {
        return User::factory()->create(['role' => 'manager', 'is_active' => true]);
    }

    private function headers(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('my-leave-test')->plainTextToken];
    }

    private function leave(User $user, array $overrides = []): int
    {
        return DB::table('leave_requests')->insertGetId(array_merge([
            'user_id' => $user->id,
            'type' => 'unpaid_leave',
            'start_date' => Carbon::tomorrow()->toDateString(),
            'end_date' => Carbon::tomorrow()->toDateString(),
            'reason' => 'Personal leave',
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    public function test_index_returns_only_the_authenticated_users_paginated_records(): void
    {
        $user = $this->staff();
        $other = $this->staff();
        $ownedId = $this->leave($user);
        $otherId = $this->leave($other);

        $this->withHeaders($this->headers($user))
            ->getJson('/api/my-leaves')
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $ownedId)
            ->assertJsonPath('data.data.0.user_id', $user->id)
            ->assertJsonPath('data.total', 1);

        $this->assertNotSame($ownedId, $otherId);
    }

    public function test_store_uses_the_api_type_field_and_server_authenticated_owner(): void
    {
        $user = $this->staff();
        $other = $this->staff();
        $date = Carbon::tomorrow()->toDateString();

        $response = $this->withHeaders($this->headers($user))
            ->postJson('/api/my-leaves', [
                'type' => 'unpaid_leave',
                'user_id' => $other->id,
                'start_date' => $date,
                'end_date' => $date,
                'reason' => 'Personal leave',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('leave_requests', [
            'id' => $response->json('id'),
            'user_id' => $user->id,
            'type' => 'unpaid_leave',
        ]);
        $this->assertDatabaseMissing('leave_requests', [
            'id' => $response->json('id'),
            'user_id' => $other->id,
        ]);
    }

    public function test_store_rejects_the_frontend_only_leave_type_field(): void
    {
        $user = $this->staff();
        $date = Carbon::tomorrow()->toDateString();

        $this->withHeaders($this->headers($user))
            ->postJson('/api/my-leaves', [
                'leave_type' => 'unpaid_leave',
                'start_date' => $date,
                'end_date' => $date,
                'reason' => 'Personal leave',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('type');
    }

    public function test_a_user_cannot_cancel_another_users_leave(): void
    {
        $user = $this->staff();
        $other = $this->staff();
        $leaveId = $this->leave($other);

        $this->withHeaders($this->headers($user))
            ->deleteJson("/api/my-leaves/{$leaveId}")
            ->assertNotFound();

        $this->assertDatabaseHas('leave_requests', [
            'id' => $leaveId,
            'user_id' => $other->id,
            'status' => 'pending',
        ]);
    }

    public function test_a_user_can_cancel_their_own_pending_leave(): void
    {
        $user = $this->staff();
        $leaveId = $this->leave($user);

        $this->withHeaders($this->headers($user))
            ->deleteJson("/api/my-leaves/{$leaveId}")
            ->assertOk();

        $this->assertDatabaseHas('leave_requests', [
            'id' => $leaveId,
            'user_id' => $user->id,
            'status' => 'cancelled',
        ]);
    }
}
