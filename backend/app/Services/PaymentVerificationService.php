<?php

namespace App\Services;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Services\WorkflowNotifier;

class PaymentVerificationService
{
    /**
     * Verify a payment (service_request or customer_order)
     * Returns array with standardized keys: success, message, payment_status, receipt_number
     */
    public function verify(string $type, int $id, $request)
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
                $sr = DB::table('service_requests')->where('id', $id)->first();
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

                return ['success' => true, 'message' => 'Service request payment verified successfully.', 'payment_status' => 'paid', 'receipt_number' => $receiptNumber];
            }

            // default: customer_order
            $order = DB::table('customer_orders')->where('id', $id)->first();
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

        } catch (\Throwable $e) {
            Log::error('PaymentVerificationService::verify error - ' . $e->getMessage());
            return ['success' => false, 'message' => $e->getMessage(), 'status' => 500];
        }
    }

    public function reject(string $type, int $id, $request)
    {
        try {
            if ($type === 'boarding') {
                return $this->rejectTablePayment('boardings', $id, $request, 'Boarding payment rejected');
            }

            if ($type === 'appointment' || $type === 'veterinary') {
                return $this->rejectTablePayment('appointments', $id, $request, 'Veterinary payment rejected');
            }

            if ($type === 'grooming') {
                return $this->rejectTablePayment('groomings', $id, $request, 'Grooming payment rejected');
            }

            if ($type === 'medical_confinement' || $type === 'confinement') {
                return $this->rejectTablePayment('medical_confinements', $id, $request, 'Medical confinement payment rejected');
            }

            if ($type === 'service_request' || $type === 'service') {
                $sr = DB::table('service_requests')->where('id', $id)->first();
                if (!$sr) return ['success' => false, 'message' => 'Service request not found', 'status' => 404];
                if (($sr->payment_status ?? 'unpaid') !== 'pending') {
                    return ['success' => false, 'message' => 'Only pending payment proofs can be rejected', 'status' => 422, 'payment_status' => $sr->payment_status];
                }

                DB::table('service_requests')->where('id', $id)->update([
                    'payment_status' => 'rejected',
                    'rejected_by' => Auth::id(),
                    'rejected_at' => now(),
                    'rejection_reason' => $request->input('rejection_reason'),
                ]);

                return ['success' => true, 'message' => 'Service request payment rejected', 'payment_status' => 'rejected'];
            }

            $order = DB::table('customer_orders')->where('id', $id)->first();
            if (!$order) return ['success' => false, 'message' => 'Order not found', 'status' => 404];
            if ((($order->payment_status) ?? 'unpaid') !== 'pending') {
                return ['success' => false, 'message' => 'Only pending payment proofs can be rejected', 'status' => 422, 'payment_status' => $order->payment_status ?? 'unpaid'];
            }

            DB::table('customer_orders')->where('id', $id)->update([
                'payment_status' => 'rejected',
                'rejected_by' => Auth::id(),
                'rejected_at' => now(),
                'rejection_reason' => $request->input('rejection_reason'),
            ]);

            return ['success' => true, 'message' => 'Payment rejected', 'payment_status' => 'rejected'];

        } catch (\Throwable $e) {
            Log::error('PaymentVerificationService::reject error - ' . $e->getMessage());
            return ['success' => false, 'message' => $e->getMessage(), 'status' => 500];
        }
    }

    private function verifyTablePayment(string $table, string $prefix, int $id, $request, string $message, ?string $referenceNumber = null): array
    {
        $record = DB::table($table)->where('id', $id)->first();
        if (!$record) {
            return ['success' => false, 'message' => 'Payment record not found', 'status' => 404];
        }

        $allowedStatuses = $table === 'appointments' ? ['pending', 'unpaid'] : ['pending'];
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

        if ($table === 'appointments') {
            $updateData['status'] = 'completed';
        }

        if ($referenceNumber) {
            $updateData['reference_number'] = $referenceNumber;
        }

        DB::table($table)->where('id', $id)->update($updateData);

        $this->syncServiceBillingForVerifiedPayment($table, $id, Auth::id(), $receiptNumber);

        WorkflowNotifier::notifyEmail($record->customer_email ?? null, 'Payment verified', 'Your payment proof was verified by cashier.', 'success', $table, $id);

        return ['success' => true, 'message' => $message, 'payment_status' => 'paid', 'receipt_number' => $receiptNumber];
    }

    private function rejectTablePayment(string $table, int $id, $request, string $message): array
    {
        $record = DB::table($table)->where('id', $id)->first();
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
            'rejection_reason' => $request->input('rejection_reason'),
            'cashier_remarks' => $request->input('cashier_remarks'),
            'updated_at' => now(),
        ]);

        WorkflowNotifier::notifyEmail($record->customer_email ?? null, 'Payment rejected', 'Your payment proof was rejected. Please upload a corrected proof.', 'warning', $table, $id);

        return ['success' => true, 'message' => $message, 'payment_status' => 'rejected'];
    }

    private function syncServiceBillingForVerifiedPayment(string $table, int $id, ?int $verifiedBy, ?string $receiptNumber): void
    {
        $serviceType = match ($table) {
            'appointments' => 'veterinary',
            'groomings' => 'grooming',
            'boardings' => 'boarding',
            default => null,
        };

        if (!$serviceType) {
            return;
        }

        ServiceBillingService::markBaseServiceAsPaid($serviceType, $id, $verifiedBy, $receiptNumber);
    }
}
