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
use App\Services\VisitStartService;
use App\Support\VeterinaryStatus;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Carbon;

class AppointmentController extends Controller
{
    private const ACTIVE_APPOINTMENT_STATUSES = [
        Appointment::STATUS_IN_CONSULTATION,
        Appointment::STATUS_IN_TREATMENT,
        Appointment::STATUS_AWAITING_RESULTS,
        Appointment::STATUS_CLINICAL_COMPLETE,
        Appointment::STATUS_CHECKOUT,
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

    private function updateWithScheduleValidation(Appointment $appointment, array $updateData): ?Appointment
    {
        if (!array_key_exists('scheduled_at', $updateData) && !array_key_exists('service_id', $updateData)) {
            $appointment->update($updateData);
            return $appointment->fresh(['customer', 'pet', 'service', 'veterinarian']);
        }

        return DB::transaction(function () use ($appointment, $updateData) {
            BookingAvailabilityService::lockServiceSchedule();
            $lockedAppointment = Appointment::whereKey($appointment->id)->lockForUpdate()->first();
            if (!$lockedAppointment) {
                return null;
            }

            $service = Service::find($updateData['service_id'] ?? $lockedAppointment->service_id);
            if (!$service) {
                return null;
            }

            $scheduledValue = $updateData['scheduled_at'] ?? $lockedAppointment->scheduled_at->toIso8601String();
            [$scheduledAtUtc, $scheduledAtLocal] = BookingAvailabilityService::appointmentTimes($scheduledValue);
            if (!$scheduledAtUtc->isFuture()) {
                return null;
            }

            $serviceType = strtolower((string) $service->category) === 'grooming' ? 'grooming' : 'veterinary';
            if (!BookingAvailabilityService::isServiceTimeAvailable(
                $serviceType,
                $scheduledAtLocal->toDateString(),
                $scheduledAtLocal->format('H:i'),
                $service->name,
                $lockedAppointment->veterinarian_id,
                $lockedAppointment->id,
                $lockedAppointment->service_request_id
            )) {
                return null;
            }

            $updateData['scheduled_at'] = $scheduledAtUtc;
            if (array_key_exists('service_id', $updateData)) {
                $updateData['price'] = $service->price ?? $lockedAppointment->price;
            }
            $lockedAppointment->update($updateData);

            if ($lockedAppointment->service_request_id) {
                $serviceRequest = ServiceRequest::find($lockedAppointment->service_request_id);
                if ($serviceRequest) {
                    $serviceRequest->request_date = $scheduledAtLocal->toDateString();
                    $serviceRequest->request_time = $scheduledAtLocal->format('H:i');
                    $serviceRequest->preferred_date = $scheduledAtLocal->toDateString();
                    $serviceRequest->preferred_time = $scheduledAtLocal->format('H:i');
                    $serviceRequest->service_name = $service->name;
                    $serviceRequest->save();
                    Grooming::where('service_request_id', $serviceRequest->id)->update([
                        'appointment_date' => $scheduledAtLocal->toDateString(),
                        'appointment_time' => $scheduledAtLocal->format('H:i'),
                        'service' => $service->name,
                    ]);
                }
            }
            if (Schema::hasColumn('groomings', 'appointment_id')) {
                $grooming = Grooming::where('appointment_id', $lockedAppointment->id);
                if ($serviceType === 'grooming') {
                    $grooming->update([
                        'appointment_date' => $scheduledAtLocal->toDateString(),
                        'appointment_time' => $scheduledAtLocal->format('H:i'),
                        'service' => $service->name,
                    ]);
                } else {
                    $grooming->update(['status' => 'cancelled']);
                }
            }

            return $lockedAppointment->fresh(['customer', 'pet', 'service', 'veterinarian']);
        });
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
            'scheduled_at' => 'required|date',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if (!Pet::where('id', $request->pet_id)->where('customer_id', $request->customer_id)->exists()) {
            return response()->json(['message' => 'Pet not found for this customer'], 422);
        }

        [$scheduledAtUtc, $scheduledAtLocal] = BookingAvailabilityService::appointmentTimes($request->scheduled_at);
        if (!$scheduledAtUtc->isFuture()) {
            return response()->json(['errors' => ['scheduled_at' => ['The scheduled time must be in the future.']]], 422);
        }
        $date = $scheduledAtLocal->toDateString();
        $time = $scheduledAtLocal->format('H:i');
        $service = Service::find($request->service_id);

        $appointment = DB::transaction(function () use ($request, $date, $time, $service, $scheduledAtUtc) {
            BookingAvailabilityService::lockServiceSchedule();
            $lockedService = Service::find($request->service_id);
            $serviceType = strtolower((string) $lockedService?->category) === 'grooming' ? 'grooming' : 'veterinary';
            if (!BookingAvailabilityService::isServiceTimeAvailable(
                $serviceType,
                $date,
                $time,
                $lockedService?->name,
                $request->veterinarian_id,
                null,
                null,
                $request->user()?->role !== 'customer'
            )) {
                return null;
            }

            $appointment = Appointment::create([
                'customer_id' => $request->customer_id,
                'pet_id' => $request->pet_id,
                'service_id' => $request->service_id,
                'veterinarian_id' => $request->veterinarian_id,
                'status' => $request->user()?->hasRoleAccess('veterinary', 'vet', 'veterinarian', 'receptionist', 'admin')
                    ? Appointment::STATUS_SCHEDULED
                    : Appointment::STATUS_REQUESTED,
                'scheduled_at' => $scheduledAtUtc,
                'notes' => $request->notes,
                'price' => $lockedService?->price ?? $service?->price ?? 0,
                'booking_channel' => \App\Support\BookingChannel::forUser($request->user()),
            ]);

            if (strtolower((string) $lockedService?->category) === 'grooming') {
                $groomingPrice = (float) ($lockedService->price ?? 0);
                $groomingData = [
                    'customer_id' => $request->customer_id,
                    'pet_id' => $request->pet_id,
                    'service' => $lockedService->name,
                    'appointment_date' => $date,
                    'appointment_time' => $time,
                    'notes' => $request->notes,
                    'amount' => $groomingPrice,
                    'base_amount' => $groomingPrice,
                    'total_amount' => $groomingPrice,
                    'amount_paid' => 0,
                    'balance_due' => $groomingPrice,
                    'payment_status' => 'unpaid',
                    'status' => 'pending',
                    'booking_channel' => \App\Support\BookingChannel::forUser($request->user()),
                ];
                if (Schema::hasColumn('groomings', 'appointment_id')) {
                    $groomingData['appointment_id'] = $appointment->id;
                }
                Grooming::create($groomingData);
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

        if (!in_array($appointment->status, VeterinaryStatus::ASSIGNABLE, true)) {
            return response()->json([
                'message' => 'Only pending or not-yet-started appointments can be assigned or reassigned',
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

        $appointment = DB::transaction(function () use ($appointment, $request) {
            BookingAvailabilityService::lockServiceSchedule();
            $lockedAppointment = Appointment::whereKey($appointment->id)->lockForUpdate()->first();
            if (!$lockedAppointment) {
                return null;
            }

            $service = $lockedAppointment->service;
            $scheduledAtLocal = $lockedAppointment->scheduled_at->copy()->setTimezone(\App\Services\ServiceDurationService::STORE_TIMEZONE);
            $serviceType = strtolower((string) $service?->category) === 'grooming' ? 'grooming' : 'veterinary';
            if (!$service || !BookingAvailabilityService::isServiceTimeAvailable(
                $serviceType,
                $scheduledAtLocal->toDateString(),
                $scheduledAtLocal->format('H:i'),
                $service->name,
                (int) $request->veterinarian_id,
                $lockedAppointment->id,
                $lockedAppointment->service_request_id
            )) {
                return null;
            }

            $lockedAppointment->update([
                // Requested visits become scheduled; a patient already inside
                // the clinic keeps their intake status — assignment is not a demotion.
                'status' => $lockedAppointment->status === Appointment::STATUS_REQUESTED
                    ? Appointment::STATUS_SCHEDULED
                    : $lockedAppointment->status,
                'veterinarian_id' => $request->veterinarian_id,
                'payment_status' => $lockedAppointment->payment_status === 'paid' ? 'paid' : 'unpaid',
            ]);

            return $lockedAppointment->fresh(['customer', 'pet', 'service', 'veterinarian']);
        });

        if (!$appointment) {
            return response()->json([
                'message' => 'This veterinarian already has a conflicting appointment at the selected date and time.',
            ], 422);
        }

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
                'allowed_statuses' => ['requested', 'scheduled']
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'scheduled_at' => 'required|date',
            'reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $oldDate = $appointment->scheduled_at;
        $updatedAppointment = $this->updateWithScheduleValidation($appointment, [
            'scheduled_at' => $request->scheduled_at,
            'notes' => $appointment->notes . "\n[Rescheduled from {$oldDate}]: " . ($request->reason ?: 'No reason provided'),
        ]);

        if (!$updatedAppointment) {
            return response()->json([
                'message' => 'This schedule is no longer available. Please choose another slot.',
                'errors' => ['scheduled_at' => ['Time slot overlaps an existing booking.']],
            ], 422);
        }

        return response()->json([
            'message' => 'Appointment rescheduled successfully',
            'appointment' => $updatedAppointment,
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
                'allowed_statuses' => array_diff(Appointment::VALID_STATUSES, ['completed', 'cancelled', 'rejected', 'no_show'])
            ], 422);
        }

        if ($blocked = $this->cancellationBlockedAfterStart($request, $appointment)) {
            return $blocked;
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
        DB::transaction(function () use ($appointment, $reasonResult) {
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
        });

        return response()->json([
            'message' => 'Appointment cancelled successfully',
            'appointment' => $appointment->load(['customer', 'pet', 'service', 'veterinarian']),
        ]);
    }

    /**
     * Once clinical work has started, cancelling would discard rendered services
     * and used stock. Only a manager or admin may void such a visit.
     */
    private function cancellationBlockedAfterStart(Request $request, Appointment $appointment): ?JsonResponse
    {
        if (!in_array($appointment->status, VeterinaryStatus::CANCEL_RESTRICTED, true)) {
            return null;
        }

        if ($request->user()?->hasRoleAccess('manager')) {
            return null;
        }

        return response()->json([
            'message' => 'The consultation has started. Only a manager can cancel it, and services already rendered remain billed.',
            'current_status' => $appointment->status,
        ], 403);
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

        if (!in_array($appointment->status, [Appointment::STATUS_REQUESTED, Appointment::STATUS_SCHEDULED])) {
            return response()->json([
                'message' => 'Can only reject requested or scheduled appointments',
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

        $validator = Validator::make($request->all(), [
            'notes' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $result = VisitStartService::start((int) $id, $request->user(), $request->input('notes'));

        if ($result['started']) {
            ActivityLog::log(auth()->id(), 'appointment_started', "Veterinary started appointment #{$appointment->id}", [
                'category' => 'veterinary',
                'reference_type' => 'appointment',
                'reference_id' => $appointment->id,
            ]);
        }

        return response()->json([
            'message' => 'Appointment started successfully',
            'appointment' => $result['appointment'],
            'medical_record' => $result['record'],
        ]);
    }

    /**
     * Check in an appointment (receptionist / vet tech)
     *
     * Marks the patient as physically present. Optionally flags the visit as an
     * emergency walk-in, which front-loads the vet queue.
     */
    public function checkIn(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'is_emergency' => 'sometimes|boolean',
            'notes' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $emergency = $request->boolean('is_emergency');
        $appointment = DB::transaction(function () use ($id, $request, $emergency) {
            $locked = Appointment::whereKey($id)->lockForUpdate()->first();
            if (!$locked) {
                return null;
            }

            // Idempotent: an already-checked-in visit keeps its original stamp.
            if ($locked->checked_in_at !== null
                || in_array($locked->status, VeterinaryStatus::INTAKE, true)
                || in_array($locked->status, VeterinaryStatus::STARTED, true)
                || in_array($locked->status, VeterinaryStatus::POST_CLINICAL, true)) {
                return $locked;
            }

            if (!in_array($locked->status, VeterinaryStatus::INTAKE_ELIGIBLE, true)) {
                return ['error' => 'This appointment cannot be checked in from its current status.'];
            }

            $locked->update([
                'status' => Appointment::STATUS_CHECKED_IN,
                'checked_in_at' => now(),
                'checked_in_by' => $request->user()->id,
                'emergency' => $emergency,
                'notes' => $request->filled('notes')
                    ? trim($locked->notes . "\nCheck-in: " . $request->input('notes'))
                    : $locked->notes,
            ]);

            return $locked;
        });

        if ($appointment === null) {
            return response()->json(['message' => 'Appointment not found'], 404);
        }

        if (is_array($appointment)) {
            return response()->json(['message' => $appointment['error']], 422);
        }

        $appointment = $appointment->fresh(['customer', 'pet', 'service', 'veterinarian']);

        ActivityLog::log(auth()->id(), 'appointment_checked_in', "Appointment #{$appointment->id} checked in" . ($emergency ? ' (emergency walk-in)' : ''), [
            'category' => 'receptionist',
            'reference_type' => 'appointment',
            'reference_id' => $appointment->id,
        ]);

        $notifyTitle = $emergency ? 'Emergency walk-in checked in' : 'Patient checked in';
        $notifyBody = $emergency
            ? "Appointment #{$appointment->id} was checked in as an emergency."
            : "{$appointment->pet?->name} is checked in and waiting for you.";
        $notifyLevel = $emergency ? 'warning' : 'info';

        if ($appointment->veterinarian_id) {
            WorkflowNotifier::notifyUser(
                $appointment->veterinarian_id,
                $notifyTitle,
                $notifyBody,
                $notifyLevel,
                'appointment',
                $appointment->id
            );
        } else {
            WorkflowNotifier::notifyRole(
                'veterinary',
                $notifyTitle,
                $notifyBody,
                $notifyLevel,
                'appointment',
                $appointment->id
            );
        }

        return response()->json([
            'message' => 'Appointment checked in successfully',
            'appointment' => $appointment,
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

        // Only allow updating medical info while clinical work is in progress
        if (!in_array($appointment->status, VeterinaryStatus::STARTED, true)) {
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

        if ($newStatus === Appointment::STATUS_CANCELLED && ($blocked = $this->cancellationBlockedAfterStart($request, $appointment))) {
            return $blocked;
        }

        // Cancelling always requires a reason. Predefined reason codes come
        // from the dropdown; 'other' additionally requires an explanation.
        $reasonResult = ['error' => null, 'reason' => null];
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

        DB::transaction(function () use ($appointment, $request, $newStatus, $reasonResult) {
            if ($newStatus === Appointment::STATUS_SCHEDULED) {
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
        });

        if ($newStatus === Appointment::STATUS_SCHEDULED && $appointment->veterinarian_id) {
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
            'requested' => ['scheduled', 'cancelled', 'rejected'],
            'scheduled' => ['checked_in', 'in_consultation', 'cancelled', 'no_show', 'rejected'],
            'checked_in' => ['in_consultation', 'cancelled', 'no_show'],
            'in_consultation' => ['in_treatment', 'awaiting_results', 'clinical_complete', 'checkout', 'cancelled'],
            'in_treatment' => ['in_consultation', 'awaiting_results', 'clinical_complete', 'checkout', 'cancelled'],
            'awaiting_results' => ['in_consultation', 'in_treatment', 'clinical_complete', 'checkout', 'cancelled'],
            'clinical_complete' => ['checkout', 'completed', 'cancelled'],
            'checkout' => ['completed', 'cancelled'],
            'completed' => [], // No transitions from completed
            'cancelled' => [], // No transitions from cancelled
            'rejected' => ['requested'], // Can re-activate rejected appointments
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

        // Only allow updates while the visit is still in booking/intake
        if (!in_array($appointment->status, VeterinaryStatus::ASSIGNABLE)) {
            return response()->json([
                'message' => 'Cannot update appointment with status: ' . $appointment->status
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'service_id' => 'sometimes|integer|exists:services,id',
            'scheduled_at' => 'sometimes|date',
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

        if (!empty($updateData)) {
            $updatedAppointment = $this->updateWithScheduleValidation($appointment, $updateData);
            if (!$updatedAppointment) {
                return response()->json([
                    'message' => 'This schedule is no longer available. Please choose another slot.',
                    'errors' => ['scheduled_at' => ['Time slot overlaps an existing booking.']],
                ], 422);
            }

            return response()->json($updatedAppointment);
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
            ->whereIn('status', VeterinaryStatus::QUEUE)
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
