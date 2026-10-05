<?php

namespace App\Services;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\ActivityLog;
use App\Models\ServiceItemUsage;
use App\Models\ServiceRequest;
use App\Services\WorkflowNotifier;

class PaymentVerificationService
{
    private function blockedPaymentTypeResult(string $type): ?array
    {
        $normalized = strtolower(str_replace(['-', ' '], '_', trim($type)));
        if (in_array($normalized, ['customer_order', 'customer_orders', 'order', 'store_order', 'online_order'], true)) {
            return ['success' => false, 'message' => 'Customer store order workflows are disabled.', 'status' => 410];
        }

        if (!in_array($normalized, ['boarding', 'appointment', 'veterinary', 'grooming', 'medical_confinement', 'confinement', 'service_request', 'service'], true)) {
            return ['success' => false, 'message' => 'Unsupported payment type.', 'status' => 422];
        }

        return null;
    }

    /**
     * Verify a payment
     * Returns array with standardized keys: success, message, payment_status, receipt_number
     */
    public function verify(string $type, int $id, $request)
    {
        $normalizedType = strtolower(str_replace(['-', ' '], '_', trim($type)));
        if ($blocked = $this->blockedPaymentTypeResult($normalizedType)) {
            return $blocked;
        }
        $type = $normalizedType;

        $before = $this->paymentStatusOf($type, $id);
        $result = $this->performVerify($type, $id, $request);

        if (($result['success'] ?? false) === true) {
            $this->queueCustomerReceiptEmail($type, $id);

            ActivityLog::log(Auth::id(), 'payment_verified', "Payment verified for {$type} #{$id}", [
                'category' => 'payment',
                'reference_type' => $type,
                'reference_id' => $id,
                'changes' => ['payment_status' => ['old' => $before, 'new' => $result['payment_status'] ?? 'paid']],
                'metadata' => [
                    'receipt_number' => $result['receipt_number'] ?? null,
                    'reference_number' => $request->input('reference_number'),
                    'payment_method' => $request->input('payment_method'),
                ],
            ]);
        }

        return $result;
    }

