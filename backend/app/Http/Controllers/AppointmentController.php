<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Sale;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Models\Grooming;
use App\Models\Service;
use App\Models\MedicalRecord;
use App\Models\ServiceItemUsage;
use App\Services\WorkflowNotifier;
use App\Services\BookingAvailabilityService;
use App\Services\ServiceBillingService;
use App\Services\ServiceDurationService;
use App\Services\PaymentVerificationService;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Carbon;

class AppointmentController extends Controller
{
    private const ACTIVE_APPOINTMENT_STATUSES = [
        Appointment::STATUS_IN_PROGRESS,
        Appointment::STATUS_IN_CONSULTATION,
        Appointment::STATUS_NEEDS_CONFINEMENT,
        Appointment::STATUS_TREATED,
        Appointment::STATUS_AWAITING_PAYMENT,
    ];

    private function currentCustomer(Request $request): ?Customer
    {
        $user = $request->user();

        if (!$user) {
            return null;
        }

        return Customer::where('user_id', $user->id)
            ->orWhere('email', $user->email)
            ->first();
    }

    private function scopeAppointmentsForRole($query, Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->role === 'customer') {
            return $query->where('customer_id', $this->currentCustomer($request)?->id ?? 0);
        }

        if (in_array($user->role, ['veterinary', 'vet', 'veterinarian'], true)) {
            return $query->where('veterinarian_id', $user->id);
        }

