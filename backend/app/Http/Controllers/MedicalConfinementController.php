<?php

namespace App\Http\Controllers;

use App\Models\BoardingCareLog;
use App\Models\Customer;
use App\Models\HotelRoom;
use App\Models\MedicalConfinement;
use App\Models\MedicalProgressNote;
use App\Services\WorkflowNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

        if ($request->user()?->role === 'customer') {
            $query->where('customer_id', $this->currentCustomerId($request) ?? 0);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json([
            'medical_confinements' => $query->latest()->get(),
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

        return response()->json(['medical_confinement' => $confinement]);
    }

    public function pendingAdmission(): JsonResponse
    {
        $records = MedicalConfinement::with(['consultation', 'customer', 'pet', 'veterinarian', 'room'])
            ->whereIn('status', ['recommended', 'approved_for_admission'])
            ->latest()
            ->get();

        return response()->json(['medical_confinements' => $records]);
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
        if (!in_array($room->status, ['available', 'reserved'], true)) {
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

        if (!in_array($confinement->status, ['recommended', 'approved_for_admission'], true)) {
            return response()->json(['error' => 'Only recommended or approved confinements can be admitted'], 422);
        }

        if (!$confinement->room_id) {
            return response()->json(['error' => 'Assign a medical room or ward before admission'], 422);
        }

        $confinement->update([
            'status' => 'admitted',
            'admitted_by' => $request->user()?->id,
            'admitted_at' => now(),
        ]);
        $confinement->room?->update(['status' => 'occupied']);

        WorkflowNotifier::notifyRole('veterinary', 'Pet admitted for confinement', "{$confinement->pet_name} has been admitted for medical confinement.", 'info', 'medical_confinement', $confinement->id);
        WorkflowNotifier::notifyEmail($confinement->customer_email, 'Pet admitted', "{$confinement->pet_name} has been admitted for medical observation.", 'info', 'medical_confinement', $confinement->id);

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
            'payment_method' => 'required|string|max:100',
            'payment_reference' => 'required|string|max:255',
            'payment_proof' => 'required|file|mimes:jpg,jpeg,png,pdf|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $path = $request->file('payment_proof')->store('payment-proofs/confinements', 'public');
        $confinement->update([
            'payment_method' => $request->payment_method,
            'payment_reference' => $request->payment_reference,
            'payment_proof' => $path,
            'payment_status' => 'pending',
        ]);

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

        if (!in_array($confinement->status, ['admitted', 'under_observation', 'under_treatment'], true)) {
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

        $path = $request->hasFile('photo') ? $request->file('photo')->store('care-logs/confinements', 'public') : null;
        $log = BoardingCareLog::create([
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

        if (!in_array($confinement->status, ['admitted', 'under_observation', 'under_treatment'], true)) {
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
            'status' => 'nullable|in:under_observation,under_treatment',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

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

        if ($request->filled('status')) {
            $confinement->update(['status' => $request->status]);
        }

        WorkflowNotifier::notifyEmail($confinement->customer_email, 'Medical progress updated', "A medical progress note was added for {$confinement->pet_name}.", 'info', 'medical_confinement', $confinement->id);

        return response()->json(['message' => 'Medical progress note added', 'medical_note' => $note->load('veterinarian')], 201);
    }

    public function markUnderObservation($id): JsonResponse
    {
        return $this->setMedicalStatus($id, 'under_observation');
    }

    public function markUnderTreatment($id): JsonResponse
    {
        return $this->setMedicalStatus($id, 'under_treatment');
    }

    public function clearForDischarge(Request $request, $id): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if (!in_array($confinement->status, ['admitted', 'under_observation', 'under_treatment'], true)) {
            return response()->json(['error' => 'Only admitted pets can be cleared for discharge'], 422);
        }

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

        if ($confinement->payment_status !== 'paid') {
            return response()->json(['error' => 'Payment must be settled before release'], 422);
        }

        $confinement->update([
            'status' => 'completed',
            'discharged_by' => $request->user()?->id,
            'discharged_at' => now(),
        ]);
        $confinement->room?->update(['status' => 'available']);

        WorkflowNotifier::notifyEmail($confinement->customer_email, 'Pet discharged', "{$confinement->pet_name} has been discharged and released.", 'success', 'medical_confinement', $confinement->id);

        return response()->json(['message' => 'Pet released after confinement', 'medical_confinement' => $confinement->fresh(['room'])]);
    }

    private function setMedicalStatus($id, string $status): JsonResponse
    {
        $confinement = MedicalConfinement::findOrFail($id);

        if (!in_array($confinement->status, ['admitted', 'under_observation', 'under_treatment'], true)) {
            return response()->json(['error' => 'Only admitted pets can move into observation or treatment'], 422);
        }

        $confinement->update(['status' => $status]);

        return response()->json(['message' => 'Medical confinement status updated', 'medical_confinement' => $confinement->fresh()]);
    }
}