    private function performVerify(string $type, int $id, $request)
    {
        $referenceNumber = $request->input('reference_number');
        $paymentMethod = $request->input('payment_method');
        $isCounterPayment = !$referenceNumber && in_array(strtolower((string) $paymentMethod), ['cash', 'counter', 'walk_in', 'walk-in', '']);

        if (!$isCounterPayment) {
            if (!$referenceNumber || trim($referenceNumber) === '') {
                return ['success' => false, 'message' => 'Reference number is required to verify payment', 'status' => 422];
            }
            if (strlen(trim($referenceNumber)) < 6) {
                return ['success' => false, 'message' => 'Reference number must be at least 6 characters', 'status' => 422];
            }
        }

        try {
            // All payment-state writes + linked service/billing syncs must commit
            // together or not at all. In-app notifications are DB rows and roll
            // back with the transaction — they are intentionally inside it.
            return DB::transaction(function () use ($type, $id, $request, $referenceNumber) {
                if ($type === 'boarding') {
                    return $this->verifyTablePayment('boardings', 'BD-REC-', $id, $request, 'Boarding payment verified successfully.', $referenceNumber);
                }

                if ($type === 'appointment' || $type === 'veterinary') {
                    return $this->verifyTablePayment('appointments', 'VT-REC-', $id, $request, 'Veterinary payment verified successfully.', $referenceNumber);
                }

                if ($type === 'grooming') {
                    return $this->verifyTablePayment('groomings', 'GR-REC-', $id, $request, 'Grooming payment verified successfully.', $referenceNumber);
                }

                if ($type === 'medical_confinement' || $type === 'confinement') {
                    return $this->verifyTablePayment('medical_confinements', 'MC-REC-', $id, $request, 'Medical confinement payment verified successfully.', $referenceNumber);
                }

                if ($type === 'service_request' || $type === 'service') {
                    $sr = DB::table('service_requests')->where('id', $id)->lockForUpdate()->first();
                    if (!$sr) return ['success' => false, 'message' => 'Service request not found', 'status' => 404];
                    if (($sr->payment_status ?? 'unpaid') !== 'pending') {
                        return ['success' => false, 'message' => 'Only pending payment proofs can be verified', 'status' => 422, 'payment_status' => $sr->payment_status];
                    }

                    $receiptNumber = 'SR-REC-' . now()->format('YmdHis') . '-' . $id;

                    DB::table('service_requests')->where('id', $id)->update([
                        'payment_status' => 'paid',
                        'paid_at' => now(),
                        'verified_by' => Auth::id(),
                        'verified_at' => now(),
                        'cashier_remarks' => $request->input('cashier_remarks', 'Payment verified by cashier'),
                        'receipt_number' => $receiptNumber,
                        'reference_number' => $referenceNumber,
                    ]);

                    $this->markLinkedServiceAsPaidFromRequest($sr, $id, $receiptNumber);

                    $srModel = ServiceRequest::find($id);
                    $srCustomer = $srModel ? CustomerEmailResolver::forServiceRequest($srModel) : null;
                    PaymentSettlementService::record([
                        'settleable_type' => 'service_request',
                        'settleable_id' => $id,
                        'customer_id' => $srCustomer?->id,
                        'user_id' => $sr->customer_id ?? null,
                        'amount' => $this->settledAmount('service_requests', $sr),
                        'payment_method' => $sr->payment_method ?? null,
                        'reference_number' => $referenceNumber ?? $sr->payment_reference ?? null,
                        'receipt_number' => $receiptNumber,
                        'verified_by' => Auth::id(),
                        'verified_at' => now(),
                        'paid_at' => now(),
                        'idempotency_key' => "verify:service_request:{$id}:{$receiptNumber}",
                    ], [[
                        'description' => $sr->service_name ?? 'Service request',
                        'quantity' => 1,
                        'unit_price' => $this->settledAmount('service_requests', $sr),
                        'total_price' => $this->settledAmount('service_requests', $sr),
                    ]]);

                    WorkflowNotifier::notifyEmail($sr->customer_email ?? null, 'Payment Verified', "Your payment for {$sr->service_name} has been verified. Receipt: {$receiptNumber}", 'success', 'service_request', $id);

                    return ['success' => true, 'message' => 'Service request payment verified successfully.', 'payment_status' => 'paid', 'receipt_number' => $receiptNumber];
                }

                // default: customer_order
                $order = DB::table('customer_orders')->where('id', $id)->lockForUpdate()->first();
                if (!$order) return ['success' => false, 'message' => 'Order not found', 'status' => 404];
                if ((($order->payment_status) ?? 'unpaid') !== 'pending') {
                    return ['success' => false, 'message' => 'Only pending payment proofs can be verified', 'status' => 422, 'payment_status' => $order->payment_status ?? 'unpaid'];
                }

                $receiptNumber = $order->receipt_number ?? ('REC-' . now()->format('YmdHis') . '-' . $order->id);

                DB::table('customer_orders')->where('id', $id)->update([
                    'payment_status' => 'paid',
                    'paid_at' => now(),
                    'verified_by' => Auth::id(),
                    'verified_at' => now(),
                    'cashier_remarks' => $request->input('cashier_remarks'),
                    'receipt_number' => $receiptNumber,
                    'reference_number' => $referenceNumber,
                    'updated_at' => now(),
                ]);

                return ['success' => true, 'message' => 'Payment verified successfully', 'payment_status' => 'paid', 'receipt_number' => $receiptNumber];
            });
        } catch (\Throwable $e) {
            Log::error('PaymentVerificationService::verify error - ' . $e->getMessage());
            return ['success' => false, 'message' => $e->getMessage(), 'status' => 500];
        }
    }

    public function reject(string $type, int $id, $request)
    {
        $normalizedType = strtolower(str_replace(['-', ' '], '_', trim($type)));
        if ($blocked = $this->blockedPaymentTypeResult($normalizedType)) {
            return $blocked;
        }
        $type = $normalizedType;

        $before = $this->paymentStatusOf($type, $id);
        $result = $this->performReject($type, $id, $request);

        if (($result['success'] ?? false) === true) {
            ActivityLog::log(Auth::id(), 'payment_rejected', "Payment rejected for {$type} #{$id}", [
                'category' => 'payment',
                'reference_type' => $type,
                'reference_id' => $id,
                'changes' => ['payment_status' => ['old' => $before, 'new' => 'rejected']],
                'metadata' => ['rejection_reason' => $request->input('rejection_reason')],
            ]);
        }

        return $result;
    }

