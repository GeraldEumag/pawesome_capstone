<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\VisitInvoiceAdjustment;
use App\Services\VisitInvoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Visit invoice endpoints shared by cashier (view + adjustment requests)
 * and manager/admin (adjustment approval + pending queue).
 */
class VisitInvoiceController extends Controller
{
    /**
     * Invoice detail for an appointment — lines, adjustments, settlements.
     */
    public function show(int $appointmentId): JsonResponse
    {
        $appointment = Appointment::findOrFail($appointmentId);
        $detail = VisitInvoiceService::detail($appointment);

        return response()->json(['success' => true, 'invoice' => $detail]);
    }

    public function requestAdjustment(Request $request, int $appointmentId): JsonResponse
    {
        $appointment = Appointment::findOrFail($appointmentId);

        $validator = Validator::make($request->all(), [
            'type' => 'required|in:discount,waiver,write_off,credit_note',
            'amount' => 'required|numeric|min:0.01',
            'reason_code' => 'required|in:' . implode(',', VisitInvoiceAdjustment::REASON_CODES),
            'notes' => 'nullable|string|max:2000',
            'expected_version_hash' => 'nullable|string|max:64',
        ]);
        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        try {
            $validated = $validator->validated();
            $adjustment = VisitInvoiceService::requestAdjustment(
                $appointment,
                $validated,
                $request->user()->id,
                $validated['expected_version_hash'] ?? null
            );

            return response()->json([
                'success' => true,
                'adjustment' => $adjustment,
                'requires_approval' => $adjustment->status === VisitInvoiceAdjustment::STATUS_PENDING,
                'invoice' => VisitInvoiceService::detail($appointment),
            ], 201);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function pending(): JsonResponse
    {
        $adjustments = VisitInvoiceAdjustment::with(['invoice', 'requestedBy:id,name'])
            ->where('status', VisitInvoiceAdjustment::STATUS_PENDING)
            ->orderBy('created_at')
            ->get()
            ->map(fn ($a) => [
                'id' => $a->id,
                'invoice_id' => $a->visit_invoice_id,
                'invoice_number' => $a->invoice?->invoice_number,
                'type' => $a->type,
                'amount' => (float) $a->amount,
                'reason_code' => $a->reason_code,
                'notes' => $a->notes,
                'requested_by' => $a->requestedBy?->name,
                'created_at' => $a->created_at,
            ]);

        return response()->json(['success' => true, 'adjustments' => $adjustments]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $adjustment = VisitInvoiceAdjustment::findOrFail($id);
        try {
            $adjustment = VisitInvoiceService::approveAdjustment($adjustment, $request->user()->id);

            return response()->json(['success' => true, 'adjustment' => $adjustment]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $adjustment = VisitInvoiceAdjustment::findOrFail($id);
        try {
            $adjustment = VisitInvoiceService::rejectAdjustment(
                $adjustment,
                $request->user()->id,
                $request->input('reason')
            );

            return response()->json(['success' => true, 'adjustment' => $adjustment]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }
}
