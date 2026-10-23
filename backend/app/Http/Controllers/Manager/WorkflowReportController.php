<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\HotelRoom;
use App\Models\MedicalConfinement;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class WorkflowReportController extends Controller
{
    public function boarding(): JsonResponse
    {
        $records = Boarding::with(['customer', 'pet', 'hotelRoom'])
            ->where('stay_type', 'hotel_boarding')
            ->latest()
            ->limit(100)
            ->get();

        return response()->json([
            'summary' => [
                'total' => Boarding::where('stay_type', 'hotel_boarding')->count(),
                'active' => Boarding::whereIn('status', ['checked_in', 'in_care'])->count(),
                'pending' => Boarding::where('status', 'pending')->count(),
                'completed' => Boarding::where('status', 'completed')->count(),
                'revenue' => Boarding::where('payment_status', 'paid')->sum('total_amount'),
            ],
            'boarding_requests' => $records,
        ]);
    }

    public function medicalConfinement(): JsonResponse
    {
        $records = MedicalConfinement::with(['consultation', 'customer', 'pet', 'veterinarian', 'room'])
            ->latest()
            ->limit(100)
            ->get();

        return response()->json([
            'summary' => [
                'total' => MedicalConfinement::count(),
                'active' => MedicalConfinement::whereIn('status', ['admitted', 'under_observation', 'under_treatment'])->count(),
                'ready_for_discharge' => MedicalConfinement::where('status', 'ready_for_discharge')->count(),
                'completed' => MedicalConfinement::whereIn('status', ['discharged', 'completed'])->count(),
                'revenue' => MedicalConfinement::where('payment_status', 'paid')->sum(DB::raw('COALESCE(final_amount, estimated_cost, 0)')),
            ],
            'medical_confinements' => $records,
        ]);
    }

    public function roomOccupancy(): JsonResponse
    {
        $rooms = HotelRoom::withCount([
            'boardings as active_boardings_count' => fn ($q) => $q->whereIn('status', ['checked_in', 'in_care']),
            'medicalConfinements as active_confinements_count' => fn ($q) => $q->whereIn('status', ['admitted', 'under_observation', 'under_treatment']),
        ])->get();

        return response()->json([
            'summary' => [
                'total_rooms' => $rooms->count(),
                'available' => $rooms->where('status', 'available')->count(),
                'occupied' => $rooms->where('status', 'occupied')->count(),
                'maintenance' => $rooms->where('status', 'maintenance')->count(),
            ],
            'rooms' => $rooms,
        ]);
    }

    public function veterinaryServices(): JsonResponse
    {
        // Visit status vocabulary: requested → scheduled → checked_in
        // → in_consultation → clinical_complete → checkout → completed.
        return response()->json([
            'summary' => [
                'consultations' => Appointment::count(),
                'requested' => Appointment::where('status', 'requested')->count(),
                'scheduled' => Appointment::where('status', 'scheduled')->count(),
                'in_intake' => Appointment::whereIn('status', \App\Support\VeterinaryStatus::INTAKE)->count(),
                'in_consultation' => Appointment::whereIn('status', \App\Support\VeterinaryStatus::STARTED)->count(),
                'awaiting_checkout' => Appointment::whereIn('status', ['clinical_complete', 'checkout'])->count(),
                'confinement_recommended' => Appointment::where('confinement_recommended', true)->count(),
                'completed' => Appointment::where('status', 'completed')->count(),
            ],
            'consultations' => Appointment::with(['customer', 'pet', 'veterinarian', 'medicalConfinements'])
                ->latest('scheduled_at')
                ->limit(100)
                ->get(),
        ]);
    }
}
