<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Customer;
use App\Models\PaymentSettlement;
use App\Models\ServiceBillingPaymentRequest;
use App\Services\EmailDeliveryService;
use App\Services\FileStorageService;
use App\Services\ServiceBillingPaymentService;
use App\Services\WorkflowNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class VeterinaryBillingController extends Controller
{
    private function currentCustomer(): ?Customer
    {
        $user = Auth::user();
        if (!$user) {
            return null;
        }

        return Customer::where('user_id', $user->id)
            ->orWhere('email', $user->email)
            ->first();
    }

    public function index(): JsonResponse
    {
        $customer = $this->currentCustomer();
        if (!$customer) {
            return response()->json(['success' => false, 'message' => 'Customer profile not found.'], 404);
        }

        return response()->json([
            'success' => true,
            'invoices' => ServiceBillingPaymentService::invoicesForCustomer($customer),
        ]);
    }

    public function requestCashierPayment(Request $request, int $appointmentId): JsonResponse
    {
        $customer = $this->currentCustomer();
        if (!$customer) {
            return response()->json(['success' => false, 'message' => 'Customer profile not found.'], 404);
        }

        $appointment = Appointment::where('customer_id', $customer->id)->find($appointmentId);
        if (!$appointment) {
            return response()->json(['success' => false, 'message' => 'Invoice not found.'], 404);
        }

        $paymentRequest = ServiceBillingPaymentService::createCashierRequest(
            $appointment,
            $customer,
            $request->user()
        );
        $this->notifyPaymentRequest($paymentRequest, $customer);

        return response()->json([
            'success' => true,
            'message' => 'Your full balance is now waiting for payment at the cashier.',
            'payment_request' => $this->paymentRequestSummary($paymentRequest),
        ], 201);
    }

    public function submitOnlinePayment(Request $request, int $appointmentId): JsonResponse
    {
        $customer = $this->currentCustomer();
        if (!$customer) {
            return response()->json(['success' => false, 'message' => 'Customer profile not found.'], 404);
        }

        $validated = $request->validate([
            'payment_method' => 'required|in:gcash,maya',
            'payment_reference' => 'required|string|min:6|max:255',
            'payment_proof' => 'required|file|mimes:jpg,jpeg,png,pdf|max:5120',
        ]);

        $appointment = Appointment::where('customer_id', $customer->id)->find($appointmentId);
        if (!$appointment) {
            return response()->json(['success' => false, 'message' => 'Invoice not found.'], 404);
        }

        $paymentRequest = FileStorageService::storeAndPersist(
            $request->file('payment_proof'),
            'payment-proofs/service-billing',
            'private',
            fn (string $path) => ServiceBillingPaymentService::createOnlineRequest(
                $appointment,
                $customer,
                $request->user(),
                $validated['payment_method'],
                $validated['payment_reference'],
                $path
            ),
            prefix: 'billing-proof'
        );
        $this->notifyPaymentRequest($paymentRequest, $customer);

        return response()->json([
            'success' => true,
            'message' => 'Online payment proof submitted. The cashier will verify it shortly.',
            'payment_request' => $this->paymentRequestSummary($paymentRequest),
        ], 201);
    }

    public function receipt(Request $request, int $paymentRequestId): JsonResponse
    {
        $customer = $this->currentCustomer();
        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found.'], 404);
        }

        $paymentRequest = ServiceBillingPaymentRequest::with(['items', 'appointment.service', 'appointment.pet', 'verifier'])
            ->where('customer_id', $customer->id)
            ->findOrFail($paymentRequestId);
        if ($paymentRequest->status !== ServiceBillingPaymentRequest::STATUS_PAID) {
            return response()->json(['message' => 'Receipt is available after payment is verified.'], 422);
        }

        $settlement = PaymentSettlement::with('items')
            ->where('settleable_type', 'service_billing_payment')
            ->where('settleable_id', $paymentRequest->id)
            ->where('receipt_number', $paymentRequest->receipt_number)
            ->first();

        return response()->json([
            'success' => true,
            'receipt' => [
                'receipt_number' => $paymentRequest->receipt_number,
                'customer_name' => $customer->name,
                'customer_email' => $customer->email,
                'total_amount' => (float) $paymentRequest->amount_due,
                'payment_method' => $paymentRequest->payment_method,
                'payment_reference' => $paymentRequest->payment_reference,
                'paid_at' => $paymentRequest->paid_at,
                'verified_by' => $paymentRequest->verifier?->name,
                'service_name' => $paymentRequest->appointment?->service?->name ?? 'Veterinary service billing',
                'pet_name' => $paymentRequest->appointment?->pet?->name,
                'items' => $settlement?->items?->map(fn ($item) => [
                    'product_name' => $item->description,
                    'quantity' => (int) $item->quantity,
                    'price' => (float) $item->unit_price,
                    'subtotal' => (float) $item->total_price,
                ])->all() ?? [],
            ],
        ]);
    }

    private function paymentRequestSummary(ServiceBillingPaymentRequest $paymentRequest): array
    {
        return [
            'id' => $paymentRequest->id,
            'appointment_id' => $paymentRequest->appointment_id,
            'amount_due' => (float) $paymentRequest->amount_due,
            'payment_channel' => $paymentRequest->payment_channel,
            'payment_method' => $paymentRequest->payment_method,
            'payment_reference' => $paymentRequest->payment_reference,
            'status' => $paymentRequest->status,
            'proof_url' => $paymentRequest->payment_proof
                ? url('/api/files/payment-proofs/service-billing-payment/' . $paymentRequest->id . '/view')
                : null,
        ];
    }

    private function notifyPaymentRequest(ServiceBillingPaymentRequest $paymentRequest, Customer $customer): void
    {
        $channelLabel = $paymentRequest->payment_channel === 'online' ? ucfirst($paymentRequest->payment_method) : 'cashier';
        $message = sprintf(
            'A veterinary bill for ₱%s was submitted for %s payment.',
            number_format((float) $paymentRequest->amount_due, 2),
            $channelLabel
        );

        WorkflowNotifier::notifyRole(
            'cashier',
            $paymentRequest->payment_channel === 'online' ? 'Veterinary payment proof submitted' : 'Veterinary bill awaiting cashier collection',
            $message,
            'info',
            'payment',
            $paymentRequest->id,
            ['customer_id' => $customer->id, 'payment_channel' => $paymentRequest->payment_channel, 'payment_type' => 'service_billing_payment']
        );

        if ($customer->user_id) {
            WorkflowNotifier::notifyUser(
                $customer->user_id,
                'Veterinary bill payment status updated',
                $message,
                'info',
                'payment',
                $paymentRequest->id
            );
        }

        if ($customer->email) {
            app(EmailDeliveryService::class)->lifecycle(
                $customer->email,
                'Veterinary bill payment status updated',
                $message,
                'info',
                [
                    'event_key' => 'billing.payment_request_created',
                    'occurrence_key' => 'billing.payment_request_created:' . $paymentRequest->id,
                    'source_type' => 'service_billing_payment',
                    'source_id' => $paymentRequest->id,
                    'user_id' => $customer->user_id,
                ]
            );
        }
    }
}
