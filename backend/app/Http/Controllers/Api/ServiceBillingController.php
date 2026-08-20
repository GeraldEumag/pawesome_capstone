<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ServiceBillingService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class ServiceBillingController extends Controller
{
    /**
     * Add billing item to a service
     */
    public function addBillingItem(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'service_type' => 'required|in:veterinary,grooming,boarding',
                'service_id' => 'required|integer',
                'pet_id' => 'nullable|integer',
                'item_type' => 'required|in:base_service,add_on_service,manual_charge,discount',
                'description' => 'required|string|max:255',
                'quantity' => 'required|integer|min:1',
                'unit' => 'nullable|string|max:50',
                'unit_price' => 'required|numeric|min:0',
                'total_price' => 'nullable|numeric|min:0',
                'inventory_item_id' => 'nullable|integer|exists:inventory_items,id',
                'notes' => 'nullable|string'
            ]);

            $result = ServiceBillingService::addBillingItem($validated);

            return response()->json($result, 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Get itemized billing for a service
     */
    public function getItemizedBilling(Request $request, string $serviceType, int $serviceId): JsonResponse
    {
        try {
            // Validate service type
            if (!in_array($serviceType, ['veterinary', 'grooming', 'boarding'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid service type'
                ], 422);
            }

            $billing = ServiceBillingService::getItemizedBilling($serviceType, $serviceId);

            return response()->json([
                'success' => true,
                'billing' => $billing
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Mark billing items as paid (for cashier)
     */
    public function markItemsAsPaid(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'item_ids' => 'required|array',
                'item_ids.*' => 'integer|exists:service_item_usages,id'
            ]);

            $result = ServiceBillingService::markItemsAsPaid($validated['item_ids'], Auth::id());

            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Check if service can be completed (payment status check)
     */
    public function checkCompletionStatus(Request $request, string $serviceType, int $serviceId): JsonResponse
    {
        try {
            // Validate service type
            if (!in_array($serviceType, ['veterinary', 'grooming', 'boarding'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid service type'
                ], 422);
            }

            $status = ServiceBillingService::canCompleteService($serviceType, $serviceId);

            return response()->json([
                'success' => true,
                'status' => $status
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get services with unpaid balances (for cashier dashboard)
     */
    public function getUnpaidServices(): JsonResponse
    {
        try {
            $services = ServiceBillingService::getServicesWithUnpaidBalances();

            return response()->json([
                'success' => true,
                'services' => $services
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get inventory items for billing dropdown
     */
    public function getInventoryItems(): JsonResponse
    {
        try {
            $items = \App\Models\InventoryItem::where('stock', '>', 0)
                ->where('status', '!=', 'archived')
                ->orderBy('name')
                ->get(['id', 'name', 'stock', 'price']);

            return response()->json([
                'success' => true,
                'items' => $items->map(fn ($i) => [
                    'id' => $i->id,
                    'name' => $i->name,
                    'stock' => $i->stock,
                    'unit_price' => (float) ($i->price ?? 0),
                    'unit' => 'pcs',
                ]),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get service billing summary
     */
    public function getServiceSummary(Request $request, string $serviceType, int $serviceId): JsonResponse
    {
        try {
            // Validate service type
            if (!in_array($serviceType, ['veterinary', 'grooming', 'boarding'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid service type'
                ], 422);
            }

            $billing = ServiceBillingService::getItemizedBilling($serviceType, $serviceId);
            $status = ServiceBillingService::canCompleteService($serviceType, $serviceId);

            return response()->json([
                'success' => true,
                'billing' => $billing,
                'completion_status' => $status
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function finalizeBill(Request $request): JsonResponse
    {
        try {
            $serviceType = $request->route('serviceType') ?? $request->input('serviceType') ?? 'veterinary';
            $serviceId = (int) ($request->route('serviceId') ?? $request->route('id') ?? 0);

            if (!in_array($serviceType, ['veterinary', 'grooming', 'boarding'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid service type'
                ], 422);
            }

            $summary = ServiceBillingService::finalizeServiceBill($serviceType, $serviceId);

            return response()->json($summary);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }
}
