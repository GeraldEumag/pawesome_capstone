<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\PaymentReceipt;
use App\Services\PaymentReferenceGuard;
use App\Services\Receipts\ReceiptService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Customer-facing receipt status: polling for the scan result and the manual
 * reference fallback when no reader could extract one.
 */
class ReceiptController extends Controller
{
    /**
     * Latest receipt status for a payable the customer owns.
     * Route: GET /api/customer/receipts/{type}/{id}
     */
    public function status(Request $request, string $type, int $id): JsonResponse
    {
        $receipt = ReceiptService::latestFor($type, $id);
        if (!$receipt || !$this->ownsPayable($receipt)) {
            return response()->json(['message' => 'Receipt not found'], 404);
        }

        $latest = $receipt->extractions()->orderByDesc('id')->first();

        return response()->json([
            'receipt' => [
                'id' => $receipt->id,
                'payable_type' => $receipt->payable_type,
                'payable_id' => $receipt->payable_id,
                'status' => $receipt->status,
                // Customer-facing status label per the spec's upload screen.
                'display_status' => match ($receipt->status) {
                    PaymentReceipt::STATUS_UPLOADED, PaymentReceipt::STATUS_PROCESSING => 'reading',
                    PaymentReceipt::STATUS_READY, PaymentReceipt::STATUS_NEEDS_REVIEW => 'under_review',
                    PaymentReceipt::STATUS_CONFIRMED => 'verified',
                    PaymentReceipt::STATUS_REJECTED => 'rejected',
                    PaymentReceipt::STATUS_FAILED => 'manual_entry',
                    default => 'reading',
                },
                'reject_reason' => $receipt->reject_reason,
                'scanned_reference' => $latest?->reference_normalized,
                'needs_manual_reference' => $this->needsManualReference($receipt, $latest),
            ],
        ]);
    }

    /**
     * Manual reference fallback — only when the scan failed or found no
     * readable reference. Still goes through PaymentReferenceGuard so the
     * typed value is deduped like any typed submission.
     * Route: POST /api/customer/receipts/{id}/reference
     */
    public function submitReference(Request $request, int $id): JsonResponse
    {
        $receipt = PaymentReceipt::find($id);
        if (!$receipt || !$this->ownsPayable($receipt)) {
            return response()->json(['message' => 'Receipt not found'], 404);
        }

        $latest = $receipt->extractions()->orderByDesc('id')->first();
        if (!$this->needsManualReference($receipt, $latest)) {
            return response()->json(['message' => 'A reference was already read from this receipt.'], 422);
        }

        $validated = $request->validate([
            'reference' => 'required|string|min:6|max:255',
        ]);
        $reference = trim($validated['reference']);

        $table = ReceiptService::PAYABLE_TABLES[$receipt->payable_type] ?? null;
        if (!$table) {
            return response()->json(['message' => 'Unsupported payable type.'], 422);
        }

        $guardResult = PaymentReferenceGuard::withUniqueReference(
            $reference,
            [
                'ids' => [$table => [$receipt->payable_id]],
                'settlements' => [['type' => $receipt->payable_type, 'id' => $receipt->payable_id]],
            ],
            fn () => response()->json(['message' => 'This payment reference has already been submitted. Check the number or contact the cashier.'], 422),
            function () use ($receipt, $table, $reference) {
                $updates = ['payment_reference' => $reference];
                if (Schema::hasColumn($table, 'updated_at')) {
                    $updates['updated_at'] = now();
                }
                DB::table($table)->where('id', $receipt->payable_id)
                    ->where('payment_status', '!=', 'paid')
                    ->update($updates);

                $receipt->update([
                    'submitted_reference' => $reference,
                    'status' => PaymentReceipt::STATUS_NEEDS_REVIEW,
                ]);
            }
        );
        if ($guardResult instanceof JsonResponse) {
            return $guardResult;
        }

        return response()->json(['message' => 'Reference submitted — the cashier will verify it with your receipt.']);
    }

    /**
     * A manual reference is needed when the scan failed, the receipt isn't a
     * recognized provider, or no reference was extracted.
     */
    private function needsManualReference(PaymentReceipt $receipt, $latest): bool
    {
        if ($receipt->status === PaymentReceipt::STATUS_FAILED) {
            return true;
        }

        return $latest === null || !$latest->reference_normalized;
    }

    /**
     * The customer must own the payable the receipt is attached to. The
     * customer_id domain differs per table (users.id vs customers.id) — reuse
     * the same resolution SecureFileController relies on.
     */
    private function ownsPayable(PaymentReceipt $receipt): bool
    {
        $user = Auth::user();
        if (!$user) {
            return false;
        }

        $table = ReceiptService::PAYABLE_TABLES[$receipt->payable_type] ?? null;
        if (!$table) {
            return false;
        }

        $record = DB::table($table)->where('id', $receipt->payable_id)->first();
        if (!$record) {
            return false;
        }

        if (($record->customer_email ?? null) === $user->email) {
            return true;
        }
        if ((int) ($record->customer_id ?? 0) === (int) $user->id) {
            return true;
        }

        $customerId = Customer::where('user_id', $user->id)
            ->orWhere('email', $user->email)
            ->value('id');

        return $customerId !== null && (int) ($record->customer_id ?? 0) === (int) $customerId;
    }
}
