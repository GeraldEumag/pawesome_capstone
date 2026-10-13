<?php

namespace App\Http\Controllers\Receptionist;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ServiceController extends Controller
{
    /**
     * List all services (active + inactive) for receptionist management
     */
    public function index(Request $request): JsonResponse
    {
        try {
            $query = Service::query()->orderBy('category')->orderBy('name');

            if ($request->has('category')) {
                $query->byCategory($request->category);
            }

            if ($request->has('active_only') && filter_var($request->active_only, FILTER_VALIDATE_BOOLEAN)) {
                $query->active();
            }

            $services = $query->get();

            return response()->json([
                'success' => true,
                'data' => $services,
                'categories' => Service::VALID_CATEGORIES,
            ]);
        } catch (\Exception $e) {
            Log::error('Receptionist services fetch error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error fetching services.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Create a new service
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $data = $request->validate([
                'name' => 'required|string|max:255',
                'category' => 'required|string|in:' . implode(',', Service::VALID_CATEGORIES),
                'price' => 'required|numeric|min:0',
                'description' => 'nullable|string',
                'duration_minutes' => 'nullable|integer|min:0',
                'is_active' => 'sometimes|boolean',
            ]);

            if (!isset($data['is_active'])) {
                $data['is_active'] = true;
            }

            $service = Service::create($data);

            return response()->json([
                'success' => true,
                'data' => $service,
                'message' => 'Service created successfully',
            ], 201);
        } catch (\Exception $e) {
            Log::error('Receptionist service creation error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to create service',
                'errors' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Update an existing service
     */
    public function update(Request $request, int $id): JsonResponse
    {
        try {
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

            $disabling = $request->has('is_active')
                && !$request->boolean('is_active')
                && $service->is_active;

            if ($disabling && empty($data['reason'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'A reason is required to disable a service.',
                ], 422);
            }

            $reason = $data['reason'] ?? null;
            unset($data['reason']);
            $service->update($data);

            if ($disabling) {
                ActivityLog::log($request->user()?->id, 'service_disabled',
                    "Service #{$service->id} ({$service->name}) disabled by receptionist", [
                        'category'       => 'service',
                        'reference_type' => Service::class,
                        'reference_id'   => $service->id,
                        'metadata'       => [
                            'service_id'   => $service->id,
                            'service_name' => $service->name,
                            'reason'       => $reason,
                        ],
                    ]);
            }

            return response()->json([
                'success' => true,
                'data' => $service,
                'message' => 'Service updated successfully',
            ]);
        } catch (\Exception $e) {
            Log::error('Receptionist service update error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to update service',
                'errors' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Delete a service
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

                $hasAppointments = \App\Models\Appointment::where('service_id', $id)->exists();
                if ($hasAppointments) {
                    return ['blocked' => true];
                }

                ActivityLog::log($request->user()?->id, 'service_deleted',
                    "Service #{$service->id} ({$service->name}) deleted by receptionist", [
                        'category'       => 'service',
                        'reference_type' => Service::class,
                        'reference_id'   => $service->id,
                        'metadata'       => [
                            'service_id'   => $service->id,
                            'service_name' => $service->name,
                            'reason'       => $validated['reason'],
                        ],
                    ]);

                $service->delete();

                return ['blocked' => false];
            });

            if ($result['blocked']) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete service with active appointments',
                ], 422);
            }

            return response()->json([
                'success' => true,
                'message' => 'Service deleted successfully',
            ]);
        } catch (\Exception $e) {
            Log::error('Receptionist service deletion error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete service',
                'errors' => $e->getMessage(),
            ], 422);
        }
    }
}
