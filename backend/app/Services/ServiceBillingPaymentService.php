<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceBillingPaymentRequest;
use App\Models\ServiceBillingPaymentRequestItem;
use App\Models\ServiceItemUsage;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Support\ReceiptBreakdown;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ServiceBillingPaymentService
{
    public static function invoicesForCustomer(Customer $customer): array
    {
        return Appointment::with(['customer', 'pet', 'service', 'veterinarian', 'serviceRequest', 'billingPaymentRequests.items'])
            ->where('customer_id', $customer->id)
            ->where('additional_charges', '>', 0)
            ->latest('scheduled_at')
            ->get()
            ->map(fn (Appointment $appointment) => self::invoiceForAppointment($appointment))
            ->values()
            ->all();
    }

    public static function invoiceForAppointment(Appointment $appointment): array
    {
        $billing = ServiceBillingService::getItemizedBilling('veterinary', (int) $appointment->id);
        $paymentRequest = $appointment->relationLoaded('billingPaymentRequests')
            ? $appointment->billingPaymentRequests->sortByDesc('id')->first()
            : $appointment->billingPaymentRequests()->with('items')->latest('id')->first();
        $serviceRequest = $appointment->relationLoaded('serviceRequest')
            ? $appointment->serviceRequest
            : ($appointment->service_request_id ? ServiceRequest::find($appointment->service_request_id) : null);
        $openRequest = $paymentRequest && in_array($paymentRequest->status, ServiceBillingPaymentRequest::OPEN_STATUSES, true)
            ? $paymentRequest
            : null;
        $balanceDue = round((float) ($billing['balance_due'] ?? 0), 2);
        $additionalCharges = round((float) ($billing['additional_charges'] ?? 0), 2);
        $basePaymentPending = strtolower((string) $serviceRequest?->payment_status) === 'pending'
            && !empty($serviceRequest?->payment_proof);
        $canPay = $balanceDue > 0 && $additionalCharges > 0 && !$openRequest && !$basePaymentPending;

        return [
            'id' => $appointment->id,
            'appointment_id' => $appointment->id,
            'service_request_id' => $appointment->service_request_id,
            'customer_id' => $appointment->customer_id,
            'customer_name' => $appointment->customer?->name,
            'pet_id' => $appointment->pet_id,
            'pet_name' => $appointment->pet?->name,
            'service_name' => $appointment->service?->name ?? 'Veterinary Consultation',
            'veterinarian_id' => $appointment->veterinarian_id,
            'veterinarian_name' => $appointment->veterinarian?->name,
            'scheduled_at' => $appointment->scheduled_at,
            'appointment_status' => $appointment->status,
            'base_amount' => (float) ($billing['base_amount'] ?? 0),
            'additional_charges' => $additionalCharges,
            'total_bill' => (float) ($billing['total_bill'] ?? 0),
            'total_paid' => (float) ($billing['total_paid'] ?? 0),
            'balance_due' => $balanceDue,
            'payment_status' => self::displayPaymentStatus($paymentRequest, $appointment, $billing),
            'payment_channel' => $paymentRequest?->payment_channel,
            'payment_method' => $paymentRequest?->payment_method,
            'payment_reference' => $paymentRequest?->payment_reference,
            'payment_request_id' => $paymentRequest?->id,
            'payment_request_status' => $paymentRequest?->status,
            'payment_request_amount' => $paymentRequest ? (float) $paymentRequest->amount_due : null,
            'payment_request_receipt_number' => $paymentRequest?->receipt_number,
            'payment_request_verified_at' => $paymentRequest?->verified_at,
            'payment_request_paid_at' => $paymentRequest?->paid_at,
            'rejection_reason' => $paymentRequest?->rejection_reason,
            'proof_url' => $paymentRequest?->payment_proof
                && in_array($paymentRequest->status, [ServiceBillingPaymentRequest::STATUS_PENDING_VERIFICATION, ServiceBillingPaymentRequest::STATUS_REJECTED], true)
                    ? url('/api/files/payment-proofs/service-billing-payment/' . $paymentRequest->id . '/view')
                    : null,
            'payment_available' => $canPay,
            'payment_block_reason' => $basePaymentPending
                ? 'The original booking payment is still awaiting cashier verification.'
                : ($openRequest?->payment_channel === 'cashier'
                    ? 'Your bill is waiting for collection at the cashier.'
                    : ($openRequest?->payment_channel === 'online' ? 'Your online proof is awaiting cashier verification.' : null)),
            'items' => collect($billing['items'] ?? [])->map(fn ($item) => [
                'id' => $item->id,
                'item_type' => $item->item_type,
                'description' => $item->description,
                'quantity' => (int) ($item->quantity_used ?? 1),
                'unit' => $item->unit,
                'unit_price' => (float) $item->unit_price,
                'total_price' => (float) $item->total_price,
                'is_billable' => (bool) $item->is_billable,
                'is_paid' => (bool) $item->is_paid,
            ])->values()->all(),
            'created_at' => $appointment->created_at,
        ];
    }

    public static function createCashierRequest(Appointment $appointment, Customer $customer, ?User $actor): ServiceBillingPaymentRequest
    {
        return self::createRequest($appointment, $customer, $actor, 'cashier', null, null, null);
    }

    public static function createOnlineRequest(
        Appointment $appointment,
        Customer $customer,
        ?User $actor,
        string $paymentMethod,
        string $paymentReference,
        string $paymentProof
    ): ServiceBillingPaymentRequest {
        return self::createRequest($appointment, $customer, $actor, 'online', $paymentMethod, $paymentReference, $paymentProof);
    }

    public static function verify(int $requestId, Request $request): array
    {
        return DB::transaction(function () use ($requestId, $request) {
            $requestHeader = ServiceBillingPaymentRequest::find($requestId);
            if (!$requestHeader) {
                return ['success' => false, 'message' => 'Billing payment request not found.', 'status' => 404];
            }

            $appointment = Appointment::whereKey($requestHeader->appointment_id)->lockForUpdate()->first();
            if (!$appointment) {
                return ['success' => false, 'message' => 'The appointment for this bill no longer exists.', 'status' => 404];
            }

            $paymentRequest = ServiceBillingPaymentRequest::with('items')
                ->whereKey($requestId)
                ->lockForUpdate()
                ->first();
            if (!$paymentRequest || !in_array($paymentRequest->status, ServiceBillingPaymentRequest::OPEN_STATUSES, true)) {
                return ['success' => false, 'message' => 'This billing payment request is no longer payable.', 'status' => 422];
            }

            $paymentMethod = $paymentRequest->payment_channel === 'online'
                ? strtolower((string) $paymentRequest->payment_method)
                : strtolower((string) $request->input('payment_method'));
            if (!in_array($paymentMethod, ['cash', 'gcash', 'maya'], true)) {
                return ['success' => false, 'message' => 'Choose Cash, GCash, or Maya for this collection.', 'status' => 422];
            }

            $reference = $paymentRequest->payment_channel === 'online'
                ? (trim((string) $request->input('reference_number', '')) ?: $paymentRequest->payment_reference)
                : trim((string) $request->input('reference_number', ''));
            $cashReceived = null;
            $change = null;
            if ($paymentMethod === 'cash') {
                $cashReceived = (float) $request->input('cash_received', 0);
                if ($cashReceived < (float) $paymentRequest->amount_due) {
                    return ['success' => false, 'message' => 'Cash received must cover the full outstanding balance.', 'status' => 422];
                }
                $change = round($cashReceived - (float) $paymentRequest->amount_due, 2);
            } elseif (!$reference || mb_strlen($reference) < 6) {
                return ['success' => false, 'message' => 'A valid GCash or Maya reference number is required.', 'status' => 422];
            }

            if ($paymentRequest->payment_channel === 'online'
                && (!$paymentRequest->payment_proof || !in_array($paymentMethod, ['gcash', 'maya'], true))) {
                return ['success' => false, 'message' => 'Online billing payments require GCash or Maya proof.', 'status' => 422];
            }

            $billing = ServiceBillingService::getItemizedBilling('veterinary', (int) $appointment->id);
            if (self::invoiceVersion($billing) !== $paymentRequest->invoice_version
                || round((float) ($billing['balance_due'] ?? 0), 2) !== round((float) $paymentRequest->amount_due, 2)) {
                $paymentRequest->update(['status' => ServiceBillingPaymentRequest::STATUS_STALE]);
                return ['success' => false, 'message' => 'The bill changed after this payment request was created. Refresh the invoice and submit the current balance.', 'status' => 409];
            }

            $billableItemIds = $paymentRequest->items
                ->where('is_discount', false)
                ->pluck('service_item_usage_id')
                ->filter()
                ->map(fn ($itemId) => (int) $itemId)
                ->values();
            $unpaidItems = ServiceItemUsage::whereIn('id', $billableItemIds)
                ->where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
                ->where('service_id', $appointment->id)
                ->where('is_billable', true)
                ->where('is_paid', false)
                ->lockForUpdate()
                ->get();

            if ($unpaidItems->count() !== $billableItemIds->count()) {
                $paymentRequest->update(['status' => ServiceBillingPaymentRequest::STATUS_STALE]);
                return ['success' => false, 'message' => 'The bill items changed after this payment request was created. Refresh the invoice and submit the current balance.', 'status' => 409];
            }

            ServiceItemUsage::whereIn('id', $billableItemIds)->update(['is_paid' => true]);
            $updatedBilling = ServiceBillingService::syncServicePaymentState('veterinary', (int) $appointment->id, [
                'verified_by' => Auth::id(),
            ]);
            if ((float) ($updatedBilling['balance_due'] ?? 0) > 0.01) {
                throw new \RuntimeException('The billing ledger did not settle the full invoice balance.');
            }
            $receiptNumber = 'SB-REC-' . now()->format('YmdHis') . '-' . $paymentRequest->id;
            $settlementItems = $paymentRequest->items->map(function (ServiceBillingPaymentRequestItem $item) {
                $totalPrice = (float) $item->total_price;
                $unitPrice = (float) $item->unit_price;
                if ($item->is_discount) {
                    $totalPrice = -abs($totalPrice);
                    $unitPrice = -abs($unitPrice);
                }
                return [
                    'service_item_usage_id' => $item->service_item_usage_id,
                    'description' => $item->is_discount ? 'Discount: ' . $item->description : $item->description,
                    'quantity' => max(1, (int) $item->quantity),
                    'unit_price' => $unitPrice,
                    'total_price' => $totalPrice,
                ];
            })->values()->all();

            $lineTotal = round((float) collect($settlementItems)->sum('total_price'), 2);
            $adjustment = round((float) $paymentRequest->amount_due - $lineTotal, 2);
            if (abs($adjustment) >= 0.01) {
                $settlementItems[] = [
                    'description' => 'Balance adjustment',
                    'quantity' => 1,
                    'unit_price' => $adjustment,
                    'total_price' => $adjustment,
                ];
            }

            PaymentSettlementService::record([
                'settleable_type' => 'service_billing_payment',
                'settleable_id' => $paymentRequest->id,
                'customer_id' => $paymentRequest->customer_id,
                'user_id' => $appointment->customer?->user_id,
                'amount' => (float) $paymentRequest->amount_due,
                'payment_method' => $paymentMethod,
                'reference_number' => $reference ?: null,
                'receipt_number' => $receiptNumber,
                'verified_by' => Auth::id(),
                'verified_at' => now(),
                'paid_at' => now(),
                'idempotency_key' => 'service-billing-payment:' . $paymentRequest->id,
            ], $settlementItems);

            $paymentRequest->update([
                'status' => ServiceBillingPaymentRequest::STATUS_PAID,
                'payment_method' => $paymentMethod,
                'payment_reference' => $reference ?: null,
                'receipt_number' => $receiptNumber,
                'verified_by' => Auth::id(),
                'verified_at' => now(),
                'paid_at' => now(),
                'cashier_remarks' => $request->input('cashier_remarks'),
                'cash_received' => $cashReceived,
                'change_amount' => $change,
            ]);

            if ($appointment->customer?->user_id) {
                WorkflowNotifier::notifyUser(
                    $appointment->customer->user_id,
                    'Veterinary bill payment verified',
                    'Your veterinary bill payment was verified by cashier. Receipt: ' . $receiptNumber,
                    'success',
                    'payment',
                    $paymentRequest->id
                );
            }

            if ($appointment->service_request_id && ($updatedBilling['balance_due'] ?? 0) <= 0) {
                $requestUpdates = [];
                foreach ([
                    'payment_status' => 'paid',
                    'total_amount' => $updatedBilling['total_bill'] ?? $paymentRequest->amount_due,
                    'price' => $updatedBilling['total_bill'] ?? $paymentRequest->amount_due,
                    'amount_paid' => $updatedBilling['total_paid'] ?? $paymentRequest->amount_due,
                    'balance_due' => 0,
                    'paid_at' => now(),
                    'updated_at' => now(),
                ] as $column => $value) {
                    if (Schema::hasColumn('service_requests', $column)) {
                        $requestUpdates[$column] = $value;
                    }
                }
                if ($requestUpdates) {
                    DB::table('service_requests')->where('id', $appointment->service_request_id)->update($requestUpdates);
                }
            }

            return [
                'success' => true,
                'message' => 'Veterinary bill payment verified successfully.',
                'payment_status' => 'paid',
                'payment_method' => $paymentMethod,
                'amount' => (float) $paymentRequest->amount_due,
                'receipt_number' => $receiptNumber,
                'cash_received' => $cashReceived,
                'change' => $change,
                'breakdown' => ReceiptBreakdown::forSettleable('service_billing_payment', $paymentRequest->id, (float) $paymentRequest->amount_due),
            ];
        });
    }

    public static function reject(int $requestId, string $reason): array
    {
        if (trim($reason) === '') {
            return ['success' => false, 'message' => 'Rejection reason is required.', 'status' => 422];
        }

        return DB::transaction(function () use ($requestId, $reason) {
            $requestHeader = ServiceBillingPaymentRequest::find($requestId);
            if (!$requestHeader) {
                return ['success' => false, 'message' => 'Billing payment request not found.', 'status' => 404];
            }

            $appointment = Appointment::whereKey($requestHeader->appointment_id)->lockForUpdate()->first();
            if (!$appointment) {
                return ['success' => false, 'message' => 'The appointment for this bill no longer exists.', 'status' => 404];
            }

            $paymentRequest = ServiceBillingPaymentRequest::whereKey($requestId)->lockForUpdate()->first();
            if (!$paymentRequest || $paymentRequest->status !== ServiceBillingPaymentRequest::STATUS_PENDING_VERIFICATION) {
                return ['success' => false, 'message' => 'Only an online billing proof awaiting verification can be rejected.', 'status' => 422];
            }

            $paymentRequest->update([
                'status' => ServiceBillingPaymentRequest::STATUS_REJECTED,
                'rejection_reason' => $reason,
                'verified_by' => Auth::id(),
                'verified_at' => now(),
            ]);

            if ($appointment->customer?->user_id) {
                WorkflowNotifier::notifyUser(
                    $appointment->customer->user_id,
                    'Veterinary bill payment rejected',
                    'Your veterinary bill proof was rejected. Reason: ' . $reason,
                    'warning',
                    'payment',
                    $paymentRequest->id
                );
            }

            return ['success' => true, 'message' => 'Veterinary bill payment proof rejected.', 'payment_status' => 'rejected'];
        });
    }

    private static function createRequest(
        Appointment $appointment,
        Customer $customer,
        ?User $actor,
        string $channel,
        ?string $paymentMethod,
        ?string $paymentReference,
        ?string $paymentProof
    ): ServiceBillingPaymentRequest {
        return DB::transaction(function () use ($appointment, $customer, $actor, $channel, $paymentMethod, $paymentReference, $paymentProof) {
            $lockedAppointment = Appointment::whereKey($appointment->id)->lockForUpdate()->firstOrFail();
            if ((int) $lockedAppointment->customer_id !== (int) $customer->id) {
                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json(['message' => 'Invoice not found.'], 404));
            }

            if (in_array($lockedAppointment->status, ['cancelled', 'canceled', 'rejected', 'no_show'], true)) {
                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json(['message' => 'This appointment cannot be paid.'], 422));
            }

            $billing = ServiceBillingService::getItemizedBilling('veterinary', (int) $lockedAppointment->id);
            $balanceDue = round((float) ($billing['balance_due'] ?? 0), 2);
            if ((float) ($billing['additional_charges'] ?? 0) <= 0 || $balanceDue <= 0) {
                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json(['message' => 'There is no additional veterinary balance to pay.'], 422));
            }

            $serviceRequest = $lockedAppointment->service_request_id
                ? ServiceRequest::whereKey($lockedAppointment->service_request_id)->lockForUpdate()->first()
                : null;
            if ($serviceRequest
                && strtolower((string) $serviceRequest->payment_status) === 'pending'
                && !empty($serviceRequest->payment_proof)) {
                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                    'message' => 'The original booking payment is still awaiting cashier verification. Refresh this bill after it is resolved.',
                ], 409));
            }

            $version = self::invoiceVersion($billing);
            $activeRequest = ServiceBillingPaymentRequest::where('appointment_id', $lockedAppointment->id)
                ->whereIn('status', ServiceBillingPaymentRequest::OPEN_STATUSES)
                ->lockForUpdate()
                ->latest('id')
                ->first();
            if ($activeRequest && hash_equals($activeRequest->invoice_version, $version)) {
                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                    'message' => 'A payment request is already awaiting cashier processing. Refresh the invoice for its latest status.',
                    'payment_request_id' => $activeRequest->id,
                    'payment_request_status' => $activeRequest->status,
                ], 409));
            }
            if ($activeRequest) {
                $activeRequest->update([
                    'status' => ServiceBillingPaymentRequest::STATUS_STALE,
                    'rejection_reason' => 'The bill changed after this payment request was created. Please review and resubmit the current balance.',
                ]);
            }

            $request = ServiceBillingPaymentRequest::create([
                'appointment_id' => $lockedAppointment->id,
                'service_request_id' => $lockedAppointment->service_request_id,
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'customer_email' => $customer->email,
                'pet_name' => Pet::find($lockedAppointment->pet_id)?->name,
                'service_name' => Service::find($lockedAppointment->service_id)?->name ?? 'Veterinary Consultation',
                'created_by' => $actor?->id,
                'amount_due' => $balanceDue,
                'invoice_version' => $version,
                'payment_channel' => $channel,
                'payment_method' => $paymentMethod,
                'payment_reference' => $paymentReference,
                'payment_proof' => $paymentProof,
                'status' => $channel === 'online'
                    ? ServiceBillingPaymentRequest::STATUS_PENDING_VERIFICATION
                    : ServiceBillingPaymentRequest::STATUS_AWAITING_CASHIER,
                'submitted_at' => $channel === 'online' ? now() : null,
            ]);

            foreach (self::snapshotItems($billing) as $item) {
                $request->items()->create($item);
            }

            return $request->load('items');
        });
    }

    private static function snapshotItems(array $billing): array
    {
        return collect($billing['items'] ?? [])
            ->filter(fn ($item) => (($item->is_billable ?? false) && !($item->is_paid ?? false))
                || ($item->item_type ?? null) === ServiceItemUsage::ITEM_DISCOUNT)
            ->map(fn ($item) => [
                'service_item_usage_id' => $item->id,
                'item_type' => $item->item_type,
                'description' => $item->description ?: 'Service item',
                'quantity' => max(1, (int) ($item->quantity_used ?? 1)),
                'unit' => $item->unit,
                'unit_price' => round((float) $item->unit_price, 2),
                'total_price' => round((float) $item->total_price, 2),
                'is_discount' => ($item->item_type ?? null) === ServiceItemUsage::ITEM_DISCOUNT,
            ])
            ->values()
            ->all();
    }

    private static function invoiceVersion(array $billing): string
    {
        $items = collect($billing['items'] ?? [])
            ->filter(fn ($item) => ($item->is_billable ?? false) || ($item->item_type ?? null) === ServiceItemUsage::ITEM_DISCOUNT)
            ->map(fn ($item) => [
                'id' => (int) $item->id,
                'item_type' => (string) $item->item_type,
                'quantity' => (int) ($item->quantity_used ?? 1),
                'unit_price' => number_format((float) $item->unit_price, 2, '.', ''),
                'total_price' => number_format((float) $item->total_price, 2, '.', ''),
                'is_billable' => (bool) $item->is_billable,
                'is_paid' => (bool) $item->is_paid,
            ])
            ->sortBy('id')
            ->values()
            ->all();

        return hash('sha256', json_encode([
            'balance_due' => number_format((float) ($billing['balance_due'] ?? 0), 2, '.', ''),
            'items' => $items,
        ], JSON_THROW_ON_ERROR));
    }

    public static function currentInvoiceVersion(Appointment $appointment): string
    {
        return self::invoiceVersion(
            ServiceBillingService::getItemizedBilling('veterinary', (int) $appointment->id)
        );
    }

    private static function displayPaymentStatus(?ServiceBillingPaymentRequest $request, Appointment $appointment, array $billing): string
    {
        $balanceDue = (float) ($billing['balance_due'] ?? 0);
        if ($request?->status === ServiceBillingPaymentRequest::STATUS_PENDING_VERIFICATION) {
            return 'pending';
        }
        if ($request?->status === ServiceBillingPaymentRequest::STATUS_AWAITING_CASHIER) {
            return 'pending';
        }
        if ($request?->status === ServiceBillingPaymentRequest::STATUS_REJECTED) {
            return 'rejected';
        }
        if ($balanceDue <= 0) {
            return 'paid';
        }
        if ($request?->status === ServiceBillingPaymentRequest::STATUS_PAID
            || $request?->status === ServiceBillingPaymentRequest::STATUS_STALE) {
            return 'unpaid';
        }

        return (string) ($appointment->payment_status ?? 'unpaid');
    }
}
