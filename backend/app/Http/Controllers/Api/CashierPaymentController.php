<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;
use App\Services\PaymentVerificationService;

class CashierPaymentController extends Controller
{
    public function index()
    {
        // Get store order payments
        $storePayments = Payment::with(['customer', 'boarding.pet', 'boarding.hotelRoom'])
            ->latest()
            ->get()
            ->map(function ($payment) {
                return [
                    'id' => $payment->id,
                    'type' => 'store_order',
                    'customer_name' => $payment->customer?->name ?? 'Unknown',
                    'customer_email' => $payment->customer?->email ?? '',
                    'amount' => $payment->amount,
                    'payment_status' => $payment->status === 'verified' ? 'paid' : $payment->status,
                    'payment_method' => $payment->payment_method,
                    'payment_reference' => $payment->payment_reference,
                    'payment_proof' => $payment->payment_proof,
                    'proof_url' => $payment->payment_proof ? asset('storage/' . $payment->payment_proof) : null,
                    'created_at' => $payment->created_at,
                    'boarding_info' => $payment->boarding ? [
                        'pet_name' => $payment->boarding->pet?->name,
                        'service_type' => 'boarding',
                    ] : null,
                ];
            });

        // Get service request payments
        $servicePayments = ServiceRequest::where('payment_status', 'pending')
            ->where(function ($q) {
                $q->whereNotNull('payment_proof')
                  ->orWhere('payment_method', 'cash');
            })
            ->latest()
            ->get()
            ->map(function ($request) {
                return [
                    'id' => $request->id,
                    'type' => 'service_request',
                    'customer_name' => $request->customer_name,
                    'customer_email' => $request->customer_email,
                    'pet_name' => $request->pet_name,
                    'service_type' => $request->request_type ?? $request->service_type,
                    'service_name' => $request->service_name,
                    'amount' => $request->total_amount ?? $request->price ?? $request->service_price ?? 500,
                    'payment_status' => $request->payment_status,
                    'payment_method' => $request->payment_method,
                    'payment_reference' => $request->payment_reference,
                    'payment_proof' => $request->payment_proof,
                    'proof_url' => $request->payment_proof ? url('/api/files/payment-proofs/service-request/' . $request->id . '/view') : null,
                    'created_at' => $request->created_at,
                ];
            });

        // Combine both types
        $allPayments = $storePayments->concat($servicePayments);

        return response()->json([
            'success' => true,
            'payments' => $allPayments,
        ]);
    }

    public function verify(Request $request, $id, $type)
    {
        $svc = new PaymentVerificationService();
        $result = $svc->verify($type, (int) $id, $request);

        $status = $result['status'] ?? 200;
        return response()->json($result, $status);
    }

    private function verifyServiceRequest(Request $request, $id)
    {
        $serviceRequest = ServiceRequest::findOrFail($id);
        
        $serviceRequest->update([
            'payment_status' => 'paid',
            'verified_by' => auth()->id(),
            'verified_at' => now(),
            'cashier_remarks' => $request->input('cashier_remarks', 'Payment verified by cashier'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Service request payment verified successfully',
            'payment' => $serviceRequest,
        ]);
    }

    private function verifyStoreOrder(Request $request, $id)
    {
        $payment = Payment::findOrFail($id);
        
        $payment->update([
            'status' => 'verified',
            'verified_at' => now(),
            'verified_by' => auth()->id(),
        ]);

        if ($payment->boarding) {
            $boarding = $payment->boarding;

            $totalPaid = $boarding->payments()
                ->where('status', 'verified')
                ->sum('amount');

            $paymentStatus = $totalPaid >= $boarding->total_amount
                ? 'paid'
                : 'partial';

            $boarding->update([
                'amount_paid' => $totalPaid,
                'payment_status' => $paymentStatus,
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Store order payment verified successfully',
            'payment' => $payment,
        ]);
    }

    public function reject(Request $request, $id, $type)
    {
        $svc = new PaymentVerificationService();
        $result = $svc->reject($type, (int) $id, $request);
        $status = $result['status'] ?? 200;
        return response()->json($result, $status);
    }

    private function rejectServiceRequest(Request $request, $id)
    {
        $serviceRequest = ServiceRequest::findOrFail($id);
        
        $serviceRequest->update([
            'payment_status' => 'rejected',
            'rejection_reason' => $request->input('rejection_reason', 'Payment rejected by cashier'),
            'rejected_by' => auth()->id(),
            'rejected_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Service request payment rejected',
            'payment' => $serviceRequest,
        ]);
    }

    private function rejectStoreOrder(Request $request, $id)
    {
        $payment = Payment::findOrFail($id);
        
        $payment->update([
            'status' => 'rejected',
            'rejected_by' => auth()->id(),
            'rejected_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Store order payment rejected',
            'payment' => $payment,
        ]);
    }
}
