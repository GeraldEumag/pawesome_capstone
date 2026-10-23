<?php

namespace App\Http\Controllers\Veterinary;

use App\Http\Controllers\Controller;
use App\Models\Dispensation;
use App\Services\DispensingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class DispensationController extends Controller
{
    /** Dispensations linked to an appointment or confinement. */
    public function index(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'appointment_id' => 'required_without:medical_confinement_id|exists:appointments,id',
            'medical_confinement_id' => 'required_without:appointment_id|exists:medical_confinements,id',
        ]);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $query = Dispensation::with(['item:id,name,sku,item_class', 'batch:id,batch_no,expiration_date', 'prescription:id,medication_name', 'dispensedBy:id,name'])
            ->latest();

        if ($request->filled('appointment_id')) {
            $query->where('appointment_id', $request->appointment_id);
        }
        if ($request->filled('medical_confinement_id')) {
            $query->where('medical_confinement_id', $request->medical_confinement_id);
        }

        return response()->json(['dispensations' => $query->get()]);
    }

    /** Dispense take-home medication. Stock moves on this confirm. */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'inventory_item_id' => 'required|exists:inventory_items,id',
            'inventory_batch_id' => 'nullable|exists:inventory_batches,id',
            'prescription_id' => 'nullable|exists:prescriptions,id',
            'appointment_id' => 'nullable|exists:appointments,id',
            'medical_confinement_id' => 'nullable|exists:medical_confinements,id',
            'pet_id' => 'nullable|exists:pets,id',
            'customer_id' => 'nullable|exists:customers,id',
            'quantity' => 'required|integer|min:1',
            'unit' => 'nullable|string|max:30',
            'label_text' => 'nullable|string|max:500',
            'directions' => 'nullable|string|max:2000',
            'witness_id' => 'nullable|exists:users,id',
            'notes' => 'nullable|string|max:500',
        ]);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $dispensation = DispensingService::dispense($validator->validated(), $request->user()->id);
            return response()->json(['dispensation' => $dispensation], 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }
    }

    /** Mark that the owner/patient was counselled on the medication. */
    public function counsel(Request $request, int $id): JsonResponse
    {
        try {
            $dispensation = DispensingService::counsel(Dispensation::findOrFail($id), $request->user()->id);
            return response()->json(['dispensation' => $dispensation]);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }
    }
}
