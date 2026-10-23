<?php

namespace App\Http\Controllers\Veterinary;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\MedicalConfinement;
use App\Models\VisitConsent;
use App\Services\VisitConsentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class VisitConsentController extends Controller
{
    public function index(int $appointmentId): JsonResponse
    {
        $consents = VisitConsent::where('consentable_type', 'appointment')
            ->where('consentable_id', $appointmentId)
            ->with('signedBy:id,name')
            ->orderByDesc('signed_at')
            ->get();

        return response()->json(['success' => true, 'consents' => $consents]);
    }

    /**
     * Record a consent signed at the counter. consentable_type may be
     * 'appointment' or 'medical_confinement'.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'consentable_type' => 'required|in:appointment,medical_confinement',
            'consentable_id' => 'required|integer|min:1',
            'type' => 'required|in:general_treatment,surgery,anesthesia,confinement,euthanasia,other',
            'title' => 'required|string|max:255',
            'body' => 'nullable|string',
            'signer_name' => 'required|string|max:255',
            'signer_relationship' => 'nullable|string|max:60',
        ]);
        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $type = $request->input('consentable_type');
        $id = (int) $request->input('consentable_id');
        $exists = $type === 'appointment'
            ? Appointment::whereKey($id)->exists()
            : MedicalConfinement::whereKey($id)->exists();
        if (!$exists) {
            return response()->json(['success' => false, 'message' => 'Consent subject not found'], 404);
        }

        $consent = VisitConsentService::record(array_merge($validator->validated(), [
            'channel' => 'counter',
        ]), $request->user());

        return response()->json(['success' => true, 'consent' => $consent], 201);
    }

    public function revoke(Request $request, int $id): JsonResponse
    {
        $validator = Validator::make($request->all(), ['reason' => 'required|string|max:500']);
        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'A revocation reason is required', 'errors' => $validator->errors()], 422);
        }

        $consent = VisitConsent::findOrFail($id);
        $consent = VisitConsentService::revoke($consent, $request->user()->id, $request->input('reason'));

        return response()->json(['success' => true, 'consent' => $consent]);
    }
}
