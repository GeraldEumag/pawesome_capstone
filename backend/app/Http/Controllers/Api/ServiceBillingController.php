<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ServiceBillingService;
use App\Support\EmailContent;
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

            // Post-commit customer notification for a newly persisted charge
            // (duplicate retries do not re-notify).
            if (($result['success'] ?? false) && empty($result['duplicate'])) {
                $this->notifyCustomerOfBillingChange($validated, $result);
            }

            return response()->json($result, 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Notify the customer that a charge/discount was added to their service,
     * using persisted (post-transaction) totals only.
     */
    private function notifyCustomerOfBillingChange(array $validated, array $result): void
    {
        try {
            $serviceType = $validated['service_type'];
            $serviceId = (int) $validated['service_id'];

            $record = match ($serviceType) {
                'boarding' => \App\Models\Boarding::find($serviceId),
                'grooming' => \App\Models\Grooming::find($serviceId),
                'veterinary' => \App\Models\Appointment::find($serviceId),
                default => null,
            };

            $email = $record?->customer_email
                ?? $record?->customer?->email
                ?? $record?->customer?->user?->email;

            if (!$email) {
                return;
            }

            $billing = $result['billing'] ?? [];
            $item = $result['billing_item'] ?? null;
            $isDiscount = ($validated['item_type'] ?? null) === 'discount';
            $itemAmount = $item ? (float) $item->total_price : 0;
            $balance = (float) ($billing['balance_due'] ?? 0);

            $title = $isDiscount ? 'Discount applied to your service' : 'Additional charge on your service';
            $message = sprintf(
                '%s: %s (₱%s). New balance due: ₱%s.',
                $isDiscount ? 'A discount was applied' : 'A charge was added',
                $validated['description'] ?? 'Service item',
                number_format($itemAmount, 2),
                number_format($balance, 2)
            );

            \App\Services\WorkflowNotifier::notifyEmail($email, $title, $message, 'info', $serviceType, $serviceId);

            $itemId = $item->id ?? 'x';
            app(\App\Services\EmailDeliveryService::class)->lifecycle(
                $email,
                $title,
                $message,
                'info',
                [
                    'event_key' => 'billing.item_added',
                    'occurrence_key' => "billing.item_added:{$serviceType}:{$serviceId}:{$itemId}",
                    'source_type' => $serviceType,
                    'source_id' => $serviceId,
                    'content' => [
                        'subject' => "[Pawesome] Billing Update — {$serviceType} #{$serviceId}",
                        'customer_name' => $record->customer_name ?? $record->customer?->name,
                        'intro' => $isDiscount
                            ? 'A discount has been applied to your service bill.'
                            : 'An additional charge has been added to your service bill.',
                        'details' => [
                            ['label' => 'Service', 'value' => ucfirst((string) $serviceType) . " #{$serviceId}"],
                            ['label' => $isDiscount ? 'Discount' : 'Item', 'value' => $validated['description'] ?? 'Service item'],
                            ['label' => 'Amount', 'value' => EmailContent::money($itemAmount)],
                            ['label' => 'Balance due', 'value' => EmailContent::money($balance)],
                        ],
                        'status' => $isDiscount ? 'Discount applied' : 'Charge added',
                        'status_type' => 'info',
                        'cta_url' => EmailContent::frontendUrl('/customer/payments'),
                        'cta_label' => 'View Billing',
                    ],
                ]
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Billing-change customer notification failed', [
                'error' => $e->getMessage(),
                'service_type' => $validated['service_type'] ?? null,
                'service_id' => $validated['service_id'] ?? null,
            ]);
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
                'item_ids.*' => 'integer|exists:service_item_usages,id',
                'payment_method' => 'nullable|string|max:50',
                'reference_number' => 'nullable|string|max:255',
            ]);

            $result = ServiceBillingService::markItemsAsPaid(
                $validated['item_ids'],
                Auth::id(),
                $validated['payment_method'] ?? null,
                $validated['reference_number'] ?? null
            );

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
