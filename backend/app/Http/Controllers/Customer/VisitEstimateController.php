<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Customer;
use App\Models\VisitEstimate;
use App\Services\VisitEstimateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Customer-portal estimate review: the owner sees the presented estimate for
 * their own visit and approves or rejects it.
 */
class VisitEstimateController extends Controller
{
    /**
     * Estimates awaiting the customer's decision across their appointments.
     */
    public function pending(Request $request): JsonResponse
    {
        $customerId = Customer::where('user_id', $request->user()->id)->value('id');
        if (!$customerId) {
            return response()->json(['success' => true, 'estimates' => []]);
        }

        $estimates = VisitEstimate::whereIn('status', [
                VisitEstimate::STATUS_PRESENTED,
                VisitEstimate::STATUS_CHANGES_REQUESTED,
            ])
            ->whereHas('appointment', fn ($q) => $q->where('customer_id', $customerId))
            ->orderByDesc('presented_at')
            ->get()
            ->map(fn ($e) => VisitEstimateService::serialize($e))
            ->values();

        return response()->json(['success' => true, 'estimates' => $estimates]);
    }

    public function show(Request $request, int $appointmentId): JsonResponse
    {
        $appointment = $this->ownedAppointment($request, $appointmentId);
        if (!$appointment) {
            return response()->json(['success' => false, 'message' => 'Appointment not found'], 404);
        }

        $estimate = VisitEstimate::where('appointment_id', $appointment->id)->first();

        return response()->json([
            'success' => true,
            'estimate' => VisitEstimateService::serialize($estimate),
        ]);
    }

    public function approve(Request $request, int $appointmentId): JsonResponse
    {
        $appointment = $this->ownedAppointment($request, $appointmentId);
        if (!$appointment) {
            return response()->json(['success' => false, 'message' => 'Appointment not found'], 404);
        }

        try {
            $estimate = VisitEstimateService::approve(
                $appointment,
                'portal',
                $request->user(),
                $appointment->customer
            );

            return response()->json(['success' => true, 'estimate' => VisitEstimateService::serialize($estimate)]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function reject(Request $request, int $appointmentId): JsonResponse
    {
        $appointment = $this->ownedAppointment($request, $appointmentId);
        if (!$appointment) {
            return response()->json(['success' => false, 'message' => 'Appointment not found'], 404);
        }

        try {
            $estimate = VisitEstimateService::reject($appointment, $request->user(), $appointment->customer);

            return response()->json(['success' => true, 'estimate' => VisitEstimateService::serialize($estimate)]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    private function ownedAppointment(Request $request, int $appointmentId): ?Appointment
    {
        $customerId = Customer::where('user_id', $request->user()->id)->value('id');

        return Appointment::where('id', $appointmentId)
            ->where('customer_id', $customerId ?? -1)
            ->first();
    }
}