        return $query;
    }

    private function canAccessAppointment(Request $request, Appointment $appointment): bool
    {
        $user = $request->user();

        if (!$user) {
            return false;
        }

        if ($user->role === 'customer') {
            $customer = $this->currentCustomer($request);

            return $customer && (int) $appointment->customer_id === (int) $customer->id;
        }

        if (in_array($user->role, ['veterinary', 'vet', 'veterinarian'], true)) {
            return (int) $appointment->veterinarian_id === (int) $user->id;
        }

        return true;
    }

    /**
     * List all appointments with filters
     */
    public function index(Request $request)
    {
        $query = Appointment::with(['customer', 'pet', 'service', 'veterinarian']);
        $query = $this->scopeAppointmentsForRole($query, $request);
        
        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }
        
        // Filter by date range
        if ($request->has('from_date')) {
            $query->whereDate('scheduled_at', '>=', $request->input('from_date'));
        }
        if ($request->has('to_date')) {
            $query->whereDate('scheduled_at', '<=', $request->input('to_date'));
        }
        
        // Filter by veterinarian
        if ($request->has('veterinarian_id')) {
            $query->where('veterinarian_id', $request->input('veterinarian_id'));
        }
        
        // Filter by customer
        if ($request->has('customer_id')) {
            $query->where('customer_id', $request->input('customer_id'));
        }
        
        $appointments = $query->orderBy('scheduled_at')->get();
        
        return response()->json($appointments);
    }

    /**
     * Get single appointment details
     */
    public function show(Request $request, $id)
    {
        $appointment = Appointment::with(['customer', 'pet', 'service', 'veterinarian'])->find($id);
        
        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (!$this->canAccessAppointment($request, $appointment)) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }
        
        return response()->json($appointment);
    }

    /**
     * Create new appointment
     */
    public function store(Request $request)
    {
        if ($request->user()?->role === 'customer') {
            $customer = $this->currentCustomer($request);

            if (!$customer) {
                return response()->json(['message' => 'Customer not found'], 404);
            }

            $request->merge(['customer_id' => $customer->id]);
        } elseif (in_array($request->user()?->role, ['veterinary', 'vet', 'veterinarian'], true)) {
            $request->merge(['veterinarian_id' => $request->user()->id]);
        }

        $validator = Validator::make($request->all(), [
            'customer_id' => 'required|integer|exists:customers,id',
            'pet_id' => 'required|integer|exists:pets,id',
            'service_id' => 'required|integer|exists:services,id',
            'veterinarian_id' => 'nullable|integer|exists:users,id',
            'scheduled_at' => 'required|date|after:now',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if (!Pet::where('id', $request->pet_id)->where('customer_id', $request->customer_id)->exists()) {
            return response()->json(['message' => 'Pet not found for this customer'], 422);
        }

        $scheduledAt = ServiceDurationService::inStoreTimezone($request->scheduled_at);
        $date = $scheduledAt->format('Y-m-d');
        $time = $scheduledAt->format('H:i');
        $service = Service::find($request->service_id);

        $appointment = DB::transaction(function () use ($request, $date, $time, $service, $scheduledAt) {
            Service::query()->orderBy('id')->lockForUpdate()->first();
            $lockedService = Service::find($request->service_id);
            $serviceType = strtolower((string) $lockedService?->category) === 'grooming' ? 'grooming' : 'veterinary';
            if (!BookingAvailabilityService::isServiceTimeAvailable($serviceType, $date, $time, $lockedService?->name, $request->veterinarian_id)) {
                return null;
            }

            $appointment = Appointment::create([
                'customer_id' => $request->customer_id,
                'pet_id' => $request->pet_id,
                'service_id' => $request->service_id,
                'veterinarian_id' => $request->veterinarian_id,
                'status' => $request->user()?->hasRoleAccess('veterinary', 'vet', 'veterinarian')
                    ? 'approved'
                    : ($request->user()?->hasRoleAccess('receptionist', 'admin')
                        ? 'approved'
                        : 'pending'),
                'scheduled_at' => $scheduledAt->copy()->utc(),
                'notes' => $request->notes,
                'price' => $lockedService?->price ?? $service?->price ?? 0,
                'booking_channel' => \App\Support\BookingChannel::forUser($request->user()),
            ]);

            // Automatically create grooming record if service category is Grooming
            if ($lockedService && $lockedService->category === 'Grooming') {
                $groomingPrice = (float) ($lockedService->price ?? 0);
                Grooming::create([
                    'customer_id' => $request->customer_id,
                    'pet_id' => $request->pet_id,
                    'service' => $lockedService->name,
                    'appointment_date' => $scheduledAt->toDateString(),
                    'appointment_time' => $scheduledAt->toTimeString(),
                    'notes' => $request->notes,
                    'amount' => $groomingPrice,
                    'base_amount' => $groomingPrice,
                    'total_amount' => $groomingPrice,
                    'amount_paid' => 0,
                    'balance_due' => $groomingPrice,
                    'payment_status' => 'unpaid',
                    'status' => 'pending',
                    'booking_channel' => \App\Support\BookingChannel::forUser($request->user()),
                ]);
            }

            return $appointment;
        });

        if (!$appointment) {
            return response()->json([
                'success' => false,
                'message' => 'This schedule is no longer available. Please choose another slot.',
                'errors' => ['scheduled_at' => ['Time slot overlaps an existing booking.']],
            ], 422);
        }

        return response()->json([
            'message' => 'Appointment created successfully',
            'appointment' => $appointment->load(['customer', 'pet', 'service'])
        ], 201);
    }

    /**
     * Approve appointment (receptionist/manager)
     */
    public function approve(Request $request, $id)
    {
        $appointment = Appointment::find($id);
        
        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if ($appointment->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending appointments can be approved',
                'current_status' => $appointment->status
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'veterinarian_id' => 'required|integer|exists:users,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Verify the assigned user is a veterinarian
        $vet = User::find($request->veterinarian_id);
        if (!in_array($vet->role, ['veterinary', 'vet', 'veterinarian'], true)) {
            return response()->json(['message' => 'Assigned user must be a veterinarian'], 422);
        }

        // Check for double booking conflicts
        $conflictingAppointment = Appointment::where('veterinarian_id', $request->veterinarian_id)
            ->where('scheduled_at', $appointment->scheduled_at)
            ->whereIn('status', ['approved', 'scheduled', 'in_progress', 'in_consultation'])
            ->where('id', '!=', $appointment->id)
            ->first();

        if ($conflictingAppointment) {
            return response()->json([
                'message' => 'This veterinarian already has an appointment at the selected date and time.',
                'conflict_with' => $conflictingAppointment->id,
                'conflict_time' => $conflictingAppointment->scheduled_at
            ], 422);
        }

        $appointment->update([
            'status' => 'approved',
            'veterinarian_id' => $request->veterinarian_id,
            'payment_status' => $appointment->payment_status === 'paid' ? 'paid' : 'unpaid',
        ]);

        $this->ensureBaseBillingItem($appointment);

        WorkflowNotifier::notifyUser(
            $appointment->veterinarian_id,
            'Vet Appointment Scheduled',
            "Appointment #{$appointment->id} has been assigned to you.",
            'info',
            'appointment',
            $appointment->id
        );

        ActivityLog::log(auth()->id(), 'appointment_approved', "Appointment #{$appointment->id} approved", [
            'category' => 'appointments',
            'reference_type' => 'appointment',
            'reference_id' => $appointment->id,
        ]);

        return response()->json([
            'message' => 'Appointment approved and veterinarian assigned',
            'appointment' => $appointment->load(['customer', 'pet', 'service', 'veterinarian'])
        ]);
    }

    private function persistVeterinaryScheduleChange(Request $request, int $id, array $changes, array $allowedStatuses): array
    {
        return DB::transaction(function () use ($request, $id, $changes, $allowedStatuses) {
            Service::query()->orderBy('id')->lockForUpdate()->first();
            $appointment = Appointment::with('service')->whereKey($id)->lockForUpdate()->first();

            if (!$appointment || !$this->canAccessAppointment($request, $appointment)) {
                return ['http_status' => 404, 'body' => ['message' => 'Appointment not found']];
            }

            if (!in_array($appointment->status, $allowedStatuses, true)) {
                return ['http_status' => 422, 'body' => [
                    'message' => 'Cannot update appointment with status: ' . $appointment->status,
                    'allowed_statuses' => $allowedStatuses,
                ]];
            }

            $service = Service::find($changes['service_id'] ?? $appointment->service_id);
            if (!$service) {
                return ['http_status' => 422, 'body' => ['errors' => ['service_id' => ['The selected service is invalid.']]]];
            }

            $scheduledAt = ServiceDurationService::inStoreTimezone($changes['scheduled_at'] ?? $appointment->scheduled_at);
            if (!BookingAvailabilityService::isServiceTimeAvailable(
                'veterinary',
                $scheduledAt->format('Y-m-d'),
                $scheduledAt->format('H:i'),
                $service->name,
                $appointment->veterinarian_id,
                $appointment->id,
                $appointment->service_request_id
            )) {
                return ['http_status' => 422, 'body' => [
                    'success' => false,
                    'message' => 'This schedule is no longer available. Please choose another slot.',
                    'errors' => ['scheduled_at' => ['Time slot overlaps an existing booking.']],
                ]];
            }

            if (array_key_exists('_reschedule_reason', $changes)) {
                $reason = $changes['_reschedule_reason'];
                unset($changes['_reschedule_reason']);
                $changes['notes'] = $appointment->notes . "\n[Rescheduled from {$appointment->scheduled_at}]: {$reason}";
            }

            if (array_key_exists('scheduled_at', $changes)) {
                $changes['scheduled_at'] = $scheduledAt->copy()->utc();
            }
            $appointment->update($changes);

            if (array_key_exists('scheduled_at', $changes) && $appointment->service_request_id) {
                $serviceRequest = ServiceRequest::whereKey($appointment->service_request_id)
                    ->lockForUpdate()
                    ->first();
                if ($serviceRequest) {
                    $date = $scheduledAt->toDateString();
                    $time = $scheduledAt->format('H:i');
                    $serviceRequest->update([
                        'request_date' => $date,
                        'request_time' => $time,
                        'preferred_date' => $date,
                        'preferred_time' => $time,
                    ]);
                }
            }

            return ['appointment' => $appointment->fresh(['customer', 'pet', 'service', 'veterinarian'])];
        });
    }

    /**
     * Reschedule appointment
     */
    public function reschedule(Request $request, $id)
    {
        $appointment = Appointment::find($id);
        
        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (!$appointment->canBeRescheduled()) {
            return response()->json([
                'message' => 'Cannot reschedule appointment with status: ' . $appointment->status,
                'allowed_statuses' => ['pending', 'approved']
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'scheduled_at' => 'required|date|after:now',
            'reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $changes = [
            'scheduled_at' => $request->scheduled_at,
            '_reschedule_reason' => $request->reason ?: 'No reason provided',
        ];

        if (strtolower((string) $appointment->service?->category) === 'grooming') {
            $oldDate = $appointment->scheduled_at;
            $changes['scheduled_at'] = ServiceDurationService::inStoreTimezone($request->scheduled_at)->copy()->utc();
            unset($changes['_reschedule_reason']);
            $changes['notes'] = $appointment->notes . "\n[Rescheduled from {$oldDate}]: " . ($request->reason ?: 'No reason provided');
            $appointment->update($changes);
        } else {
            $result = $this->persistVeterinaryScheduleChange($request, (int) $appointment->id, $changes, ['pending', 'approved']);
            if (isset($result['http_status'])) {
                return response()->json($result['body'], $result['http_status']);
            }
            $appointment = $result['appointment'];
        }

        return response()->json([
            'message' => 'Appointment rescheduled successfully',
            'appointment' => $appointment->load(['customer', 'pet', 'service', 'veterinarian'])
        ]);
    }

    /**
     * Cancel appointment
     */
    public function cancel(Request $request, $id)
    {
        $appointment = Appointment::find($id);
        
        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (!$appointment->canBeCancelled()) {
            return response()->json([
                'message' => 'Cannot cancel appointment with status: ' . $appointment->status,
                'allowed_statuses' => ['pending', 'approved', 'scheduled', 'in_progress', 'in_consultation', 'needs_confinement', 'treated', 'awaiting_payment']
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:500',
            'cancellation_reason_code' => 'nullable|in:' . implode(',', array_keys(Appointment::CANCELLATION_REASONS)),
            'cancellation_note' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // A reason is mandatory for every cancellation: a predefined dropdown
        // code ('other' requires an explanation) or a free-text reason.
        $reasonResult = $this->resolveCancellationReason($request);
        if ($reasonResult['error']) {
            return response()->json([
                'message' => $reasonResult['error'],
                'errors' => ['reason' => [$reasonResult['error']]],
            ], 422);
        }

        $oldStatus = $appointment->status;
        $appointment->status = 'cancelled';
        $appointment->cancellation_reason = $reasonResult['reason'];
        $appointment->save();

        if ($appointment->service_request_id) {
            ServiceRequest::where('id', $appointment->service_request_id)
                ->whereNotIn('status', ['completed'])
                ->update([
                    'status' => 'cancelled',
                    'rejection_reason' => $appointment->cancellation_reason,
                ]);
        }

        return response()->json([
            'message' => 'Appointment cancelled successfully',
            'appointment' => $appointment->load(['customer', 'pet', 'service', 'veterinarian']),
        ]);
    }

    /**
     * Resolve the stored cancellation reason from the request. Accepts a
     * predefined cancellation_reason_code (dropdown) — 'other' requires a
     * non-empty explanation — or a legacy free-text reason.
     */
    private function resolveCancellationReason(Request $request): array
    {
        $code = $request->input('cancellation_reason_code');
        $note = trim((string) ($request->input('cancellation_note') ?? ''));
        $freeText = trim((string) ($request->input('reason') ?? ''));

        if ($code !== null && $code !== '') {
            if ($code === 'other') {
                $explanation = $note !== '' ? $note : $freeText;
                if ($explanation === '') {
                    return ['error' => 'Please provide an explanation when cancelling for another reason.', 'reason' => null];
                }
                return ['error' => null, 'reason' => 'Other: ' . $explanation];
            }

            $label = Appointment::CANCELLATION_REASONS[$code] ?? null;
            if (!$label) {
                return ['error' => 'Invalid cancellation reason.', 'reason' => null];
            }

            $detail = $note !== '' ? $note : $freeText;
            return ['error' => null, 'reason' => $label . ($detail !== '' ? ' — ' . $detail : '')];
        }

        if ($freeText === '' && $note === '') {
            return ['error' => 'A cancellation reason is required.', 'reason' => null];
        }

        return ['error' => null, 'reason' => $freeText !== '' ? $freeText : $note];
    }

    /**
     * Reject appointment
     */
    public function reject(Request $request, $id)
    {
        $appointment = Appointment::find($id);
        
        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (!in_array($appointment->status, ['pending', 'approved'])) {
            return response()->json([
                'message' => 'Can only reject pending or approved appointments',
                'current_status' => $appointment->status
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $oldStatus = $appointment->status;
        $appointment->status = 'rejected';
        $appointment->cancellation_reason = $request->reason;
        $appointment->save();


        return response()->json([
            'message' => 'Appointment rejected successfully',
            'appointment' => $appointment->load(['customer', 'pet', 'service', 'veterinarian'])
        ]);
    }

    /**
     * Start appointment (veterinarian only)
     */
    public function start(Request $request, $id)
    {
        $appointment = Appointment::find($id);
        
        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (!$this->canAccessAppointment($request, $appointment)) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        // Only allow starting approved/scheduled appointments
        if (!in_array($appointment->status, ['approved', 'scheduled'])) {
            return response()->json([
                'message' => 'Only approved or scheduled appointments can be started',
                'current_status' => $appointment->status
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'notes' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $oldStatus = $appointment->status;
        $updateData = [
            'status' => 'in_progress',
            'started_at' => Carbon::now(),
        ];

        if ($request->has('notes')) {
            $updateData['notes'] = $appointment->notes . "\n[Started]: " . $request->notes;
        }

        $appointment->update($updateData);

        $medicalRecord = MedicalRecord::firstOrCreate(
            [
                'appointment_id' => $appointment->id,
                'pet_id' => $appointment->pet_id,
            ],
            [
                'veterinarian_id' => $request->user()->id,
                'visit_date' => Carbon::now(),
                'chief_complaint' => $appointment->notes,
                'status' => MedicalRecord::STATUS_DRAFT,
            ]
        );

        ActivityLog::log(auth()->id(), 'appointment_started', "Veterinary started appointment #{$appointment->id}", [
            'category' => 'veterinary',
            'reference_type' => 'appointment',
            'reference_id' => $appointment->id,
        ]);

        return response()->json([
            'message' => 'Appointment started successfully',
            'appointment' => $appointment->load(['customer', 'pet', 'service', 'veterinarian']),
            'medical_record' => $medicalRecord,
        ]);
    }

    /**
     * Update medical information (veterinarian only)
     */
    public function updateMedical(Request $request, $id)
    {
        $appointment = Appointment::find($id);
        
        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (!$this->canAccessAppointment($request, $appointment)) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        // Only allow updating medical info for appointments in progress
        if (!in_array($appointment->status, ['in_progress', 'in_consultation', 'needs_confinement', 'treated'])) {
            return response()->json([
                'message' => 'Can only update medical information for appointments in progress',
                'current_status' => $appointment->status
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'diagnosis' => 'nullable|string|max:2000',
            'treatment_notes' => 'nullable|string|max:2000',
            'prescription' => 'nullable|string|max:2000',
            'remarks' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $updateData = [];
        
        // Only update medical fields, NOT payment or inventory fields
        if ($request->has('diagnosis')) {
            $updateData['diagnosis'] = $request->diagnosis;
        }
        if ($request->has('treatment_notes')) {
            $updateData['treatment_notes'] = $request->treatment_notes;
        }
        if ($request->has('prescription')) {
            $updateData['prescription'] = $request->prescription;
        }
        if ($request->has('remarks')) {
            $updateData['remarks'] = $request->remarks;
        }

        $appointment->update($updateData);

        ActivityLog::log(auth()->id(), 'medical_info_updated', "Veterinary updated medical info for appointment #{$appointment->id}", [
            'category' => 'veterinary',
            'reference_type' => 'appointment',
            'reference_id' => $appointment->id,
        ]);

        return response()->json([
            'message' => 'Medical information updated successfully',
            'appointment' => $appointment->load(['customer', 'pet', 'service', 'veterinarian'])
        ]);
    }

    /**
     * Complete appointment (veterinarian)
     */
    public function complete(Request $request, $id)
    {
        $appointment = Appointment::find($id);
        
        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (!$this->canAccessAppointment($request, $appointment)) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (!$appointment->canBeCompleted()) {
            return response()->json([
                'message' => 'Only active appointments can be completed',
                'current_status' => $appointment->status
            ], 422);
        }

        if (!$appointment->medicalRecords()->where('status', MedicalRecord::STATUS_FINALIZED)->exists()) {
            return response()->json([
                'message' => 'Finalize the consultation medical record before completing this appointment',
            ], 422);
        }

        $billingStatus = ServiceBillingService::canCompleteService(ServiceItemUsage::SERVICE_VETERINARY, (int) $appointment->id);
        $paymentStatus = strtolower((string) ($appointment->payment_status ?? 'unpaid'));

        if ($paymentStatus !== 'paid' || !$billingStatus['can_complete']) {
            return response()->json([
                'message' => $paymentStatus !== 'paid'
                    ? 'Appointment cannot be completed until payment is fully verified.'
                    : $billingStatus['message'],
                'payment_status' => $appointment->payment_status,
                'billing' => $billingStatus,
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'notes' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $oldStatus = $appointment->status;
        $updateData = [
            'status' => 'completed',
            'completed_at' => Carbon::now(),
        ];

        if ($request->has('notes')) {
            $updateData['notes'] = $appointment->notes . "\n[Completion notes]: " . $request->notes;
        }

        $appointment->update($updateData);

        ActivityLog::log(auth()->id(), 'appointment_completed', "Veterinary completed appointment #{$appointment->id}", [
            'category' => 'veterinary',
            'reference_type' => 'appointment',
            'reference_id' => $appointment->id,
        ]);

        return response()->json([
            'message' => 'Appointment marked as completed',
            'appointment' => $appointment->load(['customer', 'pet', 'service', 'veterinarian'])
        ]);
    }

    /**
     * Legacy cashier endpoint: counter payment for an appointment.
     * Routed through the canonical verification service so the settlement
     * ledger, billing sync, and receipt flow stay single-sourced. No `sales`
     * row is created — appointment revenue is aggregated from the paid
     * appointment itself.
     */
    public function markAsPaid(Request $request, $id)
    {
        $appointment = Appointment::with(['customer', 'service'])->find($id);

        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if ($appointment->payment_status === 'paid') {
            return response()->json(['message' => 'Appointment payment is already verified'], 422);
        }

        $result = app(PaymentVerificationService::class)->verify('appointment', (int) $id, $request);

        if (!($result['success'] ?? false)) {
            return response()->json(['message' => $result['message'] ?? 'Payment verification failed'], $result['status'] ?? 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Appointment payment recorded',
            'receipt_number' => $result['receipt_number'] ?? null,
            'appointment' => $appointment->fresh(['customer', 'service']),
        ]);
    }

    /**
     * Update appointment status (general status update)
     */
    public function updateStatus(Request $request, $id)
    {
        $appointment = Appointment::find($id);
        
        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (!$this->canAccessAppointment($request, $appointment)) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'status' => 'required|in:' . implode(',', Appointment::VALID_STATUSES),
            'reason' => 'required_if:status,rejected|string|max:500',
            'cancellation_reason_code' => 'nullable|in:' . implode(',', array_keys(Appointment::CANCELLATION_REASONS)),
            'cancellation_note' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Invalid status',
                'errors' => $validator->errors()
            ], 422);
        }

        $newStatus = $request->input('status');
        $oldStatus = $appointment->status;

        // Validate status transitions
        if (!$this->isValidStatusTransition($oldStatus, $newStatus)) {
            return response()->json([
                'message' => 'Invalid status transition',
                'current_status' => $oldStatus,
                'requested_status' => $newStatus
            ], 422);
        }

        // Cancelling always requires a reason. Predefined reason codes come
        // from the dropdown; 'other' additionally requires an explanation.
        if ($newStatus === Appointment::STATUS_CANCELLED) {
            $reasonResult = $this->resolveCancellationReason($request);
            if ($reasonResult['error']) {
                return response()->json([
                    'message' => $reasonResult['error'],
                    'errors' => ['reason' => [$reasonResult['error']]],
                ], 422);
            }
        }

        if ($newStatus === 'completed') {
            if (!$appointment->medicalRecords()->where('status', MedicalRecord::STATUS_FINALIZED)->exists()) {
                return response()->json([
                    'message' => 'Finalize the consultation medical record before completing this appointment',
                ], 422);
            }

            $billingStatus = ServiceBillingService::canCompleteService(ServiceItemUsage::SERVICE_VETERINARY, (int) $appointment->id);
            $paymentStatus = strtolower((string) ($appointment->payment_status ?? 'unpaid'));

            if ($paymentStatus !== 'paid' || !$billingStatus['can_complete']) {
                return response()->json([
                    'message' => $paymentStatus !== 'paid'
                        ? 'Appointment cannot be completed until payment is fully verified.'
                        : $billingStatus['message'],
                    'payment_status' => $appointment->payment_status,
                    'billing' => $billingStatus,
                ], 422);
            }
        }

        if (in_array($newStatus, ['approved', 'scheduled'], true)) {
            $this->ensureBaseBillingItem($appointment);
            if (($appointment->payment_status ?? 'unpaid') !== 'paid') {
                $appointment->payment_status = 'unpaid';
            }
        }

        $appointment->status = $newStatus;

        if ($newStatus === 'rejected') {
            $appointment->cancellation_reason = $request->input('reason');
        }
        if ($newStatus === Appointment::STATUS_CANCELLED) {
            $appointment->cancellation_reason = $reasonResult['reason'];
        }

        // Set completion timestamp if completing
        if ($newStatus === 'completed') {
            $appointment->completed_at = Carbon::now();
        }

        $appointment->save();

        // Keep the originating service request in sync so receptionist queues
        // and customer tracking reflect the cancellation/rejection.
        if (in_array($newStatus, ['rejected', 'cancelled'], true) && $appointment->service_request_id) {
            ServiceRequest::where('id', $appointment->service_request_id)
                ->whereNotIn('status', ['completed'])
                ->update([
                    'status' => $newStatus,
                    'rejection_reason' => $appointment->cancellation_reason,
                ]);
        }

        if (in_array($newStatus, ['approved', 'scheduled'], true) && $appointment->veterinarian_id) {
            WorkflowNotifier::notifyUser(
                $appointment->veterinarian_id,
                'Vet Appointment Scheduled',
                "Appointment #{$appointment->id} is {$newStatus}.",
                'info',
                'appointment',
                $appointment->id
            );
        }

        if ($newStatus === 'completed') {
            ActivityLog::log(auth()->id(), 'appointment_completed', "Veterinary completed appointment #{$appointment->id}", [
                'category' => 'veterinary',
                'reference_type' => 'appointment',
                'reference_id' => $appointment->id,
            ]);
        } else {
            ActivityLog::log(auth()->id(), 'appointment_status_updated', "Appointment #{$appointment->id} changed from {$oldStatus} to {$newStatus}", [
                'category' => 'appointments',
                'reference_type' => 'appointment',
                'reference_id' => $appointment->id,
            ]);
        }

        return response()->json([
            'message' => "Appointment status updated to {$newStatus}",
            'appointment' => $appointment->load(['customer', 'pet', 'service', 'veterinarian'])
        ]);
    }

    /**
     * Check if status transition is valid
     */
    private function isValidStatusTransition($oldStatus, $newStatus)
    {
        $validTransitions = [
            'pending' => ['approved', 'scheduled', 'cancelled', 'rejected'],
            'approved' => ['scheduled', 'in_progress', 'in_consultation', 'treated', 'completed', 'cancelled', 'no_show'],
            'scheduled' => ['in_progress', 'in_consultation', 'treated', 'completed', 'cancelled', 'no_show'],
            'in_progress' => ['in_consultation', 'treated', 'awaiting_payment', 'completed', 'cancelled', 'no_show'],
            'in_consultation' => ['needs_confinement', 'treated', 'awaiting_payment', 'completed', 'cancelled'],
            'needs_confinement' => ['in_consultation', 'treated', 'awaiting_payment', 'completed', 'cancelled'],
            'treated' => ['awaiting_payment', 'completed', 'cancelled'],
            'awaiting_payment' => ['completed', 'cancelled'],
            'completed' => [], // No transitions from completed
            'cancelled' => [], // No transitions from cancelled
            'rejected' => ['pending'], // Can re-activate rejected appointments
            'no_show' => [], // No transitions from no_show
        ];

        return in_array($newStatus, $validTransitions[$oldStatus] ?? []);
    }

    /**
     * Update appointment (general update)
     */
    public function update(Request $request, $id)
    {
        $appointment = Appointment::find($id);
        
        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (!$this->canAccessAppointment($request, $appointment)) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        // Only allow updates to pending or approved appointments
        if (!in_array($appointment->status, ['pending', 'approved', 'scheduled'])) {
            return response()->json([
                'message' => 'Cannot update appointment with status: ' . $appointment->status
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'service_id' => 'sometimes|integer|exists:services,id',
            'scheduled_at' => 'sometimes|date|after:now',
            'notes' => 'sometimes|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $updateData = [];
        
        if ($request->has('service_id')) {
            $updateData['service_id'] = $request->service_id;
            $updateData['price'] = \App\Models\Service::find($request->service_id)->price ?? $appointment->price;
        }

        if ($request->has('scheduled_at')) {
            $updateData['scheduled_at'] = $request->scheduled_at;
        }

        if ($request->has('notes')) {
            $updateData['notes'] = $request->notes;
        }

        if ($request->has('pet_id')) {
            if (!Pet::where('id', $request->pet_id)->where('customer_id', $appointment->customer_id)->exists()) {
                return response()->json(['message' => 'Pet not found for this customer'], 422);
            }

            $updateData['pet_id'] = $request->pet_id;
        }

        if ($request->has('customer_id') && $request->user()?->hasRoleAccess('admin', 'receptionist')) {
            $updateData['customer_id'] = $request->customer_id;
        }

        if (array_key_exists('scheduled_at', $updateData)) {
            $updateData['scheduled_at'] = ServiceDurationService::inStoreTimezone($updateData['scheduled_at'])->copy()->utc();
        }

        if (array_key_exists('scheduled_at', $updateData) || array_key_exists('service_id', $updateData)) {
            $currentService = Service::find($appointment->service_id);
            $targetService = Service::find($updateData['service_id'] ?? $appointment->service_id);
            $currentIsGrooming = strtolower((string) $currentService?->category) === 'grooming';
            $targetIsGrooming = strtolower((string) $targetService?->category) === 'grooming';

            if (!$currentIsGrooming && !$targetIsGrooming) {
                $result = $this->persistVeterinaryScheduleChange(
                    $request,
                    (int) $appointment->id,
                    $updateData,
                    ['pending', 'approved', 'scheduled']
                );
                if (isset($result['http_status'])) {
                    return response()->json($result['body'], $result['http_status']);
                }
                $appointment = $result['appointment'];
            } elseif (!empty($updateData)) {
                $appointment->update($updateData);
            }
        } elseif (!empty($updateData)) {
            $appointment->update($updateData);
        }

        return response()->json($appointment->fresh(['customer', 'pet', 'service', 'veterinarian']));
    }

    public function availableVeterinarians()
    {
        $vets = User::query()
            ->where(function ($query) {
                $query->whereIn('role', ['veterinary', 'vet', 'veterinarian'])
                      ->where('is_active', true);
            })
            ->select(['id', 'name', 'email', 'role'])
            ->orderBy('name')
            ->get();
            
        return response()->json([
            'success' => true,
            'data' => $vets,
            'veterinarians' => $vets,
            'count' => $vets->count()
        ]);
    }

    /**
     * Get veterinarian schedule
     */
    public function veterinarianSchedule($vetId, Request $request)
    {
        $date = $request->input('date', Carbon::today()->toDateString());
        
        $appointments = Appointment::where('veterinarian_id', $vetId)
            ->whereDate('scheduled_at', $date)
            ->whereIn('status', ['pending', 'approved'])
            ->with(['customer', 'pet', 'service'])
            ->orderBy('scheduled_at')
            ->get();
            
        return response()->json([
            'date' => $date,
            'veterinarian_id' => $vetId,
            'appointments' => $appointments,
            'total_appointments' => $appointments->count(),
        ]);
    }

    private function ensureBaseBillingItem(Appointment $appointment): void
    {
        $basePrice = (float) ($appointment->consultation_fee ?? $appointment->price ?? 0);
        if ($basePrice <= 0) {
            return;
        }

        $existing = ServiceItemUsage::where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
            ->where('service_id', $appointment->id)
            ->where('item_type', ServiceItemUsage::ITEM_BASE_SERVICE)
            ->first();

        if ($existing) {
            return;
        }

        ServiceBillingService::createBaseServiceItem(
            ServiceItemUsage::SERVICE_VETERINARY,
            (int) $appointment->id,
            $appointment->service?->name ?? 'Veterinary consultation',
            $basePrice,
            $appointment->pet_id
        );
    }
}
