<?php

namespace App\Http\Controllers\Veterinary;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\MedicalConfinement;
use App\Models\ServiceItemUsage;
use App\Services\ServiceBillingService;
use App\Services\WorkflowNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ConsultationWorkflowController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Appointment::with(['customer', 'pet', 'service', 'veterinarian', 'medicalConfinements']);

        if ($request->user()?->role === 'veterinary') {
            $query->where(function ($q) use ($request) {
                $q->whereNull('veterinarian_id')->orWhere('veterinarian_id', $request->user()->id);
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json(['consultations' => $query->latest('scheduled_at')->get()]);
    }

    public function scheduled(Request $request): JsonResponse
    {
        $consultations = Appointment::with(['customer', 'pet', 'service', 'veterinarian'])
            ->whereIn('status', ['approved', 'scheduled'])
            ->where(function ($q) use ($request) {
                $q->whereNull('veterinarian_id')->orWhere('veterinarian_id', $request->user()->id);
            })
            ->orderBy('scheduled_at')
            ->get();

        return response()->json(['consultations' => $consultations]);
    }

    public function start(Request $request, $id): JsonResponse
    {
        $appointment = Appointment::with(['customer', 'pet'])->findOrFail($id);

        if (!in_array($appointment->status, ['approved', 'scheduled', 'in_progress'], true)) {
            return response()->json(['error' => 'Only scheduled consultations can be started'], 422);
        }

        if ($appointment->veterinarian_id && (int) $appointment->veterinarian_id !== (int) $request->user()->id) {
            return response()->json(['error' => 'This consultation is assigned to another veterinarian'], 403);
        }

        $appointment->update([
            'status' => 'in_consultation',
            'veterinarian_id' => $appointment->veterinarian_id ?: $request->user()->id,
            'started_at' => now(),
        ]);

        WorkflowNotifier::notifyUser($appointment->customer?->user_id, 'Consultation started', 'Your pet consultation has started.', 'info', 'appointment', $appointment->id);

        return response()->json(['message' => 'Consultation started', 'consultation' => $appointment->fresh(['customer', 'pet', 'service', 'veterinarian'])]);
    }

    public function complete(Request $request, $id): JsonResponse
    {
        $appointment = Appointment::with(['customer', 'pet'])->findOrFail($id);

        if (!in_array($appointment->status, ['in_consultation', 'in_progress', 'treated'], true)) {
            return response()->json(['error' => 'Only active consultations can be completed'], 422);
        }

        if ($appointment->veterinarian_id && (int) $appointment->veterinarian_id !== (int) $request->user()->id) {
            return response()->json(['error' => 'This consultation is assigned to another veterinarian'], 403);
        }

        $validator = Validator::make($request->all(), [
            'diagnosis' => 'nullable|string',
            'treatment_notes' => 'nullable|string',
            'prescription' => 'nullable|string',
            'vet_remarks' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Sync billing totals so cashier sees an accurate bill
        $billSummary = ServiceBillingService::finalizeServiceBill(ServiceItemUsage::SERVICE_VETERINARY, (int) $appointment->id);

        $appointment->update([
            'status' => 'awaiting_payment',
            'diagnosis' => $request->diagnosis,
            'treatment_notes' => $request->treatment_notes,
            'prescription' => $request->prescription,
            'vet_remarks' => $request->vet_remarks,
            'completed_at' => now(),
        ]);

        WorkflowNotifier::notifyUser($appointment->customer?->user_id, 'Consultation finalized', 'Your pet consultation has been finalized and is awaiting payment.', 'info', 'appointment', $appointment->id);
        WorkflowNotifier::notifyRole('cashier', 'Vet consultation awaiting payment', "Pet {$appointment->pet?->name} consultation is ready for billing.", 'info', 'appointment', $appointment->id);

        return response()->json([
            'message' => 'Consultation finalized. Awaiting payment at cashier.',
            'consultation' => $appointment->fresh(['customer', 'pet', 'service', 'veterinarian']),
            'billing' => $billSummary,
        ]);
    }

    public function recommendConfinement(Request $request, $id): JsonResponse
    {
        $appointment = Appointment::with(['customer', 'pet'])->findOrFail($id);

        if (!in_array($appointment->status, ['in_consultation', 'in_progress', 'treated'], true)) {
            return response()->json(['error' => 'Confinement can only be recommended during or after active consultation'], 422);
        }

        if ($appointment->veterinarian_id && (int) $appointment->veterinarian_id !== (int) $request->user()->id) {
            return response()->json(['error' => 'This consultation is assigned to another veterinarian'], 403);
        }

        $validator = Validator::make($request->all(), [
            'diagnosis' => 'required|string',
            'reason_for_confinement' => 'required|string',
            'urgency_level' => 'required|in:low,normal,urgent,critical',
            'expected_stay_days' => 'nullable|integer|min:1|max:365',
            'treatment_plan' => 'nullable|string',
            'medication_plan' => 'nullable|string',
            'observation_instructions' => 'nullable|string',
            'special_care_instructions' => 'nullable|string',
            'estimated_cost' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $confinement = MedicalConfinement::create([
            'consultation_id' => $appointment->id,
            'customer_id' => $appointment->customer_id,
            'customer_email' => $appointment->customer?->email,
            'customer_name' => $appointment->customer?->name,
            'pet_id' => $appointment->pet_id,
            'pet_name' => $appointment->pet?->name,
            'vet_id' => $request->user()->id,
            'diagnosis' => $request->diagnosis,
            'reason_for_confinement' => $request->reason_for_confinement,
            'urgency_level' => $request->urgency_level,
            'expected_stay_days' => $request->expected_stay_days,
            'treatment_plan' => $request->treatment_plan,
            'medication_plan' => $request->medication_plan,
            'observation_instructions' => $request->observation_instructions,
            'special_care_instructions' => $request->special_care_instructions,
            'estimated_cost' => $request->estimated_cost,
            'status' => 'recommended',
            'payment_status' => 'unpaid',
        ]);

        $appointment->update([
            'status' => 'needs_confinement',
            'veterinarian_id' => $request->user()->id,
            'diagnosis' => $request->diagnosis,
            'treatment_notes' => $request->treatment_plan,
            'prescription' => $request->medication_plan,
            'vet_remarks' => $request->reason_for_confinement,
        ]);

        WorkflowNotifier::notifyRole('receptionist', 'Medical confinement recommended', "{$confinement->pet_name} needs medical confinement admission.", 'warning', 'medical_confinement', $confinement->id);
        WorkflowNotifier::notifyUser($appointment->customer?->user_id, 'Medical confinement recommended', 'The veterinarian recommended medical observation for your pet.', 'warning', 'medical_confinement', $confinement->id);

        return response()->json([
            'message' => 'Medical confinement recommended',
            'medical_confinement' => $confinement->load(['consultation', 'customer', 'pet', 'veterinarian']),
        ], 201);
    }
}
