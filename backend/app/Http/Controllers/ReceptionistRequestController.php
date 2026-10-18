<?php

namespace App\Http\Controllers;

use App\Models\Holiday;
use App\Support\StoreHours;
use App\Models\ServiceRequest;
use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Grooming;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Models\ActivityLog;
use App\Models\ServiceItemUsage;
use App\Services\BookingAvailabilityService;
use App\Services\CustomerEmailResolver;
use App\Services\EmailDeliveryService;
use App\Services\ServiceCatalog;
use App\Services\ServiceDurationService;
use App\Services\BookingWorkflowStage;
use App\Services\WorkflowNotifier;
use App\Support\EmailContent;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReceptionistRequestController extends Controller
{
    private function requestIsVet(ServiceRequest $serviceRequest): bool
    {
        $requestType = strtolower((string) $serviceRequest->request_type);

        return $requestType === 'vet' || $requestType === 'veterinary';
    }

    private function requestIsGrooming(ServiceRequest $serviceRequest): bool
    {
        return strtolower((string) $serviceRequest->request_type) === 'grooming';
    }

    private function requestIsHotel(ServiceRequest $serviceRequest): bool
    {
        $requestType = strtolower((string) $serviceRequest->request_type);

        return $requestType === 'hotel' || $requestType === 'boarding';
    }

    private function resolveCustomer(ServiceRequest $serviceRequest): ?Customer
    {
        return CustomerEmailResolver::forServiceRequest($serviceRequest);
    }

    private function resolvePet(ServiceRequest $serviceRequest, ?Customer $customer): ?Pet
    {
        if ($serviceRequest->pet_id) {
            return Pet::find($serviceRequest->pet_id);
        }

        if (!$serviceRequest->pet_name) {
            return null;
        }

        $query = Pet::whereRaw('LOWER(name) = ?', [strtolower($serviceRequest->pet_name)]);

        if ($customer) {
            $query->where('customer_id', $customer->id);
        }

        $matches = $query->get();

        return $matches->count() === 1 ? $matches->first() : null;
    }

    private function resolveService(ServiceRequest $serviceRequest): ?Service
    {
        $service = ServiceCatalog::forRequest($serviceRequest);
        if ($service) {
            return $service;
        }

        $serviceName = trim((string) $serviceRequest->service_name);

        // Generic fallback: try to find any matching service by name, then any active service
        if ($serviceName !== '') {
            $service = Service::whereRaw('LOWER(name) LIKE ?', ['%' . strtolower($serviceName) . '%'])->first();
            if ($service) {
                return $service;
            }
        }

        $service = Service::where('is_active', true)->first();
        if ($service) {
            return $service;
        }

        return null;
    }

    private function formatRequest(object $item): array
    {
        $appointment = $item->appointment ?? null;

        return [
            'id' => $item->id,
            'request_type' => $item->request_type,
            'service_type' => $item->request_type,
            'type' => $item->request_type,
            'customer_name' => $item->customer_name,
            'customer' => $item->customer_name,
            'customer_id' => $item->customer_id,
            'customer_email' => $item->customer_email,
            'email' => $item->customer_email,
            'pet_id' => $item->pet_id,
            'pet_name' => $item->pet_name,
            'pet' => $item->pet_name,
            'service_name' => $item->service_name,
            'service' => $item->service_name,
            'request_date' => $item->request_date,
            'date' => $item->request_date,
            'request_time' => $item->request_time,
            'time' => $item->request_time,
            'appointment_id' => $appointment?->id,
            'appointment_status' => $appointment?->status,
            'workflow_stage' => BookingWorkflowStage::forServiceRequest($item->request_type, $item->status, $item->payment_status, $appointment?->status),
            'veterinarian_id' => $appointment?->veterinarian_id,
            'veterinarian' => $appointment?->veterinarian ? [
                'id' => $appointment->veterinarian->id,
                'name' => $appointment->veterinarian->name,
            ] : null,
            'status' => $item->status,
            'rejection_reason' => $item->rejection_reason ?? null,
            'cancellation_reason' => $item->cancellation_reason ?? null,
            'payment_status' => $item->payment_status,
            'payment' => $item->payment_status,
            'notes' => $item->notes,
            'price' => $item->price ?? null,
            'amount' => $item->price ?? null,
            'total_amount' => $item->price ?? null,
            'created_at' => $item->created_at,
        ];
    }

    private function onlyExistingColumns(string $table, array $data): array
    {
        return collect($data)
            ->filter(fn ($_value, $column) => Schema::hasColumn($table, $column))
            ->all();
    }

    public function index()
    {
        $requests = ServiceRequest::with('appointment.veterinarian')->latest()->get()->map(fn ($item) => $this->formatRequest($item));

        return response()->json([
            'success' => true,
            'requests' => $requests,
            'store_today' => now(ServiceDurationService::STORE_TIMEZONE)->toDateString(),
        ]);
    }

    public function pending()
    {
        $requests = ServiceRequest::with('appointment.veterinarian')
            ->where('status', 'pending')
            ->latest()
            ->get()
            ->map(fn ($item) => $this->formatRequest($item));

        return response()->json([
            'success' => true,
            'requests' => $requests
        ]);
    }

    public function approvalHistory()
    {
        $requests = ServiceRequest::with('appointment.veterinarian')
            ->whereIn('status', ['approved', 'scheduled', 'completed', 'paid'])
            ->latest()
            ->get()
            ->map(fn ($item) => $this->formatRequest($item));

        return response()->json([
            'success' => true,
            'approvals' => $requests
        ]);
    }

    public function schedulingHistory()
    {
        $requests = ServiceRequest::with('appointment.veterinarian')
            ->whereIn('status', ['scheduled', 'confirmed', 'rescheduled', 'approved'])
            ->where(function ($query) {
                $query->whereNotNull('preferred_date')->orWhereNotNull('request_date');
            })
            ->latest()
            ->get()
            ->map(fn ($item) => $this->formatRequest($item));

        return response()->json([
            'success' => true,
            'history' => $requests
        ]);
    }

    public function rejectedHistory()
    {
        $requests = ServiceRequest::with('appointment.veterinarian')
            ->whereIn('status', ['rejected', 'cancelled', 'canceled'])
            ->latest()
            ->get()
            ->map(fn ($item) => $this->formatRequest($item));

        return response()->json([
            'success' => true,
            'rejected' => $requests
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'request_type' => 'nullable|string',
            'service_type' => 'nullable|string',
            'customer_name' => 'nullable|string|max:255',
            'customer_email' => 'nullable|email|max:255',
            'pet_id' => 'required|integer|exists:pets,id',
            'pet_name' => 'nullable|string|max:255',
            'service_name' => 'required|string|max:255',
            'request_date' => 'nullable|date',
            'request_time' => 'nullable|string',
            'notes' => 'nullable|string',
            'status' => 'nullable|in:pending,scheduled,approved,rejected',
        ]);

        // The linked pet record is authoritative for pet and owner identity —
        // typed pet/customer names can drift or collide, so they only act as a
        // fallback when the pet has no customer record.
        $pet = Pet::with('customer')->findOrFail($validated['pet_id']);

        // Role-based status validation
        $user = $request->user();
        $status = 'pending'; // Default for customers
        
        if ($user && $user->hasRoleAccess('receptionist', 'admin')) {
            $status = $validated['status'] ?? 'scheduled'; // Default to scheduled for receptionist/admin
        }

        $requestType = $validated['request_type'] ?? $validated['service_type'] ?? 'grooming';

        $createData = [
            'request_type' => $requestType,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'customer_id' => $pet->customer?->user_id,
            'customer_name' => $pet->customer?->name ?? $validated['customer_name'] ?? 'Unknown Customer',
            'service_name' => $validated['service_name'],
            'request_date' => $validated['request_date'] ?? null,
            'request_time' => $validated['request_time'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'status' => $status,
            'payment_status' => 'pending',
        ];

        // Customers booking through this endpoint are online requests;
        // receptionist/admin-created requests are counter (walk-in) entries.
        if (Schema::hasColumn('service_requests', 'booking_channel')) {
            $createData['booking_channel'] = \App\Support\BookingChannel::forUser($user);
        }

        if (Schema::hasColumn('service_requests', 'price')) {
            $createData['price'] = ServiceCatalog::priceFor(
                $validated['service_name'],
                ServiceCatalog::bucketFor($requestType)
            ) ?: null;
        }

        if (Schema::hasColumn('service_requests', 'customer_email')) {
            $createData['customer_email'] = $pet->customer?->email ?? $validated['customer_email'] ?? null;
        }

        $serviceRequest = ServiceRequest::create($createData);

        WorkflowNotifier::notifyRole(
            'receptionist',
            'New Service Request',
            "{$serviceRequest->customer_name} submitted a {$serviceRequest->request_type} request.",
            'info',
            'service_request',
            $serviceRequest->id,
            ['customer_email' => $serviceRequest->customer_email]
        );

        return response()->json([
            'success' => true,
            'message' => 'Request submitted successfully.',
            'request' => $this->formatRequest($serviceRequest)
        ], 201);
    }

    public function updateStatus(Request $request, $id)
    {
        $validated = $request->validate([
            'status' => 'required|in:pending,approved,rejected,cancelled,completed,in_progress,ready_for_pickup,checked_in',
            'rejection_reason' => 'required_if:status,rejected|string|max:1000',
        ]);

        /** @var ServiceRequest $serviceRequest */
        $serviceRequest = ServiceRequest::findOrFail($id);
        $previousStatus = $serviceRequest->status;
        $hasPendingProof = $serviceRequest->payment_status === 'pending' && (bool) $serviceRequest->payment_proof;
        $linkedPaymentStatus = $hasPendingProof
            ? 'pending'
            : (in_array($serviceRequest->payment_status, ['paid', 'partial', 'rejected'], true) ? $serviceRequest->payment_status : 'unpaid');

        if ($validated['status'] === 'approved'
            && $previousStatus === 'pending'
            && $this->requestIsHotel($serviceRequest)
            && ($serviceRequest->booking_channel ?? \App\Support\BookingChannel::ONLINE) !== \App\Support\BookingChannel::WALK_IN) {
            $boarding = Boarding::where('service_request_id', $serviceRequest->id)->first();
            if (!$boarding?->vaccination_card || !$boarding->vaccination_card_verified_at) {
                return response()->json(['message' => 'Online hotel requests must use the Pet Hotel reservation flow and have a verified vaccination card before approval.'], 422);
            }
        }

        if ($validated['status'] === 'approved'
            && $this->requestIsVet($serviceRequest)
            && !$this->requestIsHotel($serviceRequest)
            && !$this->requestIsGrooming($serviceRequest)) {
            return response()->json([
                'message' => 'Vet requests must be approved through veterinarian assignment.',
                'errors' => ['veterinarian_id' => ['Choose a veterinarian before approving this request.']],
            ], 422);
        }

        // Check-in gates: booking must be paid and scheduled for today.
        if ($validated['status'] === 'checked_in') {
            // When a boarding record is linked to this request, run the real
            // boarding check-in (room occupancy, care log, add-on inventory)
            // instead of just flipping this request's status. The boarding
            // check-in enforces its own paid/scheduled-date gates and
            // propagates 'checked_in' back to this request.
            $linkedBoarding = Schema::hasColumn('boardings', 'service_request_id')
                ? Boarding::where('service_request_id', $serviceRequest->id)->first()
                : null;

            if ($linkedBoarding) {
                $checkInResponse = app(BoardingController::class)->checkIn($request, $linkedBoarding->id);
                if ($checkInResponse->getStatusCode() >= 400) {
                    return $checkInResponse;
                }
            } else {
                if (!in_array(strtolower((string) $serviceRequest->payment_status), ['paid', 'verified', 'completed'], true)) {
                    return response()->json([
                        'message' => 'Booking must be paid before check-in.',
                    ], 422);
                }
                if ($serviceRequest->request_date && !Carbon::parse($serviceRequest->request_date)->isToday()) {
                    return response()->json([
                        'message' => 'Check-in is only allowed on the scheduled date.',
                    ], 422);
                }
            }
        }

        if ($previousStatus === 'completed' && $validated['status'] === 'completed') {
            return response()->json([
                'success' => true,
                'message' => 'Request is already completed.',
                'request' => $this->formatRequest($serviceRequest),
            ]);
        }
        if ($validated['status'] === 'completed' && $this->requestIsGrooming($serviceRequest)) {
            $paid = in_array(strtolower((string) $serviceRequest->payment_status), ['paid', 'verified', 'completed'], true);
            if (!$paid) {
                return response()->json([
                    'success' => false,
                    'message' => 'Grooming cannot be completed until payment is fully verified.',
                    'payment_status' => $serviceRequest->payment_status,
                ], 422);
            }
        }

        $serviceRequest->status = $validated['status'];
        if ($validated['status'] === 'ready_for_pickup' && Schema::hasColumn('service_requests', 'ready_for_pickup_at')) {
            $serviceRequest->ready_for_pickup_at = now();
        }

        if ($validated['status'] === 'rejected') {
            $serviceRequest->rejection_reason = $validated['rejection_reason'];
            if (Schema::hasColumn('service_requests', 'rejected_by')) {
                $serviceRequest->rejected_by = $request->user()?->id;
            }
            if (Schema::hasColumn('service_requests', 'rejected_at')) {
                $serviceRequest->rejected_at = now();
            }
        }

        if (in_array($validated['status'], ['rejected', 'cancelled']) && !$hasPendingProof) {
            $serviceRequest->payment_status = 'unpaid';
        } elseif ($validated['status'] === 'approved' && !$hasPendingProof && $serviceRequest->payment_status === 'pending') {
            $serviceRequest->payment_status = 'unpaid';
        }

        $serviceRequest->save();
        if ($validated['status'] === 'approved' && $hasPendingProof) {
            WorkflowNotifier::notifyRole('cashier', 'Service payment proof ready for verification', "Approved service request #{$serviceRequest->id} has a customer-submitted payment proof.", 'info', 'service_request', $serviceRequest->id);
        } elseif (in_array($validated['status'], ['rejected', 'cancelled'], true) && $hasPendingProof) {
            WorkflowNotifier::notifyRole('cashier', 'Payment proof requires refund review', "Service request #{$serviceRequest->id} was {$validated['status']} after proof submission; review the payment before any counter settlement.", 'warning', 'service_request', $serviceRequest->id);
        }

        // Propagate status change to linked dedicated records
        $newStatus = $validated['status'];
        if (in_array($newStatus, ['rejected', 'cancelled'])) {
            $linkedUpdates = ['status' => $newStatus];
            if (!$hasPendingProof) $linkedUpdates['payment_status'] = 'unpaid';
            if (Schema::hasColumn('appointments', 'service_request_id')) {
                Appointment::where('service_request_id', $serviceRequest->id)->update($linkedUpdates);
            }
            if (Schema::hasColumn('groomings', 'service_request_id')) {
                Grooming::where('service_request_id', $serviceRequest->id)->update($linkedUpdates);
            }
            if (Schema::hasColumn('boardings', 'service_request_id')) {
                Boarding::where('service_request_id', $serviceRequest->id)->update($linkedUpdates);
            }
        }

        // Safety net: create/update linked records when approving via PATCH
        if ($newStatus === 'approved') {
            $customer = $this->resolveCustomer($serviceRequest);
            $pet = $this->resolvePet($serviceRequest, $customer);

            if (!$customer && $pet) {
                $customer = $pet->customer;
            }

            if ($customer) {
                if (!$serviceRequest->customer_email) {
                    $serviceRequest->customer_email = $customer->email;
                }
                if (!$serviceRequest->customer_name) {
                    $serviceRequest->customer_name = $customer->name;
                }
            }
            if ($pet && !$serviceRequest->pet_id) {
                $serviceRequest->pet_id = $pet->id;
            }

            // Grooming: create record if customer and pet resolved
            if ($this->requestIsGrooming($serviceRequest) && $customer && $pet) {
                if (Schema::hasColumn('groomings', 'service_request_id')) {
                    $service = $this->resolveService($serviceRequest);
                    $price = $service ? ($service->price ?? 0) : 0;

                    $grooming = Grooming::firstOrCreate(
                        ['service_request_id' => $serviceRequest->id],
                        [
                            'customer_id' => $customer->id,
                            'pet_id' => $pet->id,
                            'service' => $serviceRequest->service_name ?? 'Grooming',
                            'appointment_date' => $serviceRequest->request_date,
                            'appointment_time' => $serviceRequest->request_time,
                            'notes' => $serviceRequest->notes,
                            'amount' => $price,
                            'base_amount' => $price,
                            'total_amount' => $price,
                            'balance_due' => $price,
                            'status' => 'approved',
                            'payment_status' => $linkedPaymentStatus,
                        ]
                    );

                    if (!$grooming->wasRecentlyCreated) {
                        $groomingUpdates = ['status' => 'approved'];

                        if (!$hasPendingProof && ($grooming->payment_status ?? 'unpaid') !== 'paid') {
                            $groomingUpdates['payment_status'] = 'unpaid';
                        }

                        // Repair records auto-created before a price was
                        // resolved — a payable booking must never sit at ₱0.
                        if ($price > 0 && (float) ($grooming->total_amount ?? $grooming->amount ?? 0) <= 0) {
                            $groomingUpdates['amount'] = $price;
                            $groomingUpdates['base_amount'] = $price;
                            $groomingUpdates['total_amount'] = $price;
                            $groomingUpdates['balance_due'] = $price;
                        }

                        $grooming->update($groomingUpdates);
                    }

                    // Auto-create base service billing item so groomer sees the service fee
                    $baseItemExists = ServiceItemUsage::where('service_type', ServiceItemUsage::SERVICE_GROOMING)
                        ->where('service_id', $grooming->id)
                        ->where('item_type', ServiceItemUsage::ITEM_BASE_SERVICE)
                        ->exists();

                    if (!$baseItemExists && $price > 0) {
                        ServiceItemUsage::create([
                            'service_type' => ServiceItemUsage::SERVICE_GROOMING,
                            'service_id' => $grooming->id,
                            'pet_id' => $pet->id,
                            'customer_id' => $customer->id,
                            'customer_email' => $customer->email,
                            'item_type' => ServiceItemUsage::ITEM_BASE_SERVICE,
                            'description' => $service->name ?? $serviceRequest->service_name ?? 'Grooming Service',
                            'quantity_used' => 1,
                            'unit' => 'session',
                            'unit_price' => $price,
                            'total_price' => $price,
                            'is_billable' => true,
                            'is_paid' => false,
                            'used_by' => Auth::id(),
                        ]);
                    }

                    // Persist the resolved payable amount on the request so
                    // the cashier queue and settlement never see ₱0.
                    if ($price > 0 && (float) ($serviceRequest->price ?? 0) <= 0) {
                        $serviceRequest->price = $price;
                        $serviceRequest->save();
                    }
                }
            }

            // Hotel: create record if customer and pet resolved
            if ($this->requestIsHotel($serviceRequest) && $customer && $pet) {
                if (Schema::hasColumn('boardings', 'service_request_id')) {
                    $checkIn = $serviceRequest->request_date;
                    $checkOut = $serviceRequest->check_out_date;
                    if (!$checkOut && $checkIn) {
                        $checkOut = Carbon::parse($checkIn, ServiceDurationService::STORE_TIMEZONE)->toDateString();
                    }

                    // Resolve the payable total: persisted request total →
                    // room rate × nights → catalog default. Never leaves ₱0.
                    $boardingTotal = (float) ($serviceRequest->total_amount ?? 0);
                    if ($boardingTotal <= 0 && is_numeric($serviceRequest->daily_rate ?? null)) {
                        $boardingTotal = (float) $serviceRequest->daily_rate * max(1, (int) ($serviceRequest->total_days ?? 1));
                    }
                    if ($boardingTotal <= 0) {
                        $boardingTotal = ServiceCatalog::priceFor($serviceRequest->service_name, 'hotel');
                    }

                    $boarding = Boarding::firstOrCreate(
                        ['service_request_id' => $serviceRequest->id],
                        $this->onlyExistingColumns('boardings', [
                            'pet_id' => $pet->id,
                            'pet_name' => $pet->name ?? $serviceRequest->pet_name,
                            'pet_type' => $pet->species ?? $pet->type ?? $serviceRequest->pet_type,
                            'customer_id' => $customer->id,
                            'customer_name' => $customer->name ?? $serviceRequest->customer_name,
                            'customer_email' => $customer->email ?? $serviceRequest->customer_email,
                            'check_in' => $checkIn,
                            'check_out' => $checkOut,
                            'room_name' => $serviceRequest->room_name,
                            'room_type' => $serviceRequest->room_type,
                            'rate_per_day' => $serviceRequest->daily_rate,
                            'number_of_days' => $serviceRequest->total_days ?? 1,
                            'total_amount' => $boardingTotal,
                            'status' => 'approved',
                            'payment_status' => $linkedPaymentStatus,
                            'payment_method' => $serviceRequest->payment_method,
                            'payment_reference' => $serviceRequest->payment_reference,
                            'payment_proof' => $serviceRequest->payment_proof,
                            'notes' => $serviceRequest->notes,
                            'stay_type' => 'hotel_boarding',
                        ])
                    );

                    if (!$boarding->wasRecentlyCreated) {
                        $boardingUpdates = ['status' => 'approved'];

                        if (!$hasPendingProof && ($boarding->payment_status ?? 'unpaid') !== 'paid') {
                            $boardingUpdates['payment_status'] = 'unpaid';
                        }

                        if ($boardingTotal > 0 && (float) ($boarding->total_amount ?? 0) <= 0) {
                            $boardingUpdates['total_amount'] = $boardingTotal;
                        }

                        $boarding->update($boardingUpdates);
                    }

                    // Keep the boarding's itemized bill anchored to its
                    // authoritative total, like the grooming branch above.
                    // Idempotent — safe when the boarding already exists.
                    \App\Services\ServiceBillingService::ensureBaseServiceItem(
                        ServiceItemUsage::SERVICE_BOARDING,
                        (int) $boarding->id
                    );

                    if ($boardingTotal > 0) {
                        $requestUpdates = [];
                        if (Schema::hasColumn('service_requests', 'total_amount')
                            && (float) ($serviceRequest->total_amount ?? 0) <= 0) {
                            $requestUpdates['total_amount'] = $boardingTotal;
                        }
                        if (Schema::hasColumn('service_requests', 'price')
                            && (float) ($serviceRequest->price ?? 0) <= 0) {
                            $requestUpdates['price'] = $boardingTotal;
                        }
                        if ($requestUpdates) {
                            $serviceRequest->update($requestUpdates);
                        }
                    }
                }
            }

            // Vet: only update existing appointment if one exists (can't create without vet assignment)
            if ($this->requestIsVet($serviceRequest)) {
                if (Schema::hasColumn('appointments', 'service_request_id')) {
                    $appointmentUpdates = ['status' => 'approved'];
                    if ($hasPendingProof) $appointmentUpdates['payment_status'] = 'pending';
                    Appointment::where('service_request_id', $serviceRequest->id)->update($appointmentUpdates);
                }
            }
        }

        $bookingCompleted = $validated['status'] === 'completed' && $previousStatus !== 'completed';
        $notificationTitle = $bookingCompleted ? 'Booking Completed' : 'Service Request Updated';
        $notificationMessage = $bookingCompleted
            ? "Booking SR-{$serviceRequest->id} for {$serviceRequest->service_name} has been completed."
            : "Your {$serviceRequest->service_name} request is now {$validated['status']}.";
        $notificationType = in_array($validated['status'], ['rejected', 'cancelled']) ? 'error' : 'success';

        WorkflowNotifier::notifyEmail(
            $serviceRequest->customer_email,
            $notificationTitle,
            $notificationMessage,
            $notificationType,
            'service_request',
            $serviceRequest->id
        );

        $isNegative = in_array($validated['status'], ['rejected', 'cancelled']);
        app(EmailDeliveryService::class)->lifecycle(
            $serviceRequest->customer_email,
            $notificationTitle,
            $notificationMessage,
            $notificationType,
            [
                'event_key' => $bookingCompleted ? 'booking.completed' : 'service_request.status',
                'occurrence_key' => $bookingCompleted
                    ? "booking.completed:service_request:{$serviceRequest->id}:" . $serviceRequest->updated_at?->format('Uv')
                    : "service_request.status:{$serviceRequest->id}:{$validated['status']}:" . $serviceRequest->updated_at?->format('Uv'),
                'source_type' => 'service_request',
                'source_id' => $serviceRequest->id,
                'user_id' => $serviceRequest->customer_id,
                'content' => [
                    'subject' => $bookingCompleted
                        ? "[Pawesome] Booking Completed — SR-{$serviceRequest->id}"
                        : "[Pawesome] Service Request " . EmailContent::status($validated['status']) . " — SR-{$serviceRequest->id}",
                    'customer_name' => $serviceRequest->customer_name,
                    'intro' => $bookingCompleted
                        ? $notificationMessage . ' Keep booking reference SR-' . $serviceRequest->id . ' for your records.'
                        : ($isNegative
                            ? "We are writing to inform you that your {$serviceRequest->service_name} request is now {$validated['status']}."
                            : "Your {$serviceRequest->service_name} request has been updated. Please review the latest status below."),
                    'details' => [
                        ['label' => 'Reference', 'value' => "SR-{$serviceRequest->id}"],
                        ['label' => 'Service', 'value' => $serviceRequest->service_name],
                        ['label' => 'Pet', 'value' => $serviceRequest->pet_name],
                        ['label' => 'Date', 'value' => EmailContent::date($serviceRequest->request_date)],
                        ['label' => 'Time', 'value' => $serviceRequest->preferred_time ?? $serviceRequest->request_time],
                        ['label' => 'Reason', 'value' => $validated['status'] === 'rejected' ? ($serviceRequest->rejection_reason ?? null) : null],
                    ],
                    'status' => $bookingCompleted ? 'Booking Completed' : EmailContent::status($validated['status']),
                    'status_type' => $isNegative ? 'error' : 'success',
                    'cta_url' => EmailContent::frontendUrl('/customer/bookings'),
                    'cta_label' => $bookingCompleted ? 'View Booking' : 'View Request',
                ],
            ]
        );

        ActivityLog::log(Auth::id() ?? 0, 'service_request_' . $validated['status'], "Service request #{$serviceRequest->id} set to {$validated['status']}", [
            'category' => 'service_requests',
            'reference_type' => 'service_request',
            'reference_id' => $serviceRequest->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Request status updated successfully.',
            'request' => $this->formatRequest($serviceRequest)
        ]);
    }

    public function approve(Request $request, $id)
    {
        $validated = $request->validate([
            'veterinarian_id' => 'nullable|integer|exists:users,id',
            'receptionist_remarks' => 'nullable|string|max:1000',
            'holiday_override' => 'sometimes|boolean',
        ]);

        // Promotion is atomic: the room reservation, promoted booking row,
        // and request status update commit together or roll back together.
        return DB::transaction(function () use ($request, $validated, $id) {
            BookingAvailabilityService::lockServiceSchedule();
            return $this->performApprove($request, $validated, $id);
        });
    }

    private function performApprove(Request $request, array $validated, $id)
    {
        $serviceRequest = ServiceRequest::whereKey($id)->lockForUpdate()->firstOrFail();
        $hasPendingProof = $serviceRequest->payment_status === 'pending' && (bool) $serviceRequest->payment_proof;
        $linkedPaymentStatus = $hasPendingProof
            ? 'pending'
            : (in_array($serviceRequest->payment_status, ['paid', 'partial', 'rejected'], true) ? $serviceRequest->payment_status : 'unpaid');
        $isHotelRequest = $this->requestIsHotel($serviceRequest);
        if (($serviceRequest->status ?? 'pending') === 'pending'
            && $isHotelRequest
            && ($serviceRequest->booking_channel ?? \App\Support\BookingChannel::ONLINE) !== \App\Support\BookingChannel::WALK_IN) {
            $boarding = Boarding::where('service_request_id', $serviceRequest->id)->first();
            if (!$boarding?->vaccination_card || !$boarding->vaccination_card_verified_at) {
                return response()->json(['message' => 'Online hotel requests must use the Pet Hotel reservation flow and have a verified vaccination card before approval.'], 422);
            }
        }
        $isGroomingRequest = $this->requestIsGrooming($serviceRequest);
        $isVetRequest = $this->requestIsVet($serviceRequest) && !$isHotelRequest && !$isGroomingRequest;
        $existingVetAppointment = $isVetRequest && Schema::hasColumn('appointments', 'service_request_id')
            ? Appointment::where('service_request_id', $serviceRequest->id)->latest('id')->lockForUpdate()->first()
            : null;

        // Idempotent approval: re-approving an already-approved request must
        // not re-run the promotion — a second pass would create a duplicate
        // boarding-room reservation and re-send notifications. Return the
        // existing linked records in the same response shape instead.
        if (($serviceRequest->status ?? 'pending') === 'approved' && !$isVetRequest) {
            return response()->json([
                'success' => true,
                'message' => 'Request is already approved.',
                'request' => $this->formatRequest($serviceRequest),
                'appointment' => Appointment::where('service_request_id', $serviceRequest->id)->latest('id')->first(),
                'grooming' => Grooming::where('service_request_id', $serviceRequest->id)->latest('id')->first(),
                'boarding' => Boarding::where('service_request_id', $serviceRequest->id)->latest('id')->first(),
            ]);
        }

        if (($serviceRequest->status ?? 'pending') === 'approved'
            && $isVetRequest
            && $existingVetAppointment?->veterinarian_id) {
            $requestedVetId = (int) ($validated['veterinarian_id'] ?? $existingVetAppointment->veterinarian_id);
            if ($requestedVetId === (int) $existingVetAppointment->veterinarian_id) {
                return response()->json([
                    'success' => true,
                    'message' => 'Request is already approved and assigned.',
                    'request' => $this->formatRequest($serviceRequest),
                    'appointment' => $existingVetAppointment->load(['customer', 'pet', 'service', 'veterinarian']),
                    'grooming' => null,
                    'boarding' => null,
                ]);
            }

            if (!in_array($existingVetAppointment->status, ['pending', 'approved', 'scheduled'], true)) {
                return response()->json([
                    'message' => 'A veterinarian cannot be reassigned after the appointment has started.',
                ], 422);
            }
        }

        $appointment = null;
        $grooming = null;
        $boarding = null;

        $customer = $this->resolveCustomer($serviceRequest);
        $pet = $this->resolvePet($serviceRequest, $customer);

        if (!$customer && $pet) {
            $customer = $pet->customer;
        }

        if ($customer) {
            if (!$serviceRequest->customer_email) {
                $serviceRequest->customer_email = $customer->email;
            }
            if (!$serviceRequest->customer_name) {
                $serviceRequest->customer_name = $customer->name;
            }
        }
        if ($pet && !$serviceRequest->pet_id) {
            $serviceRequest->pet_id = $pet->id;
        }

        // --- Vet requests: create/update Appointment ---
        if ($isVetRequest) {
            $vetId = $validated['veterinarian_id'] ?? $existingVetAppointment?->veterinarian_id;
            $vet = $vetId ? User::find($vetId) : null;

            if (!$vet || !in_array($vet->role, ['veterinary', 'vet', 'veterinarian'], true)) {
                return response()->json(['message' => 'Choose a valid veterinarian before approving this vet request.'], 422);
            }

            $service = $this->resolveService($serviceRequest);

            if (!$customer || !$pet || !$service) {
                return response()->json([
                    'message' => 'This vet request needs a linked customer, pet, and service before it can be assigned.',
                ], 422);
            }

            if ((int) $pet->customer_id !== (int) $customer->id) {
                return response()->json(['message' => 'The selected pet does not belong to this customer.'], 422);
            }

            $scheduledAtLocal = Carbon::parse(
                ($serviceRequest->request_date ?: now(ServiceDurationService::STORE_TIMEZONE)->toDateString()) . ' ' . ($serviceRequest->request_time ?: StoreHours::opensAt()),
                ServiceDurationService::STORE_TIMEZONE
            );
            $scheduledAtUtc = $scheduledAtLocal->copy()->setTimezone('UTC');
            $serviceRequest->request_date = $scheduledAtLocal->toDateString();
            $serviceRequest->request_time = $scheduledAtLocal->format('H:i');
            $allowHoliday = (bool) ($validated['holiday_override'] ?? false);
            if (!$allowHoliday && ($holiday = Holiday::blockedNameOn($scheduledAtLocal->toDateString()))) {
                $date = $scheduledAtLocal->toDateString();
                return response()->json([
                    'message' => "{$date} is a public holiday ({$holiday}). Confirm to approve this appointment anyway.",
                    'error_code' => 'holiday_requires_override',
                    'holiday' => $holiday,
                ], 422);
            }

            if (!$scheduledAtLocal->isFuture() || !BookingAvailabilityService::isServiceTimeAvailable(
                'veterinary',
                $scheduledAtLocal->toDateString(),
                $scheduledAtLocal->format('H:i'),
                $service->name,
                $vet->id,
                $existingVetAppointment?->id,
                $serviceRequest->id,
                false,
                $allowHoliday
            )) {
                return response()->json([
                    'message' => 'The requested schedule conflicts with this veterinarian or is no longer a future bookable time.',
                    'errors' => ['veterinarian_id' => ['Choose another available appointment time or veterinarian.']],
                ], 422);
            }

            if ($existingVetAppointment && !in_array($existingVetAppointment->status, ['pending', 'approved', 'scheduled'], true)) {
                return response()->json([
                    'message' => 'A veterinarian cannot be assigned after the appointment has started.',
                ], 422);
            }

            $appointmentCreated = !$existingVetAppointment;
            $appointmentData = [
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'service_id' => $service->id,
                'scheduled_at' => $scheduledAtUtc,
                'veterinarian_id' => $vet->id,
                'status' => 'approved',
                'payment_status' => $linkedPaymentStatus,
                'notes' => $serviceRequest->notes,
                'price' => $service->price ?? $existingVetAppointment?->price ?? 0,
                'service_request_id' => $serviceRequest->id,
            ];

            if ($existingVetAppointment) {
                $existingVetAppointment->update($appointmentData);
                $appointment = $existingVetAppointment->fresh(['customer', 'pet', 'service', 'veterinarian']);
            } else {
                $appointment = Appointment::create($appointmentData);
            }

            // Notify assigned veterinarian about the new scheduled appointment.
            // On the create path the Appointment::created model hook already
            // notifies the veterinarian via notifyAppointmentCreated().
            if (!$appointmentCreated) {
                WorkflowNotifier::notifyUser($vet->id, 'New Scheduled Appointment', "You have a new veterinary appointment for {$pet->name} scheduled at {$scheduledAtLocal->format('Y-m-d H:i')}.", 'info', 'appointment', $appointment->id);
            }

            // Auto-create base service billing item so vet sees the consultation fee
            $baseItemExists = ServiceItemUsage::where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
                ->where('service_id', $appointment->id)
                ->where('item_type', ServiceItemUsage::ITEM_BASE_SERVICE)
                ->exists();

            if (!$baseItemExists) {
                $servicePrice = (float) ($service->price ?? $appointment->price ?? 0);
                if ($servicePrice > 0) {
                    ServiceItemUsage::create([
                        'service_type' => ServiceItemUsage::SERVICE_VETERINARY,
                        'service_id' => $appointment->id,
                        'pet_id' => $pet->id,
                        'customer_id' => $customer->id,
                        'customer_email' => $customer->email,
                        'item_type' => ServiceItemUsage::ITEM_BASE_SERVICE,
                        'description' => $service->name ?? 'Veterinary Consultation',
                        'quantity_used' => 1,
                        'unit' => 'session',
                        'unit_price' => $servicePrice,
                        'total_price' => $servicePrice,
                        'is_billable' => true,
                        'is_paid' => false,
                        'used_by' => Auth::id(),
                    ]);
                }
            }
        }

        // --- Grooming requests: create/update Grooming record ---
        if ($this->requestIsGrooming($serviceRequest)) {
            if ($customer && $pet) {
                $service = $this->resolveService($serviceRequest);
                $price = $service ? ($service->price ?? 0) : 0;

                $grooming = Grooming::firstOrCreate(
                    ['service_request_id' => $serviceRequest->id],
                    [
                        'customer_id' => $customer->id,
                        'pet_id' => $pet->id,
                        'service' => $serviceRequest->service_name ?? 'Grooming',
                        'appointment_date' => $serviceRequest->request_date,
                        'appointment_time' => $serviceRequest->request_time,
                        'notes' => $serviceRequest->notes,
                        'amount' => $price,
                        'base_amount' => $price,
                        'total_amount' => $price,
                        'balance_due' => $price,
                        'status' => 'approved',
                        'payment_status' => $linkedPaymentStatus,
                    ]
                );

                if (!$grooming->wasRecentlyCreated) {
                    $groomingUpdates = ['status' => 'approved'];

                    if (!$hasPendingProof && ($grooming->payment_status ?? 'unpaid') !== 'paid') {
                        $groomingUpdates['payment_status'] = 'unpaid';
                    }

                    // Repair records auto-created before a price was
                    // resolved — a payable booking must never sit at ₱0.
                    if ($price > 0 && (float) ($grooming->total_amount ?? $grooming->amount ?? 0) <= 0) {
                        $groomingUpdates['amount'] = $price;
                        $groomingUpdates['base_amount'] = $price;
                        $groomingUpdates['total_amount'] = $price;
                        $groomingUpdates['balance_due'] = $price;
                    }

                    $grooming->update($groomingUpdates);
                }

                // Auto-create base service billing item so groomer sees the service fee
                $baseItemExists = ServiceItemUsage::where('service_type', ServiceItemUsage::SERVICE_GROOMING)
                    ->where('service_id', $grooming->id)
                    ->where('item_type', ServiceItemUsage::ITEM_BASE_SERVICE)
                    ->exists();

                if (!$baseItemExists && $price > 0) {
                    ServiceItemUsage::create([
                        'service_type' => ServiceItemUsage::SERVICE_GROOMING,
                        'service_id' => $grooming->id,
                        'pet_id' => $pet->id,
                        'customer_id' => $customer->id,
                        'customer_email' => $customer->email,
                        'item_type' => ServiceItemUsage::ITEM_BASE_SERVICE,
                        'description' => $service->name ?? $serviceRequest->service_name ?? 'Grooming Service',
                        'quantity_used' => 1,
                        'unit' => 'session',
                        'unit_price' => $price,
                        'total_price' => $price,
                        'is_billable' => true,
                        'is_paid' => false,
                        'used_by' => Auth::id(),
                    ]);
                }

                // Persist the resolved payable amount on the request so
                // the cashier queue and settlement never see ₱0.
                if ($price > 0 && (float) ($serviceRequest->price ?? 0) <= 0) {
                    $serviceRequest->price = $price;
                    $serviceRequest->save();
                }
            }
        }

        // --- Hotel requests: create/update Boarding record ---
        if ($this->requestIsHotel($serviceRequest)) {
            if ($customer && $pet) {
                $checkIn = $serviceRequest->request_date;
                $checkOut = $serviceRequest->check_out_date;
                if (!$checkOut && $checkIn) {
                    $checkOut = Carbon::parse($checkIn)->addDay()->toDateString();
                }

                // A hotel booking may not be approved without a persistent
                // room reservation — the customer's selected room, or an
                // auto-assigned compatible room when only a room type was
                // requested. A full/conflicting room is a controlled 422,
                // not a silently unassigned approval.
                $roomService = app(\App\Services\BoardingRoomService::class);
                $roomId = (int) ($serviceRequest->boarding_room_id ?? 0);

                if (!$roomId && $checkIn) {
                    $available = $roomService->getAvailableRooms(
                        $pet->id,
                        $checkIn,
                        $checkOut,
                        $serviceRequest->room_type ?: null
                    );
                    if (($available['success'] ?? false) && !empty($available['rooms'][0]['id'])) {
                        $roomId = (int) $available['rooms'][0]['id'];
                    }
                }

                if (!$roomId) {
                    return response()->json([
                        'message' => 'No compatible boarding room is available for this booking\'s stay dates. Reject the request or ask the customer to choose different dates.',
                    ], 422);
                }

                $reservationResult = $roomService->createRoomReservation(
                    $roomId,
                    'service_request',
                    $serviceRequest->id,
                    $pet->id,
                    $checkIn,
                    $checkOut,
                    $customer->id
                );

                if (!($reservationResult['success'] ?? false)) {
                    return response()->json([
                        'message' => 'The selected boarding room is no longer available: ' . ($reservationResult['message'] ?? 'room unavailable'),
                    ], 422);
                }

                // Mirror the authoritative room details onto the request so
                // the promoted boarding carries the assigned room.
                $assignedRoom = $reservationResult['room'] ?? \App\Models\BoardingRoom::find($roomId);
                if ($assignedRoom && (int) ($serviceRequest->boarding_room_id ?? 0) !== (int) $assignedRoom->id) {
                    $serviceRequest->boarding_room_id = $assignedRoom->id;
                    $serviceRequest->room_name = $assignedRoom->room_name;
                    $serviceRequest->room_type = $assignedRoom->room_type;
                    $serviceRequest->daily_rate = $assignedRoom->daily_rate;
                    $serviceRequest->save();
                }

                // Resolve the payable total: persisted request total →
                // room rate × nights → catalog default. Never leaves ₱0.
                $boardingTotal = (float) ($serviceRequest->total_amount ?? 0);
                if ($boardingTotal <= 0 && is_numeric($serviceRequest->daily_rate ?? null)) {
                    $boardingTotal = (float) $serviceRequest->daily_rate * max(1, (int) ($serviceRequest->total_days ?? 1));
                }
                if ($boardingTotal <= 0) {
                    $boardingTotal = ServiceCatalog::priceFor($serviceRequest->service_name, 'hotel');
                }

                $boarding = Boarding::firstOrCreate(
                    ['service_request_id' => $serviceRequest->id],
                    $this->onlyExistingColumns('boardings', [
                        'pet_id' => $pet->id,
                        'pet_name' => $pet->name ?? $serviceRequest->pet_name,
                        'pet_type' => $pet->species ?? $pet->type ?? $serviceRequest->pet_type,
                        'customer_id' => $customer->id,
                        'customer_name' => $customer->name ?? $serviceRequest->customer_name,
                        'customer_email' => $customer->email ?? $serviceRequest->customer_email,
                        'check_in' => $checkIn,
                        'check_out' => $checkOut,
                        'room_name' => $serviceRequest->room_name,
                        'room_type' => $serviceRequest->room_type,
                        'rate_per_day' => $serviceRequest->daily_rate,
                        'number_of_days' => $serviceRequest->total_days ?? 1,
                        'total_amount' => $boardingTotal,
                        'status' => 'approved',
                        'payment_status' => $linkedPaymentStatus,
                        'payment_method' => $serviceRequest->payment_method,
                        'payment_reference' => $serviceRequest->payment_reference,
                        'payment_proof' => $serviceRequest->payment_proof,
                        'notes' => $serviceRequest->notes,
                        'stay_type' => 'hotel_boarding',
                    ])
                );

                if (!$boarding->wasRecentlyCreated) {
                    $boardingUpdates = ['status' => 'approved'];

                    if (!$hasPendingProof && ($boarding->payment_status ?? 'unpaid') !== 'paid') {
                        $boardingUpdates['payment_status'] = 'unpaid';
                    }

                    if ($boardingTotal > 0 && (float) ($boarding->total_amount ?? 0) <= 0) {
                        $boardingUpdates['total_amount'] = $boardingTotal;
                    }

                    $boarding->update($boardingUpdates);
                }

                \App\Services\ServiceBillingService::ensureBaseServiceItem(
                    ServiceItemUsage::SERVICE_BOARDING,
                    (int) $boarding->id
                );

                if ($boardingTotal > 0) {
                    $requestUpdates = [];
                    if (Schema::hasColumn('service_requests', 'total_amount')
                        && (float) ($serviceRequest->total_amount ?? 0) <= 0) {
                        $requestUpdates['total_amount'] = $boardingTotal;
                    }
                    if (Schema::hasColumn('service_requests', 'price')
                        && (float) ($serviceRequest->price ?? 0) <= 0) {
                        $requestUpdates['price'] = $boardingTotal;
                    }
                    if ($requestUpdates) {
                        $serviceRequest->update($requestUpdates);
                    }
                }
            }
        }

        if (!$hasPendingProof && $serviceRequest->payment_status === 'pending') {
            $serviceRequest->payment_status = 'unpaid';
        }
        $serviceRequest->update([
            'status' => 'approved',
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'receptionist_remarks' => $validated['receptionist_remarks'] ?? 'Approved by receptionist',
        ]);

        if ($hasPendingProof) {
            WorkflowNotifier::notifyRole('cashier', 'Service payment proof ready for verification', "Approved service request #{$serviceRequest->id} has a customer-submitted payment proof.", 'info', 'service_request', $serviceRequest->id);
        }

        $approvalMessage = $hasPendingProof
            ? "Your {$serviceRequest->service_name} request was approved. Cashier verification of your submitted payment proof will begin."
            : "Your {$serviceRequest->service_name} request was approved and is ready for payment.";

        WorkflowNotifier::notifyEmail(
            $serviceRequest->customer_email,
            'Service Request Approved',
            $approvalMessage,
            'success',
            'service_request',
            $serviceRequest->id
        );

        app(EmailDeliveryService::class)->lifecycle(
            $serviceRequest->customer_email,
            'Service Request Approved',
            $approvalMessage,
            'success',
            [
                'event_key' => 'service_request.approved',
                'occurrence_key' => "service_request.approved:{$serviceRequest->id}",
                'source_type' => 'service_request',
                'source_id' => $serviceRequest->id,
                'user_id' => $serviceRequest->customer_id,
                'content' => [
                    'subject' => "[Pawesome] Booking Approved — SR-{$serviceRequest->id}",
                    'customer_name' => $serviceRequest->customer_name,
                    'intro' => $hasPendingProof
                        ? "Your {$serviceRequest->service_name} request has been approved. Our cashier will verify the payment proof you submitted."
                        : "We are pleased to let you know that your {$serviceRequest->service_name} request has been approved by our reception team and is now ready for payment.",
                    'details' => [
                        ['label' => 'Reference', 'value' => "SR-{$serviceRequest->id}"],
                        ['label' => 'Service', 'value' => $serviceRequest->service_name],
                        ['label' => 'Pet', 'value' => $serviceRequest->pet_name],
                        ['label' => 'Scheduled date', 'value' => EmailContent::date($serviceRequest->request_date)],
                        ['label' => 'Scheduled time', 'value' => $serviceRequest->preferred_time ?? $serviceRequest->request_time],
                        ['label' => 'Amount due', 'value' => EmailContent::money($serviceRequest->total_amount ?? $serviceRequest->price)],
                    ],
                    'status' => 'Approved',
                    'status_type' => 'success',
                    'cta_url' => EmailContent::frontendUrl('/customer/my-requests'),
                    'cta_label' => 'View Request',
                ],
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Request approved successfully.',
            'request' => $this->formatRequest($serviceRequest),
            'appointment' => $appointment?->load(['customer', 'pet', 'service', 'veterinarian']),
            'grooming' => $grooming?->load(['customer', 'pet']),
            'boarding' => $boarding?->load(['pet', 'customer']),
        ]);
    }

    public function reject(Request $request, $id)
    {
        $validated = $request->validate([
            'rejection_reason' => 'required|string|max:1000',
            'receptionist_remarks' => 'nullable|string|max:1000',
        ]);

        $serviceRequest = ServiceRequest::findOrFail($id);
        $hasPendingProof = $serviceRequest->payment_status === 'pending' && (bool) $serviceRequest->payment_proof;

        $serviceRequest->update([
            'status' => 'rejected',
            'rejected_by' => $request->user()->id,
            'rejected_at' => now(),
            'rejection_reason' => $validated['rejection_reason'],
            'receptionist_remarks' => $validated['receptionist_remarks'] ?? $validated['rejection_reason'],
        ]);

        // Propagate rejection to linked dedicated records
        $linkedStatus = 'rejected';
        if (Schema::hasColumn('appointments', 'service_request_id')) {
            Appointment::where('service_request_id', $serviceRequest->id)->update(['status' => $linkedStatus]);
        }
        $linkedUpdates = ['status' => $linkedStatus];
        if (!$hasPendingProof) $linkedUpdates['payment_status'] = 'unpaid';
        if (Schema::hasColumn('groomings', 'service_request_id')) {
            Grooming::where('service_request_id', $serviceRequest->id)->update($linkedUpdates);
        }
        if (Schema::hasColumn('boardings', 'service_request_id')) {
            Boarding::where('service_request_id', $serviceRequest->id)->update($linkedUpdates);
        }
        if ($hasPendingProof) {
            WorkflowNotifier::notifyRole('cashier', 'Payment proof requires refund review', "Service request #{$serviceRequest->id} was rejected after proof submission; review the payment before any counter settlement.", 'warning', 'service_request', $serviceRequest->id);
        }

        // Release any room reservation created at approval so the room
        // becomes available again.
        if (Schema::hasTable('boarding_room_reservations')) {
            \App\Models\BoardingRoomReservation::where('source_type', 'service_request')
                ->where('source_id', $serviceRequest->id)
                ->whereNotIn('status', ['cancelled', 'checked_out'])
                ->update(['status' => 'cancelled']);
        }

        WorkflowNotifier::notifyEmail(
            $serviceRequest->customer_email,
            'Service Request Rejected',
            "Your {$serviceRequest->service_name} request was rejected.",
            'error',
            'service_request',
            $serviceRequest->id
        );

        app(EmailDeliveryService::class)->lifecycle(
            $serviceRequest->customer_email,
            'Service Request Rejected',
            "Your {$serviceRequest->service_name} request was rejected.",
            'error',
            [
                'event_key' => 'service_request.rejected',
                'occurrence_key' => "service_request.rejected:{$serviceRequest->id}",
                'source_type' => 'service_request',
                'source_id' => $serviceRequest->id,
                'user_id' => $serviceRequest->customer_id,
                'content' => [
                    'subject' => "[Pawesome] Update Regarding Your Booking — SR-{$serviceRequest->id}",
                    'customer_name' => $serviceRequest->customer_name,
                    'intro' => "We are writing to inform you that your {$serviceRequest->service_name} request could not be approved at this time.",
                    'details' => [
                        ['label' => 'Reference', 'value' => "SR-{$serviceRequest->id}"],
                        ['label' => 'Service', 'value' => $serviceRequest->service_name],
                        ['label' => 'Pet', 'value' => $serviceRequest->pet_name],
                        ['label' => 'Requested date', 'value' => EmailContent::date($serviceRequest->request_date)],
                        ['label' => 'Reason', 'value' => $validated['rejection_reason'] ?? null],
                    ],
                    'status' => 'Rejected',
                    'status_type' => 'error',
                    'cta_url' => EmailContent::frontendUrl('/customer/my-requests'),
                    'cta_label' => 'View Request',
                    'closing' => 'If you have questions about this decision, please contact our reception team or submit a new request.',
                ],
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Request rejected successfully.',
            'request' => $this->formatRequest($serviceRequest),
        ]);
    }
}
