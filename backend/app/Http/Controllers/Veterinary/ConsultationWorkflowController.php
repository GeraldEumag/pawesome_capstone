<?php

namespace App\Http\Controllers\Veterinary;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\MedicalConfinement;
use App\Models\MedicalRecord;
use App\Models\ServiceItemUsage;
use App\Services\ServiceBillingService;
use App\Services\VisitCompletionService;
use App\Services\VisitStartService;
use App\Services\WorkflowNotifier;
use App\Support\VeterinaryStatus;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            ->where('status', Appointment::STATUS_SCHEDULED)
            ->where(function ($q) use ($request) {
                $q->whereNull('veterinarian_id')->orWhere('veterinarian_id', $request->user()->id);
            })
            ->orderBy('scheduled_at')
            ->get();

        return response()->json(['consultations' => $consultations]);
    }

    public function start(Request $request, $id): JsonResponse
    {
        $result = VisitStartService::start((int) $id, $request->user());
        $appointment = $result['appointment'];

        if ($result['started']) {
            WorkflowNotifier::notifyUser($appointment->customer?->user_id, 'Consultation started', 'Your pet consultation has started.', 'info', 'appointment', $appointment->id);
        }

        return response()->json([
            'message' => 'Consultation started',
            'consultation' => $appointment,
            'medical_record' => $result['record'],
        ]);
    }

    public function complete(Request $request, $id): JsonResponse
    {
        $appointment = Appointment::with(['customer', 'pet'])->findOrFail($id);

        if (!in_array($appointment->status, VeterinaryStatus::STARTED, true)) {
            return response()->json(['error' => 'Only active consultations can be completed'], 422);
        }

        if ($appointment->veterinarian_id
            && (int) $appointment->veterinarian_id !== (int) $request->user()->id
            && !$request->user()->hasRoleAccess('admin')) {
            return response()->json(['error' => 'This consultation is assigned to another veterinarian'], 403);
        }

        $validator = Validator::make($request->all(), [
            'diagnosis' => 'nullable|string',
            'treatment_notes' => 'nullable|string',
            'prescription' => 'nullable|string',
            'vet_remarks' => 'nullable|string',
            'outcome' => 'nullable|in:' . implode(',', Appointment::OUTCOMES),
            'follow_up_required' => 'nullable|boolean',
            'follow_up_due' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if (!$appointment->medicalRecords()->where('status', MedicalRecord::STATUS_FINALIZED)->exists()) {
            return response()->json([
                'error' => 'Save and finalize the medical record before completing this consultation',
            ], 422);
        }

        $outcome = DB::transaction(function () use ($appointment, $request) {
            // Sync billing totals so cashier sees an accurate bill
            $summary = ServiceBillingService::finalizeServiceBill(ServiceItemUsage::SERVICE_VETERINARY, (int) $appointment->id);

            // Clinical work ends here. If a confinement is still open the
            // visit parks in clinical_complete while the inpatient workflow
            // runs in parallel; otherwise it goes straight to checkout.
            $hasOpenConfinement = MedicalConfinement::where('consultation_id', $appointment->id)
                ->whereIn('status', VeterinaryStatus::CONFINEMENT_OPEN)
                ->exists();

            $nextStatus = $hasOpenConfinement
                ? Appointment::STATUS_CLINICAL_COMPLETE
                : Appointment::STATUS_CHECKOUT;

            // Only overwrite clinical fields the caller actually sent — the
            // billing page can trigger completion without re-sending them.
            $updates = [
                'status' => $nextStatus,
                'clinical_completed_at' => now(),
                'clinical_completed_by' => $request->user()->id,
                'checked_out_at' => $nextStatus === Appointment::STATUS_CHECKOUT ? now() : null,
                'checked_out_by' => $nextStatus === Appointment::STATUS_CHECKOUT ? $request->user()->id : null,
            ];
            foreach (['diagnosis', 'treatment_notes', 'prescription', 'vet_remarks', 'outcome'] as $field) {
                if ($request->has($field)) {
                    $updates[$field] = $request->input($field);
                }
            }
            if ($request->has('follow_up_required')) {
                $updates['follow_up_required'] = (bool) $request->input('follow_up_required');
            }
            if ($request->has('follow_up_due')) {
                $updates['follow_up_due'] = $request->input('follow_up_due');
            }

            $appointment->update($updates);

            // Closes the visit immediately if the invoice is already settled.
            $closed = VisitCompletionService::tryComplete((int) $appointment->id);

            return ['summary' => $summary, 'closed' => $closed];
        });

        WorkflowNotifier::notifyUser($appointment->customer?->user_id, 'Consultation finalized', 'Your pet consultation has been finalized.', 'info', 'appointment', $appointment->id);
        WorkflowNotifier::notifyRole('cashier', 'Vet consultation awaiting payment', "Pet {$appointment->pet?->name} consultation is ready for billing.", 'info', 'appointment', $appointment->id);

        return response()->json([
            'message' => $outcome['closed']
                ? 'Consultation finalized and visit completed.'
                : 'Consultation finalized. The visit closes automatically once the cashier verifies payment.',
            'consultation' => $appointment->fresh(['customer', 'pet', 'service', 'veterinarian']),
            'billing' => $outcome['summary'],
        ]);
    }

    public function recommendConfinement(Request $request, $id): JsonResponse
    {
        $appointment = Appointment::with(['customer', 'pet'])->findOrFail($id);

        if (!in_array($appointment->status, VeterinaryStatus::STARTED, true)) {
            return response()->json(['error' => 'Confinement can only be recommended during an active consultation'], 422);
        }

        if ($appointment->veterinarian_id
            && (int) $appointment->veterinarian_id !== (int) $request->user()->id
            && !$request->user()->hasRoleAccess('admin')) {
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

        [$confinement, $appointment] = DB::transaction(function () use ($id, $request) {
            // Re-read under a row lock. Concurrent recommendations serialize here,
            // so the second one sees needs_confinement and is refused.
            $appointment = Appointment::with(['customer', 'pet'])->whereKey($id)->lockForUpdate()->firstOrFail();

            if (!in_array($appointment->status, VeterinaryStatus::STARTED, true)) {
                throw new HttpResponseException(response()->json(['error' => 'Confinement can only be recommended during an active consultation'], 422));
            }

            if (MedicalConfinement::where('consultation_id', $appointment->id)
                ->whereIn('status', VeterinaryStatus::CONFINEMENT_OPEN)
                ->exists()) {
                throw new HttpResponseException(response()->json(['error' => 'An open confinement already exists for this visit'], 422));
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

            // Confinement runs as a parallel inpatient workflow — the visit
            // keeps its clinical status and only gains the flag.
            $appointment->update([
                'confinement_recommended' => true,
                'veterinarian_id' => $request->user()->id,
                'diagnosis' => $request->diagnosis,
                'treatment_notes' => $request->treatment_plan,
                'prescription' => $request->medication_plan,
                'vet_remarks' => $request->reason_for_confinement,
            ]);

            return [$confinement, $appointment];
        });

        WorkflowNotifier::notifyRole('receptionist', 'Medical confinement recommended', "{$confinement->pet_name} needs medical confinement admission.", 'warning', 'medical_confinement', $confinement->id);
        WorkflowNotifier::notifyUser($appointment->customer?->user_id, 'Medical confinement recommended', 'The veterinarian recommended medical observation for your pet.', 'warning', 'medical_confinement', $confinement->id);

        return response()->json([
            'message' => 'Medical confinement recommended',
            'medical_confinement' => $confinement->load(['consultation', 'customer', 'pet', 'veterinarian']),
        ], 201);
    }
}
