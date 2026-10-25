<?php

namespace App\Http\Controllers\Cashier;

use App\Http\Controllers\Controller;
use App\Models\PaymentReceipt;
use App\Services\Receipts\ReceiptConfirmationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Cashier actions on scanned receipts: view extraction + validations,
 * confirm (inside the payment-verification transaction), reject, re-read.
 */
class ReceiptController extends Controller
{
    public function show(int $id): JsonResponse
    {
        $receipt = PaymentReceipt::with(['extractions' => fn ($q) => $q->orderByDesc('id'), 'validations'])->find($id);
        if (!$receipt) {
            return response()->json(['message' => 'Receipt not found'], 404);
        }

        \App\Models\ActivityLog::log(\Illuminate\Support\Facades\Auth::id(), 'receipt_viewed', "Receipt #{$receipt->id} viewed", [
            'category' => 'payment',
            'reference_type' => 'payment_receipt',
            'reference_id' => $receipt->id,
        ]);

        $latest = $receipt->extractions->first();

        return response()->json([
            'receipt' => [
                'id' => $receipt->id,
                'status' => $receipt->status,
                'provider' => $receipt->provider,
                'payable_type' => $receipt->payable_type,
                'payable_id' => $receipt->payable_id,
                'submitted_reference' => $receipt->submitted_reference,
                'proof_url' => $this->proofUrl($receipt),
                'created_at' => $receipt->created_at,
            ],
            'extraction' => $latest ? [
                'reader' => $latest->reader,
                'reader_version' => $latest->reader_version,
                'provider' => $latest->provider,
                'transaction_type' => $latest->transaction_type,
                'reference_raw' => $latest->reference_raw,
                'reference_normalized' => $latest->reference_normalized,
                'amount' => $latest->amount !== null ? (float) $latest->amount : null,
                'paid_at' => $latest->paid_at,
                'status_text' => $latest->status_text,
                'recipient_name' => $latest->recipient_name,
                'recipient_last4' => $latest->recipient_last4,
                'image_quality' => $latest->image_quality,
                'confidence' => $latest->confidence_json,
                'latency_ms' => $latest->latency_ms,
            ] : null,
            'validations' => $receipt->validations->map(fn ($v) => [
                'rule' => $v->rule,
                'result' => $v->result,
                'detail' => $v->detail,
            ])->values(),
        ]);
    }

    public function confirm(Request $request, int $id): JsonResponse
    {
        $receipt = PaymentReceipt::find($id);
        if (!$receipt) {
            return response()->json(['message' => 'Receipt not found'], 404);
        }

        $result = app(ReceiptConfirmationService::class)->confirm($receipt, $request);

        \App\Models\ActivityLog::log(\Illuminate\Support\Facades\Auth::id(), 'receipt_confirm_attempted', "Receipt #{$receipt->id} confirm " . (($result['success'] ?? false) ? 'succeeded' : 'failed'), [
            'category' => 'payment',
            'reference_type' => 'payment_receipt',
            'reference_id' => $receipt->id,
            'metadata' => ['success' => (bool) ($result['success'] ?? false)],
        ]);

        return response()->json($result, $result['status'] ?? 200);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $receipt = PaymentReceipt::find($id);
        if (!$receipt) {
            return response()->json(['message' => 'Receipt not found'], 404);
        }

        $result = app(ReceiptConfirmationService::class)->reject($receipt, $request);

        \App\Models\ActivityLog::log(\Illuminate\Support\Facades\Auth::id(), 'receipt_reject_attempted', "Receipt #{$receipt->id} reject " . (($result['success'] ?? false) ? 'succeeded' : 'failed'), [
            'category' => 'payment',
            'reference_type' => 'payment_receipt',
            'reference_id' => $receipt->id,
            'metadata' => ['success' => (bool) ($result['success'] ?? false)],
        ]);

        return response()->json($result, $result['status'] ?? 200);
    }

    public function reread(int $id): JsonResponse
    {
        $receipt = PaymentReceipt::find($id);
        if (!$receipt) {
            return response()->json(['message' => 'Receipt not found'], 404);
        }

        $result = app(ReceiptConfirmationService::class)->reread($receipt);

        \App\Models\ActivityLog::log(\Illuminate\Support\Facades\Auth::id(), 'receipt_reread', "Receipt #{$receipt->id} re-read queued", [
            'category' => 'payment',
            'reference_type' => 'payment_receipt',
            'reference_id' => $receipt->id,
        ]);

        return response()->json($result, $result['status'] ?? 200);
    }

    private function proofUrl(PaymentReceipt $receipt): string
    {
        // Each receipt serves its own uploaded file, not the payable's latest proof.
        return url("/api/files/payment-receipts/{$receipt->id}/view");
    }
}