    private function performReject(string $type, int $id, $request)
    {
        $rejectionReason = trim((string) $request->input('rejection_reason', ''));

        if ($rejectionReason === '') {
            return [
                'success' => false,
                'message' => 'Rejection reason is required.',
                'status' => 422,
            ];
        }

        try {
            return DB::transaction(function () use ($type, $id, $request, $rejectionReason) {
                if ($type === 'boarding') {
                    return $this->rejectTablePayment('boardings', $id, $request, 'Boarding payment rejected', $rejectionReason);
                }

                if ($type === 'appointment' || $type === 'veterinary') {
                    return $this->rejectTablePayment('appointments', $id, $request, 'Veterinary payment rejected', $rejectionReason);
                }

                if ($type === 'grooming') {
                    return $this->rejectTablePayment('groomings', $id, $request, 'Grooming payment rejected', $rejectionReason);
                }

                if ($type === 'medical_confinement' || $type === 'confinement') {
                    return $this->rejectTablePayment('medical_confinements', $id, $request, 'Medical confinement payment rejected', $rejectionReason);
                }

                if ($type === 'service_request' || $type === 'service') {
                    $sr = DB::table('service_requests')->where('id', $id)->lockForUpdate()->first();
                    if (!$sr) return ['success' => false, 'message' => 'Service request not found', 'status' => 404];
                    if (($sr->payment_status ?? 'unpaid') !== 'pending') {
                        return ['success' => false, 'message' => 'Only pending payment proofs can be rejected', 'status' => 422, 'payment_status' => $sr->payment_status];
                    }

                    DB::table('service_requests')->where('id', $id)->update([
                        'payment_status' => 'rejected',
                        'rejected_by' => Auth::id(),
                        'rejected_at' => now(),
                        'rejection_reason' => $rejectionReason,
                    ]);

                    WorkflowNotifier::notifyEmail($sr->customer_email ?? null, 'Payment Rejected', "Your payment for {$sr->service_name} was rejected. Reason: {$rejectionReason}", 'error', 'service_request', $id);

                    return ['success' => true, 'message' => 'Service request payment rejected', 'payment_status' => 'rejected'];
                }

                $order = DB::table('customer_orders')->where('id', $id)->lockForUpdate()->first();
                if (!$order) return ['success' => false, 'message' => 'Order not found', 'status' => 404];
                if ((($order->payment_status) ?? 'unpaid') !== 'pending') {
                    return ['success' => false, 'message' => 'Only pending payment proofs can be rejected', 'status' => 422, 'payment_status' => $order->payment_status ?? 'unpaid'];
                }

                DB::table('customer_orders')->where('id', $id)->update([
                    'payment_status' => 'rejected',
                    'rejected_by' => Auth::id(),
                    'rejected_at' => now(),
                    'rejection_reason' => $rejectionReason,
                ]);

                return ['success' => true, 'message' => 'Payment rejected', 'payment_status' => 'rejected'];
            });
        } catch (\Throwable $e) {
            Log::error('PaymentVerificationService::reject error - ' . $e->getMessage());
            return ['success' => false, 'message' => $e->getMessage(), 'status' => 500];
        }
    }

