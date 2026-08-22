<?php

namespace App\Http\Controllers\Veterinary;

use App\Http\Controllers\Controller;
use App\Models\MedicalRecord;
use App\Models\Vaccination;
use App\Models\Prescription;
use App\Models\Pet;
use App\Models\Appointment;
use App\Services\VeterinaryInventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class MedicalRecordController extends Controller
{
    private $veterinaryInventoryService;

    public function __construct(VeterinaryInventoryService $veterinaryInventoryService)
    {
        $this->veterinaryInventoryService = $veterinaryInventoryService;
    }

    private function vetCanAccessPet(Request $request, int $petId): bool
    {
        return Appointment::where('pet_id', $petId)
            ->where('veterinarian_id', $request->user()->id)
            ->exists();
    }

    private function vetCanUseAppointment(Request $request, Appointment $appointment): bool
    {
        return (int) $appointment->veterinarian_id === (int) $request->user()->id
            && in_array($appointment->status, ['in_consultation', 'in_progress', 'treated'], true);
    }

    /**
     * List medical records with filters
     */
    public function index(Request $request)
    {
        $query = MedicalRecord::with(['pet.customer', 'veterinarian', 'prescriptions', 'vaccinations']);
        
        // Filter by pet
        if ($request->has('pet_id')) {
            $query->where('pet_id', $request->input('pet_id'));
        }
        
        // Filter by veterinarian
        if ($request->has('veterinarian_id')) {
            $query->where('veterinarian_id', $request->input('veterinarian_id'));
        }
        
        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }
        
        // Filter by date range
        if ($request->has('from_date')) {
            $query->whereDate('visit_date', '>=', $request->input('from_date'));
        }
        if ($request->has('to_date')) {
            $query->whereDate('visit_date', '<=', $request->input('to_date'));
        }
        
        // Search by diagnosis, symptoms, or pet name
        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('diagnosis', 'like', "%{$search}%")
                  ->orWhere('symptoms', 'like', "%{$search}%")
                  ->orWhereHas('pet', function ($pq) use ($search) {
                      $pq->where('name', 'like', "%{$search}%");
                  });
            });
        }
        
        $records = $query->orderBy('visit_date', 'desc')->get();
        
        return response()->json($records);
    }

    /**
     * Get single medical record with all related data
     */
    public function show($id)
    {
        $record = MedicalRecord::with([
            'pet.customer', 
            'veterinarian', 
            'appointment',
            'prescriptions',
            'vaccinations',
            'attachments',
            'lockedBy'
        ])->findOrFail($id);

        if (!$record->canBeViewedBy(request()->user()) || !$this->vetCanAccessPet(request(), $record->pet_id)) {
            return response()->json(['message' => 'Medical record not found'], 404);
        }
        
        return response()->json($record);
    }

    /**
     * Create new medical record
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'pet_id' => 'required|integer|exists:pets,id',
            'appointment_id' => 'nullable|integer|exists:appointments,id',
            'visit_date' => 'required|date',
            'chief_complaint' => 'nullable|string',
            'symptoms' => 'nullable|string',
            'physical_examination' => 'nullable|string',
            'diagnosis' => 'nullable|string',
            'secondary_diagnosis' => 'nullable|string',
            'treatment_plan' => 'nullable|string',
            'procedure_notes' => 'nullable|string',
            'follow_up_instructions' => 'nullable|string',
            'weight_kg' => 'nullable|numeric',
            'temperature_celsius' => 'nullable|numeric',
            'heart_rate' => 'nullable|integer',
            'respiratory_rate' => 'nullable|integer',
            'body_condition_score' => 'nullable|string',
            'notes' => 'nullable|string',
            'status' => 'nullable|in:draft,finalized',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = $request->user();

        if ($request->appointment_id) {
            $appointment = Appointment::findOrFail($request->appointment_id);

            if (!$this->vetCanUseAppointment($request, $appointment) || (int) $appointment->pet_id !== (int) $request->pet_id) {
                return response()->json(['message' => 'This appointment is not ready for consultation'], 422);
            }
        } elseif (!$this->vetCanAccessPet($request, (int) $request->pet_id)) {
            return response()->json(['message' => 'Pet not found'], 404);
        }
        
        DB::beginTransaction();
        try {
            $record = MedicalRecord::create([
                'pet_id' => $request->pet_id,
                'appointment_id' => $request->appointment_id,
                'veterinarian_id' => $user->id,
                'visit_date' => $request->visit_date,
                'chief_complaint' => $request->chief_complaint,
                'symptoms' => $request->symptoms,
                'physical_examination' => $request->physical_examination,
                'diagnosis' => $request->diagnosis,
                'secondary_diagnosis' => $request->secondary_diagnosis,
                'treatment_plan' => $request->treatment_plan,
                'procedure_notes' => $request->procedure_notes,
                'follow_up_instructions' => $request->follow_up_instructions,
                'weight_kg' => $request->weight_kg,
                'temperature_celsius' => $request->temperature_celsius,
                'heart_rate' => $request->heart_rate,
                'respiratory_rate' => $request->respiratory_rate,
                'body_condition_score' => $request->body_condition_score,
                'notes' => $request->notes,
                'status' => $request->status ?? MedicalRecord::STATUS_DRAFT,
            ]);

            // Create prescriptions if provided
            if ($request->has('prescriptions')) {
                foreach ($request->prescriptions as $prescriptionData) {
                    $this->createPrescription($record, $prescriptionData, $user);
                }
            }

            // Create vaccinations if provided
            if ($request->has('vaccinations')) {
                foreach ($request->vaccinations as $vaccinationData) {
                    $this->addVaccinationToRecord($record, $vaccinationData, $user);
                }
            }

            DB::commit();

            return response()->json([
                'message' => 'Medical record created successfully',
                'record' => $record->load(['pet.customer', 'veterinarian', 'prescriptions', 'vaccinations'])
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to create medical record', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Update medical record
     */
    public function update(Request $request, $id)
    {
        $record = MedicalRecord::findOrFail($id);
        $user = $request->user();

        // Check if user can edit this record
        if (!$record->canBeEditedBy($user) || !$this->vetCanAccessPet($request, $record->pet_id)) {
            return response()->json(['message' => 'You do not have permission to edit this record'], 403);
        }

        $validator = Validator::make($request->all(), [
            'visit_date' => 'sometimes|date',
            'chief_complaint' => 'nullable|string',
            'symptoms' => 'nullable|string',
            'physical_examination' => 'nullable|string',
            'diagnosis' => 'nullable|string',
            'secondary_diagnosis' => 'nullable|string',
            'treatment_plan' => 'nullable|string',
            'procedure_notes' => 'nullable|string',
            'follow_up_instructions' => 'nullable|string',
            'weight_kg' => 'nullable|numeric',
            'temperature_celsius' => 'nullable|numeric',
            'heart_rate' => 'nullable|integer',
            'respiratory_rate' => 'nullable|integer',
            'body_condition_score' => 'nullable|string',
            'notes' => 'nullable|string',
            'status' => 'sometimes|in:draft,finalized,locked',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $record->update($request->only([
                'visit_date', 'chief_complaint', 'symptoms', 'physical_examination',
                'diagnosis', 'secondary_diagnosis', 'treatment_plan', 'procedure_notes',
                'follow_up_instructions', 'weight_kg', 'temperature_celsius', 'heart_rate',
                'respiratory_rate', 'body_condition_score', 'notes', 'status'
            ]));

            // Update prescriptions if provided
            if ($request->has('prescriptions')) {
                foreach ($request->prescriptions as $prescriptionData) {
                    if (isset($prescriptionData['id'])) {
                        $this->updatePrescription($prescriptionData['id'], $prescriptionData);
                    } else {
                        $this->createPrescription($record, $prescriptionData, $user);
                    }
                }
            }

            // Update vaccinations if provided
            if ($request->has('vaccinations')) {
                foreach ($request->vaccinations as $vaccinationData) {
                    if (isset($vaccinationData['id'])) {
                        $this->updateVaccinationRecord($vaccinationData['id'], $vaccinationData);
                    } else {
                        $this->addVaccinationToRecord($record, $vaccinationData, $user);
                    }
                }
            }

            DB::commit();

            return response()->json([
                'message' => 'Medical record updated successfully',
                'record' => $record->load(['pet.customer', 'veterinarian', 'prescriptions', 'vaccinations'])
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update medical record', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Delete medical record
     */
    public function destroy($id)
    {
        $record = MedicalRecord::findOrFail($id);
        $user = request()->user();

        // Only admin or the creating veterinarian can delete
        if (!$user->hasRoleAccess('admin') && $record->veterinarian_id !== $user->id) {
            return response()->json(['message' => 'You do not have permission to delete this record'], 403);
        }

        // Locked records cannot be deleted
        if ($record->status === MedicalRecord::STATUS_LOCKED) {
            return response()->json(['message' => 'Locked records cannot be deleted'], 403);
        }

        $record->delete();

        return response()->json(['message' => 'Medical record deleted successfully']);
    }

    /**
     * Lock a medical record
     */
    public function lock($id)
    {
        $record = MedicalRecord::findOrFail($id);
        $user = request()->user();

        // Only admin or the creating veterinarian can lock
        if (!$user->hasRoleAccess('admin') && $record->veterinarian_id !== $user->id) {
            return response()->json(['message' => 'You do not have permission to lock this record'], 403);
        }

        $record->lock($user);

        return response()->json([
            'message' => 'Medical record locked successfully',
            'record' => $record->fresh()
        ]);
    }

    /**
     * Finalize a medical record (allowing the appointment to be completed)
     */
    public function finalize($id)
    {
        $record = MedicalRecord::findOrFail($id);
        $user = request()->user();

        // Only admin or the creating veterinarian can finalize
        if (!$user->hasRoleAccess('admin') && $record->veterinarian_id !== $user->id) {
            return response()->json(['message' => 'You do not have permission to finalize this record'], 403);
        }

        if ($record->status === MedicalRecord::STATUS_LOCKED) {
            return response()->json(['message' => 'Locked records cannot be finalized'], 422);
        }

        if ($record->status === MedicalRecord::STATUS_FINALIZED) {
            return response()->json([
                'message' => 'Medical record is already finalized',
                'record' => $record->fresh()
            ], 200);
        }

        $record->finalize();

        return response()->json([
            'message' => 'Medical record finalized successfully',
            'record' => $record->fresh()
        ]);
    }

    /**
     * Get medical records for a specific pet
     */
    public function forPet($petId)
    {
        $pet = Pet::with(['customer'])->findOrFail($petId);

        if (!$this->vetCanAccessPet(request(), (int) $petId)) {
            return response()->json(['message' => 'Pet not found'], 404);
        }
        
        $records = MedicalRecord::with(['veterinarian', 'prescriptions', 'vaccinations'])
            ->where('pet_id', $petId)
            ->orderBy('visit_date', 'desc')
            ->get();

        return response()->json([
            'pet' => $pet,
            'records' => $records
        ]);
    }

    /**
     * Get medical history for a specific pet (frontend compatible format)
     */
    public function indexByPet($petId)
    {
        try {
            $pet = Pet::with(['customer'])->findOrFail($petId);

            // Remove veterinarian access restriction for customer profiles module
            // to allow viewing all pets
            $records = MedicalRecord::with(['veterinarian'])
                ->where('pet_id', $petId)
                ->orderBy('visit_date', 'desc')
                ->get()
                ->map(function ($record) {
                    return [
                        'id' => $record->id,
                        'date' => $record->visit_date ? $record->visit_date->format('Y-m-d') : null,
                        'visit_date' => $record->visit_date ? $record->visit_date->format('Y-m-d') : null,
                        'title' => $record->chief_complaint ?: 'Medical Consultation',
                        'service_name' => $record->chief_complaint ?: 'Medical Consultation',
                        'diagnosis' => $record->diagnosis ?: 'No diagnosis stated.',
                        'symptoms' => $record->symptoms ?: '',
                        'treatment' => $record->treatment_plan ?: $record->physical_examination ?: '',
                        'prescription' => '',
                        'notes' => $record->notes ?: $record->follow_up_instructions ?: '',
                        'remarks' => $record->notes ?: $record->follow_up_instructions ?: '',
                        'weight' => $record->weight_kg ? (string) $record->weight_kg : '',
                        'temperature' => $record->temperature_celsius ? (string) $record->temperature_celsius : '',
                        'next_visit_date' => null,
                        'status' => $record->status ?: 'completed',
                        'veterinarian' => [
                            'id' => $record->veterinarian?->id,
                            'name' => $record->veterinarian?->name ?: 'Veterinary Staff'
                        ],
                        'created_at' => $record->created_at ? $record->created_at->format('Y-m-d') : null
                    ];
                });

            return response()->json([
                'success' => true,
                'data' => $records
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch medical history: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Store medical record for a specific pet (frontend compatible)
     */
    public function storeForPet(Request $request, $petId)
    {
        try {
            $validator = Validator::make($request->all(), [
                'visit_date' => 'nullable|date',
                'service_type' => 'nullable|string|max:255',
                'diagnosis' => 'nullable|string',
                'symptoms' => 'nullable|string',
                'treatment' => 'nullable|string',
                'prescription' => 'nullable|string',
                'notes' => 'nullable|string',
                'weight' => 'nullable|numeric|min:0',
                'temperature' => 'nullable|numeric|min:0',
                'next_visit_date' => 'nullable|date',
                'status' => 'nullable|string|max:50'
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validator->errors()
                ], 422);
            }

            $pet = Pet::findOrFail($petId);
            $user = $request->user();

            $record = MedicalRecord::create([
                'pet_id' => $petId,
                'customer_id' => $pet->customer_id,
                'veterinarian_id' => $user->id,
                'visit_date' => $request->visit_date ?? now(),
                'chief_complaint' => $request->service_type ?: 'General Consultation',
                'symptoms' => $request->symptoms,
                'diagnosis' => $request->diagnosis,
                'treatment_plan' => $request->treatment,
                'notes' => $request->notes,
                'weight_kg' => $request->weight,
                'temperature_celsius' => $request->temperature,
                'status' => $request->status ?? 'completed',
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Medical record created successfully',
                'data' => [
                    'id' => $record->id,
                    'date' => $record->visit_date->format('Y-m-d'),
                    'visit_date' => $record->visit_date->format('Y-m-d'),
                    'title' => $record->chief_complaint,
                    'service_name' => $record->chief_complaint,
                    'diagnosis' => $record->diagnosis,
                    'treatment' => $record->treatment_plan,
                    'veterinarian' => [
                        'id' => $user->id,
                        'name' => $user->name
                    ]
                ]
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create medical record: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get medical history for a specific pet (customer read-only)
     */
    public function indexByCustomer($petId)
    {
        try {
            $user = request()->user();
            
            // Find the pet and verify it belongs to the authenticated customer
            $pet = Pet::with(['customer'])->findOrFail($petId);
            
            // Verify the pet belongs to the authenticated customer
            // pet.customer_id references the customers table; user.id references users table.
            // The Customer model links to User via user_id.
            if (!$pet->customer || $pet->customer->user_id !== $user->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Pet not found or does not belong to you'
                ], 404);
            }

            // Get medical records for this pet
            $records = MedicalRecord::with(['veterinarian'])
                ->where('pet_id', $petId)
                ->orderBy('visit_date', 'desc')
                ->get()
                ->map(function ($record) {
                    return [
                        'id' => $record->id,
                        'date' => $record->visit_date ? $record->visit_date->format('Y-m-d') : null,
                        'visit_date' => $record->visit_date ? $record->visit_date->format('Y-m-d') : null,
                        'title' => $record->chief_complaint ?: 'Medical Consultation',
                        'service_name' => $record->chief_complaint ?: 'Medical Consultation',
                        'service_type' => $record->chief_complaint ?: 'Medical Consultation',
                        'diagnosis' => $record->diagnosis ?: 'No diagnosis stated.',
                        'symptoms' => $record->symptoms ?: 'No symptoms recorded.',
                        'treatment' => $record->treatment_plan ?: $record->physical_examination ?: 'No treatment stated.',
                        'prescription' => '',
                        'notes' => $record->notes ?: $record->follow_up_instructions ?: '',
                        'remarks' => $record->notes ?: $record->follow_up_instructions ?: '',
                        'weight' => $record->weight_kg ? (string) $record->weight_kg : '',
                        'temperature' => $record->temperature_celsius ? (string) $record->temperature_celsius : '',
                        'next_visit_date' => null,
                        'status' => $record->status ?: 'completed',
                        'veterinarian' => [
                            'id' => $record->veterinarian?->id,
                            'name' => $record->veterinarian?->name ?: 'Veterinary Staff'
                        ],
                        'created_at' => $record->created_at ? $record->created_at->format('Y-m-d') : null
                    ];
                });

            return response()->json([
                'success' => true,
                'data' => $records
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch medical history: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get vaccinations for a specific pet
     */
    public function petVaccinations($petId)
    {
        $pet = Pet::with(['customer'])->findOrFail($petId);
        
        $vaccinations = Vaccination::with(['veterinarian', 'medicalRecord'])
            ->where('pet_id', $petId)
            ->orderBy('date_administered', 'desc')
            ->get();

        return response()->json([
            'pet' => $pet,
            'vaccinations' => $vaccinations
        ]);
    }

    /**
     * Create standalone vaccination record (not linked to a medical record)
     */
    public function createVaccination(Request $request, $petId)
    {
        $pet = Pet::findOrFail($petId);
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'vaccine_name' => 'required|string|max:255',
            'vaccine_type' => 'nullable|string|in:Core,Non-core,Lifestyle',
            'manufacturer' => 'nullable|string|max:255',
            'lot_number' => 'nullable|string|max:255',
            'date_administered' => 'required|date',
            'next_due_date' => 'nullable|date|after:date_administered',
            'dosage' => 'nullable|numeric',
            'dosage_unit' => 'nullable|string|max:50',
            'route_of_administration' => 'nullable|string|max:255',
            'site_of_administration' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $vaccination = Vaccination::create([
            'pet_id' => $petId,
            'medical_record_id' => null,
            'veterinarian_id' => $user->id,
            'vaccine_name' => $request->vaccine_name,
            'vaccine_type' => $request->vaccine_type ?? 'Core',
            'manufacturer' => $request->manufacturer,
            'lot_number' => $request->lot_number,
            'date_administered' => $request->date_administered,
            'next_due_date' => $request->next_due_date,
            'dosage' => $request->dosage,
            'dosage_unit' => $request->dosage_unit ?? 'mL',
            'route_of_administration' => $request->route_of_administration ?? 'Subcutaneous',
            'site_of_administration' => $request->site_of_administration,
            'notes' => $request->notes,
            'status' => 'given',
        ]);

        return response()->json([
            'message' => 'Vaccination record created successfully',
            'vaccination' => $vaccination->load(['veterinarian'])
        ], 201);
    }

    /**
     * Create a prescription
     */
    private function createPrescription(MedicalRecord $record, array $data, $user): Prescription
    {
        return Prescription::create([
            'medical_record_id' => $record->id,
            'veterinarian_id' => $user->id,
            'medication_name' => $data['medication_name'],
            'generic_name' => $data['generic_name'] ?? null,
            'medication_type' => $data['medication_type'] ?? null,
            'dosage' => $data['dosage'],
            'dosage_unit' => $data['dosage_unit'],
            'frequency' => $data['frequency'],
            'duration' => $data['duration'],
            'route' => $data['route'] ?? null,
            'instructions' => $data['instructions'] ?? null,
            'quantity_prescribed' => $data['quantity_prescribed'],
            'quantity_unit' => $data['quantity_unit'],
            'refills_allowed' => $data['refills_allowed'] ?? 0,
            'refills_remaining' => $data['refills_allowed'] ?? 0,
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'] ?? null,
            'side_effects_notes' => $data['side_effects_notes'] ?? null,
        ]);
    }

    /**
     * Update a prescription
     */
    private function updatePrescription($id, array $data): Prescription
    {
        $prescription = Prescription::findOrFail($id);
        
        if (!$prescription->canBeEditedBy(request()->user())) {
            throw new \Exception('Cannot edit this prescription');
        }

        $prescription->update($data);
        return $prescription;
    }

    /**
     * Record inventory usage for veterinary appointment
     */
    public function recordInventoryUsage(Request $request, int $appointmentId)
    {
        // Validate appointment access
        $appointment = Appointment::findOrFail($appointmentId);
        if (!$this->vetCanUseAppointment($request, $appointment)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to access this appointment'
            ], 403);
        }

        $items = collect($request->input('items', []))
            ->map(function ($item) {
                if (!is_array($item)) {
                    return $item;
                }

                if (!array_key_exists('quantity_used', $item) && array_key_exists('quantity', $item)) {
                    $item['quantity_used'] = $item['quantity'];
                }

                if (!array_key_exists('notes', $item) && array_key_exists('reason', $item)) {
                    $item['notes'] = $item['reason'];
                }

                return $item;
            })
            ->values()
            ->all();

        $validator = Validator::make([
            'items' => $items,
            'general_notes' => $request->input('general_notes'),
        ], [
            'items' => 'present|array',
            'items.*.inventory_item_id' => 'required|integer|exists:inventory_items,id',
            'items.*.quantity_used' => 'required|integer|min:1',
            'items.*.notes' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $result = $this->veterinaryInventoryService->recordInventoryUsage(
                $items,
                $appointmentId,
                $appointment->pet_id,
                'Veterinary appointment: ' . ($request->input('general_notes') ?? 'Medical supplies usage'),
                $request->user()?->id
            );

            if ($result['success']) {
                return response()->json([
                    'success' => true,
                    'message' => $result['message'],
                    'usages' => $result['usages'],
                    'total_items' => $result['total_items'],
                    'processed_items' => $result['processed_items']
                ]);
            } else {
                return response()->json([
                    'success' => false,
                    'message' => $result['message'],
                    'errors' => $result['errors']
                ], 422);
            }
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to record inventory usage: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get available service consumable items for veterinary
     */
    public function getAvailableItems(Request $request)
    {
        try {
            $items = $this->veterinaryInventoryService->getAvailableServiceItems();
            
            return response()->json([
                'success' => true,
                'items' => $items
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch available items: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get inventory usage history for an appointment
     */
    public function getUsageHistory(int $appointmentId)
    {
        try {
            $appointment = Appointment::findOrFail($appointmentId);
            
            // Check access
            if (!$this->vetCanUseAppointment(request(), $appointment)) {
                return response()->json([
                    'success' => false,
                    'message' => 'You do not have permission to access this appointment'
                ], 403);
            }

            $history = $this->veterinaryInventoryService->getAppointmentUsageHistory($appointmentId);
            
            return response()->json([
                'success' => true,
                'history' => $history,
                'appointment_id' => $appointmentId,
                'pet_id' => $appointment->pet_id
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch usage history: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Add a vaccination to a medical record
     */
    private function addVaccinationToRecord(MedicalRecord $record, array $data, $user): Vaccination
    {
        return Vaccination::create([
            'pet_id' => $record->pet_id,
            'medical_record_id' => $record->id,
            'veterinarian_id' => $user->id,
            'vaccine_name' => $data['vaccine_name'],
            'vaccine_type' => $data['vaccine_type'] ?? null,
            'manufacturer' => $data['manufacturer'] ?? null,
            'lot_number' => $data['lot_number'] ?? null,
            'date_administered' => $data['date_administered'],
            'next_due_date' => $data['next_due_date'] ?? null,
            'dosage' => $data['dosage'] ?? null,
            'dosage_unit' => $data['dosage_unit'] ?? 'mL',
            'route_of_administration' => $data['route_of_administration'] ?? null,
            'site_of_administration' => $data['site_of_administration'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);
    }

    /**
     * Update a vaccination
     */
    private function updateVaccinationRecord($id, array $data): Vaccination
    {
        $vaccination = Vaccination::findOrFail($id);
        
        if (!$vaccination->canBeEditedBy(request()->user())) {
            throw new \Exception('Cannot edit this vaccination');
        }

        $vaccination->update($data);
        return $vaccination;
    }
}
