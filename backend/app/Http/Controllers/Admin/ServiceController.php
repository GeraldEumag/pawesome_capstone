<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ServiceController extends Controller
{
    // Show all active services
    public function index(): JsonResponse
    {
        try {
            $services = Service::query()
                ->where('is_active', true)
                ->orderBy('category')
                ->orderBy('name')
                ->get();

            return response()->json([
                'success' => true,
                'data' => $services
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to fetch services: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json([
                'success' => false,
                'message' => 'Error fetching services.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // Create a new service
    public function store(Request $request): JsonResponse
    {
        try {
            // Validate incoming request
            $data = $request->validate([
                'name' => 'required|string|max:255',
                'category' => 'required|string|in:' . implode(',', Service::VALID_CATEGORIES),
                'price' => 'required|numeric|min:0',
                'description' => 'nullable|string',
                'duration_minutes' => 'nullable|integer|min:0',
                'is_active' => 'sometimes|boolean',
            ]);

            // Set default 'is_active' to true if not provided
            if (!isset($data['is_active'])) {
                $data['is_active'] = true;
            }

            // Create the service
            $service = Service::create($data);

            return response()->json([
                'success' => true,
                'data' => $service
            ], 201);
        } catch (\Exception $e) {
            Log::error('Service creation error: ' . $e->getMessage(), [
                'request_data' => $request->all(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to create service',
                'errors' => $e->getMessage()
            ], 422);
        }
    }

    // Update an existing service
    public function update(Request $request, int $id): JsonResponse
    {
        try {
            // Validate incoming request
            $data = $request->validate([
                'name' => 'sometimes|string|max:255',
                'category' => 'sometimes|string|in:' . implode(',', Service::VALID_CATEGORIES),
                'price' => 'sometimes|numeric|min:0',
                'description' => 'sometimes|nullable|string',
                'duration_minutes' => 'sometimes|nullable|integer|min:0',
                'is_active' => 'sometimes|boolean',
            ]);

            // Find the service to update
            $service = Service::findOrFail($id);
            $service->update($data);

            return response()->json([
                'success' => true,
                'data' => $service
            ]);
        } catch (\Exception $e) {
            Log::error('Service update error: ' . $e->getMessage(), [
                'request_data' => $request->all(),
                'service_id' => $id,
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to update service',
                'errors' => $e->getMessage()
            ], 422);
        }
    }

    // Delete a service
    public function destroy(int $id): JsonResponse
    {
        try {
            // Find the service to delete
            $service = Service::findOrFail($id);

            // Prevent deletion if service has active appointments
            $hasAppointments = \App\Models\Appointment::where('service_id', $id)->exists();
            if ($hasAppointments) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete service with active appointments'
                ], 422);
            }

            $service->delete();

            return response()->json(['message' => 'Service deleted successfully']);
        } catch (\Exception $e) {
            Log::error('Service deletion error: ' . $e->getMessage(), ['service_id' => $id, 'trace' => $e->getTraceAsString()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete service',
                'errors' => $e->getMessage()
            ], 422);
        }
    }
}