    private function queueCustomerReceiptEmail(string $type, int $id): void
    {
        $meta = match ($type) {
            'service_request', 'service' => ['table' => 'service_requests', 'settleable' => 'service_request'],
            'customer_order' => ['table' => 'customer_orders', 'settleable' => null],
            'boarding' => ['table' => 'boardings', 'settleable' => 'boarding'],
            'appointment', 'veterinary' => ['table' => 'appointments', 'settleable' => 'appointment'],
            'grooming' => ['table' => 'groomings', 'settleable' => 'grooming'],
            'medical_confinement', 'confinement' => ['table' => 'medical_confinements', 'settleable' => 'medical_confinement'],
            default => null,
        };

        if (!$meta) {
            return;
        }

        try {
            $table = $meta['table'];
            $record = DB::table($table)->where('id', $id)->first();
            if (!$record || ($record->payment_status ?? null) !== 'paid' || empty($record->receipt_number)) {
                return;
            }

            // Authoritative settlement: the ledger row written inside the
            // verify transaction. Legacy-paid records may lack one — fall
            // back to the persisted record fields rather than skipping.
            $settlement = $meta['settleable']
                ? \App\Models\PaymentSettlement::where('settleable_type', $meta['settleable'])
                    ->where('settleable_id', $id)
                    ->where('receipt_number', $record->receipt_number)
                    ->with('items')
                    ->first()
                : null;

            $totalAmount = $settlement?->amount ?? $this->settledAmount($table, $record);

            // Recipient: prefer the record's persisted email where present.
            // Identity domains differ per table — service_requests.customer_id
            // is a users.id (resolve via CustomerEmailResolver stable
            // ownership); dedicated tables carry a real customers.id.
            $customer = null;
            if ($table === 'service_requests') {
                $srModel = ServiceRequest::find($id);
                $customer = $srModel ? CustomerEmailResolver::forServiceRequest($srModel) : null;
            } elseif (!empty($record->customer_id)) {
                $customer = \App\Models\Customer::find($record->customer_id);
            }

            $customerEmail = $record->customer_email ?? $customer?->email;

            if (empty($customerEmail) || !is_numeric($totalAmount) || (float) $totalAmount <= 0) {
                Log::warning('Payment receipt email skipped because persisted receipt data is incomplete', [
                    'type' => $type,
                    'record_id' => $id,
                ]);
                return;
            }

            $receipt = [
                'receipt_number' => $record->receipt_number,
                'customer_name' => $record->customer_name ?? $customer?->name ?? 'Customer',
                'customer_email' => $customerEmail,
                'total_amount' => (float) $totalAmount,
                'payment_method' => $record->payment_method ?? $settlement?->payment_method,
                'payment_reference' => $record->reference_number ?: ($record->payment_reference ?? $settlement?->reference_number),
                'paid_at' => $record->paid_at ?? $settlement?->paid_at,
            ];

            if ($table === 'customer_orders') {
                $receipt['items'] = DB::table('customer_order_items')
                    ->where('customer_order_id', $id)
                    ->get()
                    ->map(fn ($item) => [
                        'product_name' => $item->product_name,
                        'quantity' => (int) $item->quantity,
                        'price' => (float) $item->price,
                        'subtotal' => (float) $item->subtotal,
                    ])
                    ->all();
            } else {
                // Settlement items provide the authoritative itemization;
                // normalized to the template's item shape.
                if ($settlement && $settlement->items->isNotEmpty()) {
                    $receipt['items'] = $settlement->items->map(fn ($item) => [
                        'product_name' => $item->description,
                        'quantity' => (int) $item->quantity,
                        'price' => (float) $item->unit_price,
                        'subtotal' => (float) $item->total_price,
                    ])->all();
                }

                $receipt['pet_name'] = $record->pet_name
                    ?? (!empty($record->pet_id) ? \App\Models\Pet::find($record->pet_id)?->name : null);
                $receipt['service_name'] = match ($table) {
                    'service_requests' => $record->service_name ?? 'Service',
                    'boardings' => 'Boarding' . (($record->stay_type ?? $record->boarding_type ?? null) ? ' (' . ($record->stay_type ?? $record->boarding_type) . ')' : ''),
                    'appointments' => \App\Models\Service::find($record->service_id ?? 0)?->name ?? 'Veterinary service',
                    'groomings' => $record->service ?? 'Grooming',
                    default => 'Medical confinement',
                };
                $receipt['service_date'] = $record->request_date
                    ?? $record->appointment_date
                    ?? $record->check_in
                    ?? null;
            }

            $receiptKind = $meta['settleable'] ?? 'customer_order';
            NotificationService::sendPaymentReceiptEmail($customerEmail, $table === 'customer_orders' ? 'customer_order' : 'service_request', $receipt, [
                'event_key' => "payment.receipt.{$receiptKind}",
                'occurrence_key' => "{$receiptKind}:{$id}:{$record->receipt_number}",
                'source_type' => $meta['settleable'],
                'source_id' => $id,
                'customer_id' => $customer?->id ?? ($table === 'service_requests' ? null : ($record->customer_id ?? null)),
                'user_id' => $table === 'service_requests' ? ($record->customer_id ?? null) : null,
            ]);
        } catch (\Throwable $e) {
            Log::error('Failed to queue customer payment receipt email', [
                'type' => $type,
                'record_id' => $id,
                'exception' => get_class($e),
            ]);
        }
    }

    /**
     * Resolve the authoritative settled amount from the persisted record —
     * never from request input. Billing-synced totals take precedence.
     */
    private function settledAmount(string $table, object $record): float
    {
        $candidates = match ($table) {
            'medical_confinements' => ['final_amount', 'total_amount', 'amount'],
            'service_requests' => ['total_amount', 'price'],
            default => ['total_amount', 'price', 'amount'],
        };

        foreach ($candidates as $column) {
            $value = $record->{$column} ?? null;
            if (is_numeric($value) && (float) $value > 0) {
                return (float) $value;
            }
        }

        return 0.0;
    }

