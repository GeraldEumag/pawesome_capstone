<?php

namespace Tests\Feature;

use App\Http\Middleware\NormalizeApiResponse;
use App\Models\Customer;
use App\Models\Service;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * Unified API response envelope: every /api/* JSON response carries
 * success + message; errors carry errors when applicable; paginated
 * payloads expose meta; existing top-level keys are preserved.
 */
class ApiResponseEnvelopeTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(string $role): string
    {
        return User::factory()->create(['role' => $role])->createToken('t')->plainTextToken;
    }

    public function test_legacy_message_only_response_gains_success_flag(): void
    {
        $admin = $this->tokenFor('admin');
        $target = User::factory()->create(['role' => 'customer']);

        $res = $this->withHeaders(['Authorization' => "Bearer $admin"])
            ->deleteJson("/api/admin/users/{$target->id}");

        $res->assertOk();
        $res->assertJsonPath('success', true);
        $this->assertSame('User deleted successfully', $res->json('message'));
    }

    public function test_bare_array_response_is_wrapped_in_data(): void
    {
        Service::factory()->create(['is_active' => true, 'name' => 'Bath']);
        $customer = $this->tokenFor('customer');

        $res = $this->withHeaders(['Authorization' => "Bearer $customer"])
            ->getJson('/api/customer/services');

        $res->assertOk();
        $res->assertJsonPath('success', true);
        $this->assertIsArray($res->json('data'));
        $this->assertSame('Bath', $res->json('data.0.name'));
    }

    public function test_unauthenticated_response_is_enveloped(): void
    {
        $res = $this->getJson('/api/auth/me');
        $res->assertStatus(401);
        $res->assertJsonPath('success', false);
        $this->assertNotEmpty($res->json('message'));
    }

    public function test_forbidden_response_is_enveloped(): void
    {
        $customer = $this->tokenFor('customer');
        $res = $this->withHeaders(['Authorization' => "Bearer $customer"])
            ->getJson('/api/admin/users');

        $res->assertStatus(403);
        $res->assertJsonPath('success', false);
        $this->assertNotEmpty($res->json('message'));
    }

    public function test_validation_error_carries_success_false_and_errors(): void
    {
        $res = $this->postJson('/api/auth/register', [
            'name' => '',
            'email' => 'not-an-email',
            'password' => 'x',
        ]);

        $res->assertStatus(422);
        $res->assertJsonPath('success', false);
        $res->assertJsonStructure(['success', 'message', 'errors']);
        $this->assertNotEmpty($res->json('errors'));
    }

    public function test_paginated_response_exposes_meta_while_keeping_keys(): void
    {
        \App\Models\ActivityLog::log(null, 'seed_event', 'seeded');
        \App\Models\ActivityLog::log(null, 'seed_event', 'seeded');
        \App\Models\ActivityLog::log(null, 'seed_event', 'seeded');
        $admin = $this->tokenFor('admin');

        // ActivityLogController returns the raw Laravel paginator.
        $res = $this->withHeaders(['Authorization' => "Bearer $admin"])
            ->getJson('/api/admin/activity-logs?per_page=2');

        $res->assertOk();
        $res->assertJsonPath('success', true);
        $res->assertJsonStructure(['success', 'message', 'data', 'meta' => ['current_page', 'last_page', 'per_page', 'total']]);
        // Original paginator keys preserved for existing consumers.
        $this->assertArrayHasKey('current_page', $res->json());
        $this->assertSame(3, $res->json('meta.total'));
    }

    public function test_custom_paginated_shape_gains_envelope_without_moving_keys(): void
    {
        Customer::factory()->count(2)->create();
        $admin = $this->tokenFor('admin');

        // CustomersController returns {customers: [...], pagination: {...}} —
        // the normalizer adds success/message without relocating keys.
        $res = $this->withHeaders(['Authorization' => "Bearer $admin"])
            ->getJson('/api/admin/customers?per_page=1');

        $res->assertOk();
        $res->assertJsonPath('success', true);
        $this->assertNotEmpty($res->json('message'));
        $this->assertArrayHasKey('customers', $res->json());
        $this->assertArrayHasKey('pagination', $res->json());
    }

    public function test_existing_envelope_is_not_double_wrapped(): void
    {
        $admin = $this->tokenFor('admin');
        $res = $this->withHeaders(['Authorization' => "Bearer $admin"])
            ->getJson('/api/admin/chatbot/faqs');

        $res->assertOk();
        $res->assertJsonPath('success', true);
        $this->assertArrayHasKey('message', $res->json());
        $this->assertArrayHasKey('data', $res->json());
    }

    public function test_middleware_passes_through_non_json_responses(): void
    {
        $middleware = new NormalizeApiResponse();
        $request = Request::create('/api/files/x', 'GET');

        $streamed = response()->stream(fn () => print('csv'), 200, ['Content-Type' => 'text/csv']);
        $result = $middleware->handle($request, fn () => $streamed);
        $this->assertSame('text/csv', $result->headers->get('Content-Type'));
    }

    public function test_middleware_preserves_existing_success_false_overrides(): void
    {
        $middleware = new NormalizeApiResponse();
        $request = Request::create('/api/x', 'GET');

        // A 200 response that explicitly says success=false must stay false.
        $res = new JsonResponse(['success' => false, 'message' => 'Declined'], 200);
        $result = $middleware->handle($request, fn () => $res);
        $this->assertFalse($result->getData(true)['success']);
        $this->assertSame('Declined', $result->getData(true)['message']);
    }

    public function test_api_response_helper_shapes(): void
    {
        $ok = ApiResponse::success(['id' => 1], 'Created', 201);
        $this->assertSame(['success' => true, 'message' => 'Created', 'data' => ['id' => 1]], $ok->getData(true));
        $this->assertSame(201, $ok->getStatusCode());

        $err = ApiResponse::error('Invalid', 422, ['email' => ['Taken']]);
        $this->assertSame(false, $err->getData(true)['success']);
        $this->assertSame(['Taken'], $err->getData(true)['errors']['email']);
    }
}
