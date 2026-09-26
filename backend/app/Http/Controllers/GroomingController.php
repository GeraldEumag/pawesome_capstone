<?php

namespace App\Http\Controllers;

use App\Models\GroomingAppointment;
use App\Models\Customer;
use App\Models\Pet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class GroomingController extends Controller
{
    private function currentCustomerId(): ?int
    {
        $user = auth()->user();

        if (!$user) {
            return null;
        }

        return Customer::where('user_id', $user->id)
            ->orWhere('email', $user->email)
            ->value('id');
    }

    private function customerOwnsAppointment(GroomingAppointment $appointment): bool
    {
        $customerId = $this->currentCustomerId();

        return $customerId && $appointment->pet_id
            && Pet::where('id', $appointment->pet_id)->where('customer_id', $customerId)->exists();
    }

    /**
     * List all grooming appointments with filters
     */
    public function index(Request $request): JsonResponse
    {
        $query = GroomingAppointment::query();

        // Filter by customer (for customer view)
        if (auth()->check() && auth()->user()->role === 'customer') {
            $customerId = $this->currentCustomerId();
            $query->whereHas('pet', function ($q) use ($customerId) {
                $q->where('customer_id', $customerId ?? 0);
            });
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by date
        if ($request->has('date')) {
            $query->whereDate('appointment_date', $request->date);
        }

        // Filter by date range
        if ($request->has('date_from')) {
            $query->where('appointment_date', '>=', $request->date_from);
        }
        if ($request->has('date_to')) {
            $query->where('appointment_date', '<=', $request->date_to);
        }

        $appointments = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'appointments' => $appointments,
            'summary' => [
                'total' => GroomingAppointment::count(),
                'pending' => GroomingAppointment::pending()->count(),
                'approved' => GroomingAppointment::approved()->count(),
                'completed' => GroomingAppointment::completed()->count(),
            ]
        ]);
    }

    /**
     * Create new grooming appointment
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'petId' => 'nullable|exists:pets,id',
            'petName' => 'required|string|max:100',
            'service' => 'required|string|in:bath,haircut,nailTrim',
            'date' => 'required|date|after_or_equal:today',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        if (auth()->user()?->role === 'customer' && $request->petId) {
            $customerId = $this->currentCustomerId();

            if (!Pet::where('id', $request->petId)->where('customer_id', $customerId ?? 0)->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Pet not found',
                ], 404);
            }
        }

        $appointment = GroomingAppointment::create([
            'pet_id' => $request->petId,
            'pet_name' => $request->petName,
            'service' => $request->service,
            'appointment_date' => $request->date,
            'notes' => $request->notes,
            'status' => 'pending',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Grooming appointment submitted successfully',
            'appointment' => $appointment,
        ], 201);
    }

    /**
     * Get single grooming appointment
     */
    public function show($id): JsonResponse
    {
        $appointment = GroomingAppointment::find($id);

        if (!$appointment) {
            return response()->json([
                'success' => false,
                'message' => 'Appointment not found'
            ], 404);
        }

        if (auth()->user()?->role === 'customer' && !$this->customerOwnsAppointment($appointment)) {
            return response()->json([
                'success' => false,
                'message' => 'Appointment not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'appointment' => $appointment
        ]);
    }

    /**
     * Update grooming appointment status
     */
    public function updateStatus(Request $request, $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:pending,approved,rejected,completed,cancelled',
            'reason' => 'required_if:status,rejected|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid status',
                'errors' => $validator->errors()
            ], 422);
        }

        $appointment = GroomingAppointment::find($id);

        if (!$appointment) {
            return response()->json([
                'success' => false,
                'message' => 'Appointment not found'
            ], 404);
        }

        // Check for double booking conflicts when approving or scheduling
        if (in_array($request->status, ['approved', 'scheduled'])) {
            $conflictingAppointment = GroomingAppointment::where('appointment_date', $appointment->appointment_date)
                ->whereIn('status', ['approved', 'scheduled', 'in_progress'])
                ->where('id', '!=', $appointment->id)
                ->first();

            if ($conflictingAppointment) {
                return response()->json([
                    'success' => false,
                    'message' => 'This grooming slot is already reserved.',
                    'conflict_with' => $conflictingAppointment->id,
                    'conflict_date' => $conflictingAppointment->appointment_date
                ], 422);
            }
        }

        $update = ['status' => $request->status];
        if ($request->status === 'rejected' && $request->filled('reason')) {
            $update['notes'] = trim(($appointment->notes ? $appointment->notes . "\n" : '') . '[Rejected] ' . $request->reason);
        }
        $appointment->update($update);

        return response()->json([
            'success' => true,
            'message' => 'Appointment status updated successfully',
            'appointment' => $appointment
        ]);
    }

    /**
     * Archive grooming appointment (replaces delete)
     */
    public function destroy($id): JsonResponse
    {
        $appointment = GroomingAppointment::find($id);
        
        if (!$appointment) {
            return response()->json([
                'success' => false,
                'message' => 'Appointment not found'
            ], 404);
        }
        
        // Check for active dependencies before archiving
        if ($appointment->status === 'completed' || $appointment->status === 'no_show') {
            return response()->json([
                'success' => false,
                'message' => 'Cannot archive completed or no-show appointment. Please cancel or reschedule first.'
            ], 422);
        }
        
        // Archive the appointment
        $appointment->update([
            'status' => 'archived',
            'archived_at' => now(),
            'archived_by' => auth()->id(),
            'archive_reason' => 'Archived via grooming management'
        ]);
        
        return response()->json([
            'success' => true,
            'message' => 'Grooming appointment archived successfully',
            'data' => $appointment->fresh()
        ]);
    }
}
