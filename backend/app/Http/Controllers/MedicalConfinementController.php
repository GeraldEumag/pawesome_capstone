<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\BoardingCareLog;
use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\MedicalConfinement;
use App\Models\MedicalProgressNote;
use App\Services\ClinicalAccessLogger;
use App\Services\FileStorageService;
use App\Services\PaymentReferenceGuard;
use App\Models\MedicationAdministrationRecord;
use App\Models\WardBed;
use App\Services\MarService;
use App\Services\VisitCompletionService;
use App\Services\VisitConsentService;
use App\Services\WorkflowNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class MedicalConfinementController extends Controller
{
    private function currentCustomerId(Request $request): ?int
    {
        $user = $request->user();

        if (!$user) {
            return null;
        }

        return Customer::where('user_id', $user->id)
            ->orWhere('email', $user->email)
            ->value('id');
    }

    private function customerCanAccess(Request $request, MedicalConfinement $confinement): bool
    {
        if ($request->user()?->role !== 'customer') {
            return true;
        }

        $customerId = $this->currentCustomerId($request);

        return $customerId && (int) $confinement->customer_id === (int) $customerId;
    }

    public function index(Request $request): JsonResponse
    {
        $query = MedicalConfinement::with(['consultation', 'customer', 'pet', 'veterinarian', 'room']);

        $user = $request->user();

        if ($user?->role === 'customer') {
            $query->where('customer_id', $this->currentCustomerId($request) ?? 0);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $records = $query->latest()->get();

        // Clinical staff see every confinement; cases owned by another vet are logged.
        if (in_array($user?->role, ['veterinary', 'vet', 'veterinarian'], true)) {
            $others = $records->where('vet_id', '!=', $user->id)->pluck('id')->values()->all();
            if ($others) {
                ClinicalAccessLogger::record($user, 'medical_confinement_list', 0, false, ['confinement_ids' => $others]);
            }
        }

        return response()->json([
            'medical_confinements' => $records,
        ]);
    }

    public function show(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::with([
            'consultation',
            'customer',
            'pet',
            'veterinarian',
            'room',
            'careLogs.loggedBy',
            'progressNotes.veterinarian',
        ])->findOrFail($id);

        if (!$this->customerCanAccess($request, $confinement)) {
            return response()->json(['message' => 'Confinement record not found'], 404);
        }

        if ($request->user()?->role !== 'customer') {
            ClinicalAccessLogger::record($request->user(), 'medical_confinement', $confinement->id, (int) $confinement->vet_id === (int) $request->user()->id);
        }

        return response()->json(['medical_confinement' => $confinement]);
    }

    public function pendingAdmission(): JsonResponse
    {
        $records = MedicalConfinement::with(['consultation', 'customer', 'pet', 'veterinarian', 'room', 'wardBed'])
            ->whereIn('status', array_merge(
                ['recommended', 'consented', 'bed_assigned'],
                ['approved_for_admission'] // pre-migration rows
            ))
            ->latest()
            ->get();

        return response()->json(['medical_confinements' => $records]);
    }

    /**
     * Ward beds available for assignment (with all beds when ?all=1).
     */
    public function wardBeds(Request $request): JsonResponse
    {
        $query = WardBed::query()->orderBy('ward')->orderBy('name');
        if (!$request->boolean('all')) {
            $query->where('status', 'available');
        }

        return response()->json(['ward_beds' => $query->get()]);
    }

    /**
     * Assign an inpatient ward bed — the Phase D replacement for boarding
     * room assignment. Moves the confinement to bed_assigned.
     */
    public function assignBed(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if (!in_array(\App\Support\ConfinementStatusMap::forward($confinement->status), ['recommended', 'consented', 'bed_assigned'], true)) {
            return response()->json(['error' => 'Only recommended or consented confinements can receive a bed assignment'], 422);
        }

        $validator = Validator::make($request->all(), [
            'ward_bed_id' => 'required|exists:ward_beds,id',
            'daily_rate' => 'nullable|numeric|min:0',
            'estimated_cost' => 'nullable|numeric|min:0',
            'deposit_amount' => 'nullable|numeric|min:0',
            'consent_id' => 'nullable|exists:visit_consents,id',
        ]);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $bed = WardBed::findOrFail($request->ward_bed_id);
        $isCurrentBed = (int) $confinement->ward_bed_id === (int) $bed->id;
        if (!$isCurrentBed && $bed->status !== 'available') {
            return response()->json(['error' => 'Selected ward bed is not available'], 422);
        }

        $confinement->update([
            'ward_bed_id' => $bed->id,
            'daily_rate' => $request->input('daily_rate', $confinement->daily_rate ?? $bed->daily_rate),
            'estimated_cost' => $request->input('estimated_cost', $confinement->estimated_cost),
            'deposit_amount' => $request->input('deposit_amount', $confinement->deposit_amount),
            'consent_id' => $request->input('consent_id', $confinement->consent_id),
            'status' => 'bed_assigned',
        ]);

        WorkflowNotifier::notifyEmail($confinement->customer_email, 'Medical confinement bed assigned', 'A ward bed has been assigned for your pet medical confinement.', 'info', 'medical_confinement', $confinement->id);

        return response()->json([
            'message' => 'Ward bed assigned',
            'medical_confinement' => $confinement->fresh(['consultation', 'customer', 'pet', 'veterinarian', 'room', 'wardBed']),
        ]);
    }

    public function assignRoom(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if (!in_array($confinement->status, ['recommended', 'approved_for_admission'], true)) {
            return response()->json(['error' => 'Only recommended confinements can receive room assignment'], 422);
        }

        $validator = Validator::make($request->all(), [
            'room_id' => 'required|exists:hotel_rooms,id',
            'estimated_cost' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $room = HotelRoom::findOrFail($request->room_id);
        $isCurrentRoom = (int) $confinement->room_id === (int) $room->id;
        if (!$isCurrentRoom && $room->status !== 'available') {
            return response()->json(['error' => 'Selected room is not available for admission'], 422);
        }

        $confinement->update([
            'room_id' => $room->id,
            'estimated_cost' => $request->input('estimated_cost', $confinement->estimated_cost),
            'status' => 'approved_for_admission',
        ]);

        WorkflowNotifier::notifyEmail($confinement->customer_email, 'Medical confinement room assigned', 'A room has been assigned for your pet medical confinement.', 'info', 'medical_confinement', $confinement->id);

        return response()->json([
            'message' => 'Medical confinement room assigned',
            'medical_confinement' => $confinement->fresh(['consultation', 'customer', 'pet', 'veterinarian', 'room']),
        ]);
    }

    public function admit(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if (!in_array(\App\Support\ConfinementStatusMap::forward($confinement->status), ['recommended', 'consented', 'bed_assigned'], true)) {
            return response()->json(['error' => 'Only recommended, consented, or bed-assigned confinements can be admitted'], 422);
        }

        if (!$confinement->room_id && !$confinement->ward_bed_id) {
            return response()->json(['error' => 'Assign a ward bed or room before admission'], 422);
        }

        // Admission requires a signed confinement consent unless the
        // originating visit was checked in as an emergency.
        if (Schema::hasTable('visit_consents')
            && !VisitConsentService::canAdmitConfinement($confinement)) {
            return response()->json([
                'error' => 'A signed confinement consent is required before admission (emergency visits are exempt).'
            ], 422);
        }

        $oldStatus = $confinement->status;
        // Status + bed/room occupancy must commit together.
        DB::transaction(function () use ($confinement, $request) {
            $confinement->update([
                'status' => 'admitted',
                'admitted_by' => $request->user()?->id,
                'admitted_at' => now(),
                'last_accrual_at' => now(),
            ]);
            $confinement->room?->update(['status' => 'occupied']);
            $confinement->wardBed?->update(['status' => 'occupied']);
        });

        WorkflowNotifier::notifyRole('veterinary', 'Pet admitted for confinement', "{$confinement->pet_name} has been admitted for medical confinement.", 'info', 'medical_confinement', $confinement->id);
        WorkflowNotifier::notifyEmail($confinement->customer_email, 'Pet admitted', "{$confinement->pet_name} has been admitted for medical observation.", 'info', 'medical_confinement', $confinement->id);

        ActivityLog::log($request->user()?->id, 'confinement_admitted', "Medical confinement #{$confinement->id} admitted", [
            'category' => 'medical',
            'reference_type' => 'medical_confinement',
            'reference_id' => $confinement->id,
            'changes' => ['status' => ['old' => $oldStatus, 'new' => 'admitted']],
        ]);

        return response()->json([
            'message' => 'Pet admitted for medical confinement',
            'medical_confinement' => $confinement->fresh(['consultation', 'customer', 'pet', 'veterinarian', 'room']),
        ]);
    }

    public function uploadPaymentProof(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if (!$this->customerCanAccess($request, $confinement)) {
            return response()->json(['message' => 'Confinement record not found'], 404);
        }

        if (!in_array($confinement->payment_status, ['unpaid', 'rejected', 'partial'], true)) {
            return response()->json(['error' => 'Only unpaid, partial, or rejected payments can be submitted'], 422);
        }

        $validator = Validator::make($request->all(), [
            'payment_method' => 'required|in:gcash,maya',
            'payment_reference' => 'required|string|max:255',
            'payment_proof' => 'required|file|mimes:jpg,jpeg,png,pdf|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $paymentData = [
            'payment_method' => $request->payment_method,
            'payment_reference' => $request->payment_reference,
            'payment_status' => 'pending',
        ];

        $guardResult = PaymentReferenceGuard::withUniqueReference(
            $request->payment_reference,
            [
                'ids' => ['medical_confinements' => [$confinement->id]],
                'settlements' => [['type' => 'medical_confinement', 'id' => $confinement->id]],
            ],
            fn () => response()->json(['message' => 'This payment reference has already been submitted. Check the number or contact the cashier.'], 422),
            function () use ($request, $paymentData, $confinement) {
                // Replaced proofs are retained as payment evidence (deleteOld: false).
                return FileStorageService::storeAndPersist(
                    $request->file('payment_proof'), 'payment-proofs/confinements', 'private',
                    fn (string $path) => $confinement->update($paymentData + [
                        'payment_proof' => $path,
                    ]),
                    deleteOld: false,
                );
            }
        );
        if ($guardResult instanceof JsonResponse) {
            return $guardResult;
        }

        WorkflowNotifier::notifyRole('cashier', 'Confinement payment proof submitted', "{$confinement->pet_name} has a pending confinement payment proof.", 'info', 'medical_confinement', $confinement->id);

        return response()->json([
            'message' => 'Payment proof submitted for cashier verification',
            'medical_confinement' => $confinement->fresh(['consultation', 'customer', 'pet', 'veterinarian', 'room']),
        ]);
    }

    public function careLogs(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::with('careLogs.loggedBy')->findOrFail($id);

        if (!$this->customerCanAccess($request, $confinement)) {
            return response()->json(['message' => 'Confinement record not found'], 404);
        }

        return response()->json(['care_logs' => $confinement->careLogs()->with('loggedBy')->latest()->get()]);
    }

    public function addCareLog(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if (!in_array($confinement->status, ['admitted', 'under_care', 'under_observation', 'under_treatment'], true)) {
            return response()->json(['error' => 'Care logs can only be added while the pet is admitted'], 422);
        }

        $validator = Validator::make($request->all(), [
            'log_type' => 'required|in:' . implode(',', BoardingCareLog::VALID_TYPES),
            'title' => 'nullable|string|max:255',
            'notes' => 'required|string',
            'feeding_amount' => 'nullable|string|max:255',
            'medication_given' => 'nullable|string',
            'behavior_notes' => 'nullable|string',
            'health_observation' => 'nullable|string',
            'photo' => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $createLog = fn (?string $path = null) => BoardingCareLog::create([
            'confinement_id' => $confinement->id,
            'logged_by' => $request->user()?->id,
            'log_type' => $request->log_type,
            'title' => $request->title,
            'notes' => $request->notes,
            'feeding_amount' => $request->feeding_amount,
            'medication_given' => $request->medication_given,
            'behavior_notes' => $request->behavior_notes,
            'health_observation' => $request->health_observation,
            'photo_path' => $path,
        ]);
        $log = $request->hasFile('photo')
            ? FileStorageService::storeAndPersist($request->file('photo'), 'care-logs/confinements', 'private', $createLog)
            : $createLog();

        if ($request->filled('health_observation')) {
            WorkflowNotifier::notifyRole('veterinary', 'Confinement care health observation', "A care log for {$confinement->pet_name} includes a health observation.", 'warning', 'medical_confinement', $confinement->id);
        }

        return response()->json(['message' => 'Care log added', 'care_log' => $log->load('loggedBy')], 201);
    }

    public function progressNotes(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if ($request->user()?->role === 'customer' && !$this->customerCanAccess($request, $confinement)) {
            return response()->json(['message' => 'Confinement record not found'], 404);
        }

        return response()->json(['medical_notes' => $confinement->progressNotes()->with('veterinarian')->latest()->get()]);
    }

    public function addProgressNote(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if (!in_array($confinement->status, ['admitted', 'under_care', 'under_observation', 'under_treatment'], true)) {
            return response()->json(['error' => 'Medical progress notes can only be added while the pet is admitted'], 422);
        }

        $validator = Validator::make($request->all(), [
            'note_type' => 'required|in:' . implode(',', MedicalProgressNote::VALID_TYPES),
            'diagnosis_update' => 'nullable|string',
            'treatment_given' => 'nullable|string',
            'medication_given' => 'nullable|string',
            'vital_signs' => 'nullable|string',
            'prescription' => 'nullable|string',
            'recommendations' => 'nullable|string',
            'status' => 'nullable|in:under_observation,under_treatment,under_care,critical',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Progress note + optional status transition must commit together.
        $note = DB::transaction(function () use ($confinement, $request) {
            $note = MedicalProgressNote::create([
                'confinement_id' => $confinement->id,
                'vet_id' => $request->user()?->id,
                'note_type' => $request->note_type,
                'diagnosis_update' => $request->diagnosis_update,
                'treatment_given' => $request->treatment_given,
                'medication_given' => $request->medication_given,
                'vital_signs' => $request->vital_signs,
                'prescription' => $request->prescription,
                'recommendations' => $request->recommendations,
                'status' => $request->status,
            ]);

            // New vocabulary: observation/treatment/critical set the care
            // level while the status stays under_care; legacy values map on.
            if ($request->filled('status')) {
                $levelMap = ['under_observation' => 'observation', 'under_treatment' => 'treatment', 'critical' => 'critical'];
                $confinement->update([
                    'status' => 'under_care',
                    'care_level' => $levelMap[$request->status] ?? $request->status,
                ]);
            }

            return $note;
        });

        WorkflowNotifier::notifyEmail($confinement->customer_email, 'Medical progress updated', "A medical progress note was added for {$confinement->pet_name}.", 'info', 'medical_confinement', $confinement->id);

        return response()->json(['message' => 'Medical progress note added', 'medical_note' => $note->load('veterinarian')], 201);
    }

    public function markUnderObservation($id): JsonResponse
    {
        return $this->setMedicalStatus($id, 'observation');
    }

    public function markUnderTreatment($id): JsonResponse
    {
        return $this->setMedicalStatus($id, 'treatment');
    }

    public function markCritical($id): JsonResponse
    {
        return $this->setMedicalStatus($id, 'critical');
    }

    public function clearForDischarge(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if (!in_array($confinement->status, ['admitted', 'under_care', 'under_observation', 'under_treatment'], true)) {
            return response()->json(['error' => 'Only admitted pets can be cleared for discharge'], 422);
        }

        $oldStatus = $confinement->status;
        // Status change and its discharge-clearance progress note must commit together.
        DB::transaction(function () use ($confinement, $request) {
            $confinement->update([
                'status' => 'ready_for_discharge',
                'discharge_cleared_by' => $request->user()?->id,
                'discharge_cleared_at' => now(),
            ]);

            MedicalProgressNote::create([
                'confinement_id' => $confinement->id,
                'vet_id' => $request->user()?->id,
                'note_type' => 'discharge_clearance',
                'recommendations' => $request->input('recommendations'),
                'status' => 'ready_for_discharge',
            ]);
        });

        ActivityLog::log($request->user()?->id, 'confinement_cleared_for_discharge', "Medical confinement #{$confinement->id} cleared for discharge", [
            'category' => 'medical',
            'reference_type' => 'medical_confinement',
            'reference_id' => $confinement->id,
            'changes' => ['status' => ['old' => $oldStatus, 'new' => 'ready_for_discharge']],
        ]);

        WorkflowNotifier::notifyRole('receptionist', 'Pet ready for discharge', "{$confinement->pet_name} is medically cleared for discharge.", 'success', 'medical_confinement', $confinement->id);
        WorkflowNotifier::notifyEmail($confinement->customer_email, 'Ready for discharge', "{$confinement->pet_name} has been cleared for discharge.", 'success', 'medical_confinement', $confinement->id);

        return response()->json(['message' => 'Pet cleared for discharge', 'medical_confinement' => $confinement->fresh()]);
    }

    public function release(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if ($confinement->status !== 'ready_for_discharge') {
            return response()->json(['error' => 'Pet must be cleared by veterinary before release'], 422);
        }

        // Financial clearance: settled payment — or a logged manager override.
        // Accrue any due daily charges first so the gate sees the real balance.
        if (Schema::hasTable('visit_invoices')) {
            \App\Services\ConfinementAccrualService::accrue($confinement);
            $confinement->refresh();
        }

        $isManager = $request->user()?->hasRoleAccess('manager', 'admin');
        $overrideReason = trim((string) $request->input('override_reason', ''));
        $useOverride = $confinement->payment_status !== 'paid' && $isManager && $overrideReason !== '';

        if ($confinement->payment_status !== 'paid' && !$useOverride) {
            return response()->json([
                'error' => 'Payment must be settled before release — or a manager must release with an override reason',
            ], 422);
        }
        if ($confinement->payment_status !== 'paid' && $useOverride && strlen($overrideReason) < 10) {
            return response()->json(['error' => 'An override release needs a reason of at least 10 characters'], 422);
        }

        $outcome = in_array($request->input('outcome'), ['discharged', 'transferred', 'deceased'], true)
            ? $request->input('outcome')
            : 'discharged';

        // Status + bed/room release must commit together; releasing the last
        // open confinement lets the linked visit close automatically.
        DB::transaction(function () use ($confinement, $request, $useOverride, $overrideReason, $outcome) {
            $confinement->update([
                'status' => $outcome,
                'discharge_outcome' => $outcome,
                'discharged_by' => $request->user()?->id,
                'discharged_at' => now(),
                'override_by' => $useOverride ? $request->user()?->id : null,
                'override_reason' => $useOverride ? $overrideReason : null,
                'override_at' => $useOverride ? now() : null,
            ]);
            $confinement->room?->update(['status' => 'available']);
            $confinement->wardBed?->update(['status' => 'available']);

            if ($confinement->consultation_id) {
                VisitCompletionService::tryComplete((int) $confinement->consultation_id);
            }
        });

        ActivityLog::log($request->user()?->id, 'confinement_released', "Medical confinement #{$confinement->id} released ({$outcome})", [
            'category' => 'medical',
            'reference_type' => 'medical_confinement',
            'reference_id' => $confinement->id,
            'changes' => ['status' => ['old' => 'ready_for_discharge', 'new' => $outcome]],
            'metadata' => $useOverride ? ['manager_override' => true, 'override_reason' => $overrideReason] : [],
        ]);

        if ($useOverride) {
            ActivityLog::log($request->user()?->id, 'confinement_release_override', "Manager override release on confinement #{$confinement->id}: {$overrideReason}", [
                'category' => 'medical',
                'reference_type' => 'medical_confinement',
                'reference_id' => $confinement->id,
            ]);
            WorkflowNotifier::notifyRole('manager', 'Override release used', "A confinement for {$confinement->pet_name} was released without settled payment (override).", 'warning', 'medical_confinement', $confinement->id);
        }

        WorkflowNotifier::notifyEmail($confinement->customer_email, 'Pet discharged', "{$confinement->pet_name} has been discharged and released.", 'success', 'medical_confinement', $confinement->id);

        return response()->json(['message' => 'Pet released after confinement', 'medical_confinement' => $confinement->fresh(['room'])]);
    }

    /**
     * MAR list for a confinement.
     */
    public function marList(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);
        if ($request->user()?->role === 'customer' && !$this->customerCanAccess($request, $confinement)) {
            return response()->json(['message' => 'Confinement record not found'], 404);
        }

        return response()->json([
            'mar' => $confinement->medicationAdministrations()
                ->with(['item:id,name', 'batch:id,batch_no', 'administeredBy:id,name'])
                ->orderByRaw("CASE WHEN scheduled_at IS NULL THEN 1 ELSE 0 END, scheduled_at")
                ->get(),
        ]);
    }

    /** Schedule a medication administration. */
    public function marSchedule(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);
        $validator = Validator::make($request->all(), [
            'inventory_item_id' => 'nullable|exists:inventory_items,id',
            'inventory_batch_id' => 'nullable|exists:inventory_batches,id',
            'prescription_id' => 'nullable|exists:prescriptions,id',
            'medication_name' => 'required_without:inventory_item_id|string|max:255',
            'dose' => 'nullable|string|max:100',
            'route' => 'nullable|string|max:100',
            'scheduled_at' => 'nullable|date',
            'notes' => 'nullable|string|max:1000',
        ]);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $mar = MarService::schedule($confinement, $validator->validated());
            return response()->json(['mar' => $mar->load(['item:id,name', 'batch:id,batch_no'])], 201);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }
    }

    /** Confirm administration — the only point where stock moves. */
    public function marAdminister(Request $request, $confinementId, $marId): JsonResponse
    {
        $mar = MedicationAdministrationRecord::where('medical_confinement_id', $confinementId)->findOrFail($marId);
        $validator = Validator::make($request->all(), [
            'inventory_batch_id' => 'nullable|exists:inventory_batches,id',
            'quantity' => 'nullable|integer|min:1',
        ]);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $mar = MarService::administer($mar, $request->user()->id, $request->input('inventory_batch_id'), $request->input('quantity'));
            return response()->json(['mar' => $mar]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }
    }

    /** Skip or hold a scheduled administration. */
    public function marUpdateStatus(Request $request, $confinementId, $marId): JsonResponse
    {
        $mar = MedicationAdministrationRecord::where('medical_confinement_id', $confinementId)->findOrFail($marId);
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:skipped,held',
            'notes' => 'nullable|string|max:1000',
        ]);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $mar = MarService::setStatus($mar, $request->status, $request->input('notes'));
            return response()->json(['mar' => $mar]);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }
    }

    private function setMedicalStatus($id, string $careLevel): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if (!in_array($confinement->status, ['admitted', 'under_care', 'under_observation', 'under_treatment'], true)) {
            return response()->json(['error' => 'Only admitted pets can change care level'], 422);
        }

        $oldStatus = $confinement->status;
        $confinement->update(['status' => 'under_care', 'care_level' => $careLevel]);
        $status = "under_care ({$careLevel})";

        ActivityLog::log(request()->user()?->id, 'confinement_status_changed', "Medical confinement #{$confinement->id} status changed to {$status}", [
            'category' => 'medical',
            'reference_type' => 'medical_confinement',
            'reference_id' => $confinement->id,
            'changes' => ['status' => ['old' => $oldStatus, 'new' => $status]],
        ]);

        return response()->json(['message' => 'Medical confinement status updated', 'medical_confinement' => $confinement->fresh()]);
    }
}