    /**
     * Snapshot the paid billable items for a settlement. Only items already
     * marked paid are recorded — the settlement describes what was settled.
     */
    private function settlementItemsFor(string $serviceType, int $serviceId): array
    {
        return ServiceItemUsage::where('service_type', $serviceType)
            ->where('service_id', $serviceId)
            ->where('is_billable', true)
            ->where('is_paid', true)
            ->get()
            ->map(fn ($item) => [
                'service_item_usage_id' => $item->id,
                'description' => $item->description ?: ($item->service_name_snapshot ?: ($item->item_name_snapshot ?: 'Service item')),
                'quantity' => max(1, (int) ($item->quantity_used ?? 1)),
                'unit_price' => (float) $item->unit_price,
                'total_price' => (float) $item->total_price,
            ])
            ->all();
    }

    private function paymentStatusOf(string $type, int $id): ?string
    {
        $table = match ($type) {
            'boarding' => 'boardings',
            'appointment', 'veterinary' => 'appointments',
            'grooming' => 'groomings',
            'medical_confinement', 'confinement' => 'medical_confinements',
            'service_request', 'service' => 'service_requests',
            default => 'customer_orders',
        };

        return DB::table($table)->where('id', $id)->value('payment_status');
    }

    private function verifyTablePayment(string $table, string $prefix, int $id, $request, string $message, ?string $referenceNumber = null): array
    {
        $record = DB::table($table)->where('id', $id)->lockForUpdate()->first();
        if (!$record) {
            return ['success' => false, 'message' => 'Payment record not found', 'status' => 404];
        }

        // 'unpaid' is accepted for counter collections (cash at the desk —
        // no uploaded proof), matching the established appointment flow.
        $allowedStatuses = in_array($table, ['appointments', 'boardings', 'groomings'], true)
            ? ['pending', 'unpaid']
            : ['pending'];
        if (!in_array($record->payment_status ?? 'unpaid', $allowedStatuses)) {
            return ['success' => false, 'message' => 'Only pending payment proofs can be verified', 'status' => 422, 'payment_status' => $record->payment_status ?? 'unpaid'];
        }

        $receiptNumber = $record->receipt_number ?? ($prefix . now()->format('YmdHis') . '-' . $id);

        $updateData = [
            'payment_status' => 'paid',
            'paid_at' => now(),
            'verified_by' => Auth::id(),
            'verified_at' => now(),
            'cashier_remarks' => $request->input('cashier_remarks', 'Payment verified by cashier'),
            'receipt_number' => $receiptNumber,
            'updated_at' => now(),
        ];

        // Note: status is not set to 'completed' here; the service provider
        // completes the appointment after medical record finalization.

        if ($referenceNumber) {
            $updateData['reference_number'] = $referenceNumber;
        }

        DB::table($table)->where('id', $id)->update($updateData);

        $billingResult = $this->syncServiceBillingForVerifiedPayment($table, $id, Auth::id(), $receiptNumber);

        // Re-read post-sync so the settlement records the authoritative total.
        $settled = DB::table($table)->where('id', $id)->first() ?? $record;
        $settleableType = match ($table) {
            'boardings' => 'boarding',
            'appointments' => 'appointment',
            'groomings' => 'grooming',
            default => 'medical_confinement',
        };
        $billingServiceType = match ($table) {
            'appointments' => 'veterinary',
            'groomings' => 'grooming',
            'boardings' => 'boarding',
            default => null,
        };

        // The settlement must describe what THIS verification settled: the
        // items markBaseServiceAsPaid just flipped. Using the record's full
        // total would overstate the payment when unpaid add-ons remain.
        $paidItemIds = $billingResult['paid_item_ids'] ?? [];
        $settlementItems = $billingServiceType && !empty($paidItemIds)
            ? ServiceItemUsage::whereIn('id', $paidItemIds)->get()
                ->map(fn ($item) => [
                    'service_item_usage_id' => $item->id,
                    'description' => $item->description ?: ($item->service_name_snapshot ?: ($item->item_name_snapshot ?: 'Service item')),
                    'quantity' => max(1, (int) ($item->quantity_used ?? 1)),
                    'unit_price' => (float) $item->unit_price,
                    'total_price' => (float) $item->total_price,
                ])->all()
            : $this->settlementItemsFor($billingServiceType ?? '', $id);

        $settledAmount = !empty($settlementItems)
            ? (float) collect($settlementItems)->sum('total_price')
            : $this->settledAmount($table, $settled);
        if (empty($settlementItems)) {
            $settlementItems = [[
                'description' => $settleableType . ' settlement',
                'quantity' => 1,
                'unit_price' => $settledAmount,
                'total_price' => $settledAmount,
            ]];
        }

        PaymentSettlementService::record([
            'settleable_type' => $settleableType,
            'settleable_id' => $id,
            'customer_id' => $record->customer_id ?? null,
            'amount' => $settledAmount,
            'payment_method' => $record->payment_method ?? null,
            'reference_number' => $referenceNumber ?? $record->reference_number ?? $record->payment_reference ?? null,
            'receipt_number' => $receiptNumber,
            'verified_by' => Auth::id(),
            'verified_at' => now(),
            'paid_at' => $settled->paid_at ?? now(),
            'idempotency_key' => "verify:{$settleableType}:{$id}:{$receiptNumber}",
        ], $settlementItems);

        WorkflowNotifier::notifyEmail($record->customer_email ?? null, 'Payment verified', 'Your payment proof was verified by cashier.', 'success', $table, $id);

        return ['success' => true, 'message' => $message, 'payment_status' => 'paid', 'receipt_number' => $receiptNumber];
    }

