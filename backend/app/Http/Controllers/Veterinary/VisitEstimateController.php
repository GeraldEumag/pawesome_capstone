<?php

namespace App\Http\Controllers\Veterinary;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\VisitEstimate;
use App\Services\VisitEstimateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class VisitEstimateController extends Controller
{
    public function show(int $appointmentId): JsonResponse
    {
        $estimate = VisitEstimate::where('appointment_id', $appointmentId)->first();

        return response()->json([
            'success' => true,
            'estimate' => VisitEstimateService::serialize($estimate),
        ]);
    }

    public function saveDraft(Request $request, int $appointmentId): JsonResponse
    {
        $appointment = Appointment::findOrFail($appointmentId);

        $validator = Validator::make($request->all(), [
            'lines' => 'required|array|min:1',
            'lines.*.description' => 'required|string|max:255',
            'lines.*.item_type' => 'nullable|string|max:40',
            'lines.*.quantity' => 'nullable|integer|min:1',
            'lines.*.unit_price' => 'required|numeric|min:0',
            'notes' => 'nullable|string|max:2000',
        ]);
        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        try {
            $estimate = VisitEstimateService::saveDraft(
                $appointment,
                $request->input('lines'),
                $request->input('notes'),
                $request->user()->id
            );

            return response()->json(['success' => true, 'estimate' => VisitEstimateService::serialize($estimate)]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function present(Request $request, int $appointmentId): JsonResponse
    {
        $appointment = Appointment::findOrFail($appointmentId);
        try {
            $estimate = VisitEstimateService::present($appointment, $request->user()->id);

            return response()->json(['success' => true, 'estimate' => VisitEstimateService::serialize($estimate)]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * Staff counter approval — the customer is physically present and staff
     * records the approval on their behalf (walk-ins, phone approval, etc).
     */
    public function approveCounter(Request $request, int $appointmentId): JsonResponse
    {
        $appointment = Appointment::findOrFail($appointmentId);
        try {
            $estimate = VisitEstimateService::approve($appointment, 'counter', $request->user(), null);

            return response()->json(['success' => true, 'estimate' => VisitEstimateService::serialize($estimate)]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function reject(Request $request, int $appointmentId): JsonResponse
    {
        $appointment = Appointment::findOrFail($appointmentId);
        try {
            $estimate = VisitEstimateService::reject($appointment, $request->user(), null);

            return response()->json(['success' => true, 'estimate' => VisitEstimateService::serialize($estimate)]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }
}
