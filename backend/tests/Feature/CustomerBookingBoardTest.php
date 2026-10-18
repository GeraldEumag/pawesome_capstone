<?php

namespace Tests\Feature;

use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\BookingWorkflowStage;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerBookingBoardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-12-01 08:00:00', 'Asia/Manila'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function request(User $customer, array $overrides = []): ServiceRequest
    {
        return ServiceRequest::create(array_merge([
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'pet_name' => 'Milo',
            'request_type' => 'grooming',
            'service_name' => 'Full Grooming',
            'price' => 450,
            'request_date' => '2026-12-04',
            'request_time' => '10:00',
            'status' => 'approved',
            'payment_status' => 'unpaid',
        ], $overrides));
    }

    private function board(User $user, string $query = ''): array
    {
        return $this->actingAs($user)->getJson('/api/customer/bookings' . $query)->assertOk()->json();
    }

    public function test_board_returns_only_the_customers_bookings_with_stage_and_actions(): void
    {
        $me = User::factory()->customer()->create();
        $other = User::factory()->customer()->create();
        $this->request($me);
        $this->request($other, ['pet_name' => 'Other']);

        $data = $this->board($me);

        $this->assertCount(1, $data['items']);
        $item = $data['items'][0];
        $this->assertSame('Milo', $item['pet_name']);
        $this->assertSame(BookingWorkflowStage::TO_PAY, $item['workflow_stage']);
        $this->assertContains('pay', $item['actions']);
        $this->assertSame('2026-12-01', $data['store_today']);
    }

    public function test_pending_request_offers_cancel_and_not_pay(): void
    {
        $me = User::factory()->customer()->create();
        $this->request($me, ['request_type' => 'vet', 'service_name' => 'General Check-up', 'status' => 'pending']);

        $item = $this->board($me)['items'][0];

        $this->assertSame(BookingWorkflowStage::TO_APPROVE, $item['workflow_stage']);
        $this->assertSame(['cancel'], $item['actions']);
        $this->assertSame('vet', $item['kind']);
    }

    public function test_counts_match_the_returned_rows(): void
    {
        $me = User::factory()->customer()->create();
        $this->request($me);
        $this->request($me, ['status' => 'pending', 'request_date' => '2026-12-05']);
        $this->request($me, ['status' => 'completed', 'payment_status' => 'paid', 'request_date' => '2026-11-28']);

        $data = $this->board($me, '?range=all');

        $this->assertSame(3, $data['counts']['all']);
        foreach (['to_approve', 'to_pay', 'on_going', 'ready_to_pickup', 'complete', 'canceled'] as $stage) {
            $this->assertSame(
                collect($data['items'])->where('workflow_stage', $stage)->count(),
                $data['counts'][$stage],
                "count mismatch for {$stage}"
            );
        }
    }

    public function test_upcoming_range_excludes_past_and_far_future_bookings(): void
    {
        $me = User::factory()->customer()->create();
        $this->request($me, ['request_date' => '2026-12-04']);
        $this->request($me, ['request_date' => '2026-11-01']);
        $this->request($me, ['request_date' => '2027-06-01']);

        $upcoming = $this->board($me, '?range=upcoming');
        $this->assertCount(1, $upcoming['items']);
        $this->assertSame('2026-12-04', $upcoming['items'][0]['date']);

        $this->assertCount(3, $this->board($me, '?range=all')['items']);
    }

    public function test_offered_actions_are_accepted_by_their_endpoints(): void
    {
        $me = User::factory()->customer()->create();
        $pending = $this->request($me, ['status' => 'pending', 'request_date' => '2026-12-05']);
        $approved = $this->request($me);

        $items = collect($this->board($me, '?range=all')['items'])->keyBy('id');

        $this->assertContains('cancel', $items[$pending->id]['actions']);
        $this->assertNotContains('cancel', $items[$approved->id]['actions']);
        $this->assertContains('pay', $items[$approved->id]['actions']);

        $this->actingAs($me)
            ->patchJson("/api/customer/requests/{$pending->id}/cancel", ['reason' => 'Changed plans'])
            ->assertOk();

        $this->actingAs($me)
            ->patchJson("/api/customer/requests/{$approved->id}/cancel", ['reason' => 'Changed plans'])
            ->assertClientError();

        $this->actingAs($me)
            ->postJson("/api/customer/requests/{$approved->id}/payment-proof", [])
            ->assertStatus(422);
    }

    public function test_service_filter_limits_kind(): void
    {
        $me = User::factory()->customer()->create();
        $this->request($me);
        $this->request($me, ['request_type' => 'vet', 'service_name' => 'Vaccination']);

        $this->assertCount(1, $this->board($me, '?service=vet')['items']);
        $this->assertCount(1, $this->board($me, '?service=grooming')['items']);
    }
}