    private function rejectTablePayment(string $table, int $id, $request, string $message, string $rejectionReason): array
    {
        $record = DB::table($table)->where('id', $id)->lockForUpdate()->first();
        if (!$record) {
            return ['success' => false, 'message' => 'Payment record not found', 'status' => 404];
        }

        $allowedStatuses = $table === 'appointments' ? ['pending', 'unpaid'] : ['pending'];
        if (!in_array(($record->payment_status ?? 'unpaid'), $allowedStatuses)) {
            return ['success' => false, 'message' => 'Only pending payment proofs can be rejected', 'status' => 422, 'payment_status' => $record->payment_status ?? 'unpaid'];
        }

        DB::table($table)->where('id', $id)->update([
            'payment_status' => 'rejected',
            'rejected_by' => Auth::id(),
            'rejected_at' => now(),
            'rejection_reason' => $rejectionReason,
            'cashier_remarks' => $request->input('cashier_remarks'),
            'updated_at' => now(),
        ]);

        WorkflowNotifier::notifyEmail($record->customer_email ?? null, 'Payment rejected', 'Your payment proof was rejected. Please upload a corrected proof.', 'warning', $table, $id);

        return ['success' => true, 'message' => $message, 'payment_status' => 'rejected'];
    }

    private function syncServiceBillingForVerifiedPayment(string $table, int $id, ?int $verifiedBy, ?string $receiptNumber): array
    {
        $serviceType = match ($table) {
            'appointments' => 'veterinary',
            'groomings' => 'grooming',
            'boardings' => 'boarding',
            default => null,
        };

        if (!$serviceType) {
            return [];
        }

        return ServiceBillingService::markBaseServiceAsPaid($serviceType, $id, $verifiedBy, $receiptNumber);
    }

    private function markLinkedServiceAsPaidFromRequest($serviceRequest, int $serviceRequestId, string $receiptNumber): void
    {
        $requestType = $serviceRequest->request_type ?? $serviceRequest->type ?? null;

        $linked = match ($requestType) {
            'vet', 'veterinary' => ['appointments', 'veterinary'],
            'grooming' => ['groomings', 'grooming'],
            'boarding' => ['boardings', 'boarding'],
            default => null,
        };

        if (!$linked) {
            return;
        }

        [$table, $serviceType] = $linked;
        $record = DB::table($table)->where('service_request_id', $serviceRequestId)->lockForUpdate()->first();
        if (!$record) {
            return;
        }

        DB::table($table)->where('id', $record->id)->update([
            'payment_status' => 'paid',
            'paid_at' => now(),
            'verified_by' => Auth::id(),
            'verified_at' => now(),
            'receipt_number' => $receiptNumber,
            'updated_at' => now(),
        ]);

        ServiceBillingService::markBaseServiceAsPaid($serviceType, $record->id, Auth::id(), $receiptNumber);
    }
}
