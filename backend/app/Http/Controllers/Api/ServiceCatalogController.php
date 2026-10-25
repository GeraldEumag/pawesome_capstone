<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Appointment;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Canonical service-catalog CRUD shared by receptionist, manager, admin,
 * and veterinary mounts. One controller, mounted under each role prefix —
 * see routes/api.php. Veterinary callers are restricted to medical
 * categories (Service::VET_CATEGORIES).
 */
class ServiceCatalogController extends Controller
{
    /**
     * List all services (active + inactive) for management UIs.
     * Filters: ?category=, ?active_only=1, ?search=
     */
    public function index(Request $request): JsonResponse
    {
        try {
            $query = Service::query()->orderBy('category')->orderBy('name');

            if ($request->filled('category')) {
                $query->byCategory($request->category);
            }

            if ($request->has('active_only') && filter_var($request->active_only, FILTER_VALIDATE_BOOLEAN)) {
                $query->active();
            }

            if ($request->filled('search')) {
                $term = '%' . $request->search . '%';
                $query->where(function ($q) use ($term) {
                    $q->where('name', 'like', $term)
                        ->orWhere('description', 'like', $term);
                });
            }

            $services = $query->get();

            $blockedIds = Appointment::whereIn('status', Service::BLOCKING_APPOINTMENT_STATUSES)
                ->whereIn('service_id', $services->pluck('id'))
                ->distinct()
                ->pluck('service_id')
                ->flip();

            $services->each(function ($service) use ($blockedIds) {
                $service->has_active_appointments = $blockedIds->has($service->id);
            });

            return response()->json([
                'success' => true,
                'data' => $services,
                'categories' => Service::VALID_CATEGORIES,
                'vet_categories' => Service::VET_CATEGORIES,
                'summary' => [
                    'total' => $services->count(),
                    'active' => $services->where('is_active', true)->count(),
                    'inactive' => $services->where('is_active', false)->count(),
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('Service catalog fetch error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error fetching services.',
            ], 500);
        }
    }

    /**
     * Active services only — for booking forms / public authenticated reads.
     */
    public function publicIndex(): JsonResponse
    {
        try {
            $services = Service::query()
                ->where('is_active', true)
                ->orderBy('category')
                ->orderBy('name')
                ->get();

            return response()->json([
                'success' => true,
                'data' => $services,
                'categories' => Service::VALID_CATEGORIES,
            ]);
        } catch (\Exception $e) {
            Log::error('Service catalog public fetch error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error fetching services.',
            ], 500);
        }
    }

    /**
     * Create a new service.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'category' => 'required|string|in:' . implode(',', Service::VALID_CATEGORIES),
            'price' => 'required|numeric|min:0',
            'description' => 'nullable|string',
            'duration_minutes' => 'nullable|integer|min:0',
            'is_active' => 'sometimes|boolean',
            'image' => 'sometimes|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        if ($resp = $this->forbidVetOutsideMedicalCategories($request, $data['category'])) {
            return $resp;
        }

        try {
            $data['is_active'] = $data['is_active'] ?? true;
            $service = $this->persistService(new Service(), $data, $request);

            ActivityLog::log($request->user()?->id, 'service_created',
                "Service #{$service->id} ({$service->name}) created", [
                    'category' => 'service',
                    'reference_type' => Service::class,
                    'reference_id' => $service->id,
                    'metadata' => [
                        'service_id' => $service->id,
                        'service_name' => $service->name,
                        'category' => $service->category,
                        'price' => (float) $service->price,
                    ],
                ]);

            return response()->json([
                'success' => true,
                'data' => $service,
                'message' => 'Service created successfully',
            ], 201);
        } catch (\Exception $e) {
            Log::error('Service creation error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to create service',
            ], 422);
        }
    }

    /**
     * Update an existing service. Disabling requires a reason (audit).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'category' => 'sometimes|string|in:' . implode(',', Service::VALID_CATEGORIES),
            'price' => 'sometimes|numeric|min:0',
            'description' => 'sometimes|nullable|string',
            'duration_minutes' => 'sometimes|nullable|integer|min:0',
            'is_active' => 'sometimes|boolean',
            'reason' => 'sometimes|nullable|string|min:3|max:500',
        ]);

        $service = Service::findOrFail($id);

        if ($resp = $this->forbidVetOutsideMedicalCategories($request, $service->category, $data['category'] ?? null)) {
            return $resp;
        }

        $disabling = $request->has('is_active')
            && !$request->boolean('is_active')
            && $service->is_active;
        $enabling = $request->has('is_active')
            && $request->boolean('is_active')
            && !$service->is_active;

        if ($disabling && empty($data['reason'])) {
            return response()->json([
                'success' => false,
                'message' => 'A reason is required to disable a service.',
            ], 422);
        }

        $request->validate(['image' => 'sometimes|image|mimes:jpg,jpeg,png,webp|max:5120']);

        try {
            $reason = $data['reason'] ?? null;
            unset($data['reason']);
            $service = $this->persistService($service, $data, $request);

            if ($disabling) {
                ActivityLog::log($request->user()?->id, 'service_disabled',
                    "Service #{$service->id} ({$service->name}) disabled", [
                        'category' => 'service',
                        'reference_type' => Service::class,
                        'reference_id' => $service->id,
                        'metadata' => [
                            'service_id' => $service->id,
                            'service_name' => $service->name,
                            'reason' => $reason,
                            'actor_role' => $request->user()?->role,
                        ],
                    ]);
            } elseif ($enabling) {
                ActivityLog::log($request->user()?->id, 'service_enabled',
                    "Service #{$service->id} ({$service->name}) enabled", [
                        'category' => 'service',
                        'reference_type' => Service::class,
                        'reference_id' => $service->id,
                        'metadata' => [
                            'service_id' => $service->id,
                            'service_name' => $service->name,
                            'actor_role' => $request->user()?->role,
                        ],
                    ]);
            } else {
                ActivityLog::log($request->user()?->id, 'service_updated',
                    "Service #{$service->id} ({$service->name}) updated", [
                        'category' => 'service',
                        'reference_type' => Service::class,
                        'reference_id' => $service->id,
                        'metadata' => [
                            'service_id' => $service->id,
                            'service_name' => $service->name,
                            'changes' => array_keys($data),
                            'actor_role' => $request->user()?->role,
                        ],
                    ]);
            }

            return response()->json([
                'success' => true,
                'data' => $service,
                'message' => 'Service updated successfully',
            ]);
        } catch (\Exception $e) {
            Log::error('Service update error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to update service',
            ], 422);
        }
    }

    /**
     * Delete a service. Reason required; blocked while pending/approved
     * appointments reference it. Soft-deletes — history is retained.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $request->merge(['reason' => trim((string) $request->input('reason'))]);
        $validated = $request->validate([
            'reason' => 'required|string|min:3|max:500',
        ]);

        try {
            $result = DB::transaction(function () use ($request, $id, $validated) {
                $service = Service::whereKey($id)->lockForUpdate()->firstOrFail();

                if ($resp = $this->forbidVetOutsideMedicalCategories($request, $service->category)) {
                    return ['blocked' => true, 'response' => $resp];
                }

                $hasActive = Appointment::where('service_id', $id)
                    ->whereIn('status', Service::BLOCKING_APPOINTMENT_STATUSES)
                    ->exists();
                if ($hasActive) {
                    return ['blocked' => true, 'response' => response()->json([
                        'success' => false,
                        'message' => 'Cannot delete service with active appointments. Disable it instead.',
                    ], 422)];
                }

                ActivityLog::log($request->user()?->id, 'service_deleted',
                    "Service #{$service->id} ({$service->name}) deleted", [
                        'category' => 'service',
                        'reference_type' => Service::class,
                        'reference_id' => $service->id,
                        'metadata' => [
                            'service_id' => $service->id,
                            'service_name' => $service->name,
                            'reason' => $validated['reason'],
                            'actor_role' => $request->user()?->role,
                        ],
                    ]);

                $service->delete();

                return ['blocked' => false];
            });

            if ($result['blocked']) {
                return $result['response'];
            }

            return response()->json([
                'success' => true,
                'message' => 'Service deleted successfully',
            ]);
        } catch (\Exception $e) {
            Log::error('Service deletion error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete service',
            ], 422);
        }
    }

    /**
     * Veterinary callers may only manage medical-category services.
     * Returns a 403 response when out of scope, null when allowed.
     */
    private function forbidVetOutsideMedicalCategories(
        Request $request,
        ?string $existingCategory = null,
        ?string $incomingCategory = null
    ): ?JsonResponse {
        if ($this->normalizedRole($request) !== 'veterinary') {
            return null;
        }

        $check = $incomingCategory ?? $existingCategory;
        $inScope = ($existingCategory === null || in_array($existingCategory, Service::VET_CATEGORIES, true))
            && ($check === null || in_array($check, Service::VET_CATEGORIES, true));

        if ($inScope) {
            return null;
        }

        return response()->json([
            'success' => false,
            'message' => 'Veterinary accounts can only manage medical-category services ('
                . implode(', ', Service::VET_CATEGORIES) . ').',
        ], 403);
    }

    /**
     * Fill + save a service, storing a replacement photo transactionally
     * when one was uploaded.
     */
    private function persistService(Service $service, array $data, Request $request): Service
    {
        unset($data['image']);
        $service->fill($data);

        if (!$request->hasFile('image')) {
            $service->save();
            return $service;
        }

        return \App\Services\FileStorageService::storeAndPersist(
            $request->file('image'),
            'service-photos',
            'public',
            function ($path) use ($service) {
                $service->image_path = $path;
                $service->save();
                return $service;
            },
            $service->getRawOriginal('image_path')
        );
    }

    private function normalizedRole(Request $request): string
    {
        $role = (string) ($request->user()?->role ?? '');

        return match ($role) {
            'vet', 'veterinarian' => 'veterinary',
            'super_admin' => 'admin',
            default => $role,
        };
    }
}
