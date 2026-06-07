<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Grooming;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\ActivityLog;
use App\Models\Pet;
use App\Models\BoardingRoom;
use App\Services\WorkflowNotifier;
use App\Services\BookingAvailabilityService;
use App\Services\PetServiceCompatibilityService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ServiceRequestController extends Controller
{
    private function normalizeServiceType(string $requestType): string
    {
        return match (strtolower(trim($requestType))) {
            'vet', 'veterinary', 'appointment', 'vet appointment' => 'veterinary',
            'hotel', 'boarding', 'pet hotel', 'pet_hotel' => 'petHotel',
            default => strtolower(trim($requestType)),
        };
    }

    private function formatRequest(object $item): array
    {
        return [
            'id' => $item->id,
            'customer_id' => $item->customer_id,
            'customer' => $item->customer_name,
            'customer_name' => $item->customer_name,
            'email' => $item->customer_email,
            'customer_email' => $item->customer_email,
            'pet_id' => $item->pet_id,
            'pet' => $item->pet_name,
            'pet_name' => $item->pet_name,
            'type' => $item->request_type,
            'request_type' => $item->request_type,
            'service_type' => $item->service_name,
            'service' => $item->service_name,
            'service_name' => $item->service_name,
            'date' => $item->request_date,
            'request_date' => $item->request_date,
            'requested_date' => $item->request_date,
            'time' => $item->request_time,
            'request_time' => $item->request_time,
            'notes' => $item->notes,
            'status' => $item->status,
            'price' => $item->price,
            'amount' => $item->price,
            'payment' => $item->payment_status,
            'payment_status' => $item->payment_status,
            'payment_method' => $item->payment_method,
            'payment_reference' => $item->payment_reference,
            'payment_proof' => $item->payment_proof,
            'created_at' => $item->created_at,
        ];
    }

    public function store(Request $request)
    {
        // Map frontend field names to backend field names before validation
        $request->merge([
            'request_type' => $request->request_type ?? $request->service_type,
            'requested_date' => $request->requested_date ?? $request->request_date ?? $request->preferred_date,
            'requested_time' => $request->requested_time ?? $request->request_time ?? $request->preferred_time,
        ]);

        $isHotel = in_array(strtolower($request->request_type ?? ''), ['hotel', 'boarding']);

        $validated = $request->validate([
            'customer_name' => 'required|string|max:150',
            'customer_email' => 'nullable|email|max:150',
            'pet_id' => 'nullable|integer|exists:pets,id',
            'pet_name' => 'required|string|max:150',
            'request_type' => 'required|string|max:150',
            'service_name' => 'nullable|string|max:150',
            'requested_date' => 'required|date|after_or_equal:today',
            'requested_time' => $isHotel ? 'nullable|date_format:H:i' : 'required|date_format:H:i',
            'notes' => 'nullable|string',
            'check_out_date' => 'nullable|date|after_or_equal:requested_date',
            'boarding_room_id' => 'nullable|integer|exists:boarding_rooms,id',
            'room_name' => 'nullable|string|max:255',
            'room_type' => 'nullable|string|max:255',
            'daily_rate' => 'nullable|numeric|min:0',
            'total_days' => 'nullable|integer|min:1',
            'total_amount' => 'nullable|numeric|min:0',
            'price' => 'nullable|numeric|min:0',
        ]);

        $pet = null;

        if (Auth::check() && !empty($validated['pet_id'])) {
            $pet = Pet::with('customer')->find($validated['pet_id']);
            $customer = $pet?->customer;
            $user = Auth::user();

            $ownsPet = $customer
                && (
                    (int) ($customer->user_id ?? 0) === (int) $user->id
                    || ($customer->email && $customer->email === $user->email)
                );

            if (!$ownsPet) {
                return response()->json([
                    'message' => 'You can only book services for your own pets.',
                ], 403);
            }

            if ($pet->isArchived()) {
                return response()->json([
                    'message' => 'Archived pets cannot be used for new bookings. Please restore the pet first.',
                    'errors' => ['pet_id' => ['Archived pets cannot be booked.']],
                ], 422);
            }

            $serviceType = $this->normalizeServiceType($validated['request_type']);
            $compatibility = PetServiceCompatibilityService::validateServiceCompatibility($pet->id, $serviceType);

            if (!($compatibility['valid'] ?? false)) {
                return response()->json([
                    'message' => $compatibility['message'] ?? 'This service is not available for this pet species.',
                    'errors' => ['pet_id' => [$compatibility['message'] ?? 'This service is not available for this pet species.']],
                    'error_code' => $compatibility['error_code'] ?? 'service_not_allowed',
                ], 422);
            }
        }

        // Validate business hours (skip for hotel bookings which don't use time slots)
        $time = $validated['requested_time'] ?? '00:00';
        if (!$isHotel && ($time < '09:00' || $time > '18:00')) {
            return response()->json([
                'message' => 'Selected time is outside shop opening hours. Please choose between 9:00 AM and 6:00 PM.',
            ], 422);
        }

        // Check availability for grooming requests
        if ($validated['request_type'] === 'grooming') {
            if (!BookingAvailabilityService::isGroomingDateAvailable($validated['requested_date'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'This grooming date is already reserved. Please choose another date.',
                    'errors' => ['requested_date' => ['Date already booked']]
                ], 422);
            }
        }

        if (!empty($validated['pet_id'])) {
            $duplicateExists = ServiceRequest::where('pet_id', $validated['pet_id'])
                ->where('request_type', $validated['request_type'])
                ->where('request_date', $validated['requested_date'])
                ->where('request_time', $validated['requested_time'])
                ->whereNotIn('status', ['cancelled', 'rejected', 'completed'])
                ->exists();

            if ($duplicateExists) {
                return response()->json([
                    'success' => false,
                    'message' => 'This pet already has a booking for the selected service, date, and time.',
                    'errors' => ['requested_time' => ['Duplicate booking for this pet and time.']],
                ], 422);
            }
        }

        // Resolve price from submitted data or service lookup
        $price = $validated['price'] ?? null;
        if (!$price && !empty($validated['service_name'])) {
            $svc = Service::whereRaw('LOWER(name) = ?', [strtolower($validated['service_name'])])->first();
            if ($svc) {
                $price = $svc->price;
            }
        }

        $createData = [
            'request_type' => $validated['request_type'],
            'customer_name' => $validated['customer_name'],
            'pet_name' => $validated['pet_name'],
            'service_name' => $validated['service_name'] ?? $validated['request_type'], // Use request_type as service_name fallback
            // Use requested_date/time as primary, fallback to preferred_date/time
            'request_date' => $validated['requested_date'],
            'request_time' => $validated['requested_time'],
            'preferred_date' => $validated['requested_date'],
            'preferred_time' => $validated['requested_time'],
            'notes' => $validated['notes'] ?? null,
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ];

        if (Schema::hasColumn('service_requests', 'price')) {
            $createData['price'] = $price;
        }

        if (Schema::hasColumn('service_requests', 'customer_email')) {
            $createData['customer_email'] = $validated['customer_email'] ?? null;
        }

        if (Schema::hasColumn('service_requests', 'pet_id') && !empty($validated['pet_id'])) {
            $createData['pet_id'] = $validated['pet_id'];
        }

        if (Schema::hasColumn('service_requests', 'pet_type') && $pet) {
            $createData['pet_type'] = $pet->species ?? $pet->type;
        }

        // Add room data for hotel/boarding bookings
        if ($isHotel) {
            if (!empty($validated['boarding_room_id'])) {
                // Get room details from boarding_rooms table
                $room = \App\Models\BoardingRoom::find($validated['boarding_room_id']);
                if ($room) {
                    $createData['boarding_room_id'] = $room->id;
                    $createData['room_name'] = $room->room_name;
                    $createData['room_type'] = $room->room_type;
                    $createData['daily_rate'] = $room->daily_rate;
                }
            }

            // Use provided check_out_date or calculate from request
            if (!empty($validated['check_out_date'])) {
                $createData['check_out_date'] = $validated['check_out_date'];
            }
            if (!empty($validated['total_days'])) {
                $createData['total_days'] = $validated['total_days'];
            }
            if (!empty($validated['total_amount'])) {
                $createData['total_amount'] = $validated['total_amount'];
            }
        }

        // Add customer_id if user is authenticated
        if (Auth::check()) {
            $createData['customer_id'] = Auth::id();
        }

        $serviceRequest = ServiceRequest::create($createData);

        // Auto-create a pending Grooming record so groomer dashboard can see customer bookings
        if ($this->normalizeServiceType($validated['request_type']) === 'grooming') {
            try {
                $groomingPet = null;
                if (!empty($validated['pet_id'])) {
                    $groomingPet = Pet::find($validated['pet_id']);
                }
                $groomingCustomer = $groomingPet?->customer;
                if (!$groomingCustomer && !empty($validated['customer_email'])) {
                    $groomingCustomer = Customer::where('email', $validated['customer_email'])->first();
                }

                if ($groomingCustomer && $groomingPet) {
                    $price = $serviceRequest->price ?? 0;

                    $groomingData = [
                        'customer_id' => $groomingCustomer->id,
                        'pet_id' => $groomingPet->id,
                        'service' => $validated['service_name'] ?? 'Grooming',
                        'appointment_date' => $validated['requested_date'],
                        'appointment_time' => $validated['requested_time'] ?? '09:00',
                        'notes' => $validated['notes'] ?? null,
                        'amount' => $price,
                        'base_amount' => $price,
                        'total_amount' => $price,
                        'balance_due' => $price,
                        'status' => 'pending',
                        'payment_status' => 'unpaid',
                    ];

                    if (Schema::hasColumn('groomings', 'service_request_id')) {
                        $groomingData['service_request_id'] = $serviceRequest->id;
                    }

                    Grooming::create($groomingData);
                }
            } catch (\Throwable $e) {
                Log::warning('Auto-create grooming failed for service request #' . $serviceRequest->id . ': ' . $e->getMessage());
            }
        }

        WorkflowNotifier::notifyRole(
            'receptionist',
            'New Service Request',
            "{$serviceRequest->customer_name} submitted a {$serviceRequest->request_type} request.",
            'info',
            'service_request',
            $serviceRequest->id,
            ['customer_email' => $serviceRequest->customer_email]
        );

        WorkflowNotifier::notifyEmail(
            $serviceRequest->customer_email,
            'Service Request Submitted',
            "Your {$serviceRequest->service_name} request is waiting for receptionist approval.",
            'info',
            'service_request',
            $serviceRequest->id
        );

        return response()->json([
            'success' => true,
            'message' => 'Booking request submitted successfully.',
            'request' => $this->formatRequest($serviceRequest),
        ], 201);
    }

    public function receptionistRequests()
    {
        $requests = ServiceRequest::latest()
            ->get()
            ->map(fn ($item) => $this->formatRequest($item));

        return response()->json([
            'success' => true,
            'requests' => $requests,
        ]);
    }

    public function customerRequests(Request $request)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized.',
            ], 401);
        }

        $query = ServiceRequest::query();

        $query->where(function ($scopedQuery) use ($user) {
            // Use AND logic to ensure we only get the current customer's requests
            if (Schema::hasColumn('service_requests', 'customer_id')) {
                $scopedQuery->where('customer_id', $user->id);
            } elseif (Schema::hasColumn('service_requests', 'customer_email') && $user->email) {
                $scopedQuery->where('customer_email', $user->email);
            } else {
                // Fallback: no requests if no proper customer identification field exists
                $scopedQuery->whereRaw('1 = 0');
            }
        });

        $requests = $query
            ->latest()
            ->get()
            ->map(fn ($item) => $this->formatRequest($item));

        return response()->json([
            'success' => true,
            'requests' => $requests,
        ]);
    }

    public function cancel(Request $request, $id)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized.',
            ], 401);
        }

        $serviceRequest = ServiceRequest::findOrFail($id);

        if (!$this->customerOwnsRequest($serviceRequest, $user)) {
            return response()->json(['message' => 'Request not found'], 404);
        }

        if ($serviceRequest->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending requests can be cancelled.',
            ], 422);
        }

        $serviceRequest->update([
            'status' => 'cancelled',
            'payment_status' => 'unpaid',
        ]);

        // Cancel related room reservation if this is a hotel/boarding request
        if ($serviceRequest->request_type === 'hotel' || $serviceRequest->request_type === 'boarding') {
            $reservation = \App\Models\BoardingRoomReservation::where('source_type', 'service_request')
                ->where('source_id', $serviceRequest->id)
                ->first();
            if ($reservation) {
                $reservation->update(['status' => 'cancelled']);
            }
        }

        WorkflowNotifier::notifyRole(
            'receptionist',
            'Service Request Cancelled',
            "{$serviceRequest->customer_name} cancelled a {$serviceRequest->service_name} request.",
            'warning',
            'service_request',
            $serviceRequest->id,
            ['customer_email' => $serviceRequest->customer_email]
        );

        ActivityLog::log($user->id, 'service_request_cancelled', "Customer cancelled service request #{$serviceRequest->id}", [
            'category' => 'service_requests',
            'reference_type' => 'service_request',
            'reference_id' => $serviceRequest->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Request cancelled successfully.',
            'request' => $this->formatRequest($serviceRequest),
        ]);
    }

    public function updateStatus(Request $request, $id)
    {
        $validated = $request->validate([
            'status' => 'required|in:pending,approved,rejected,rescheduled',
        ]);

        /** @var ServiceRequest|null $serviceRequest */
        $serviceRequest = ServiceRequest::find($id);

        if (!$serviceRequest) {
            return response()->json([
                'success' => false,
                'message' => 'Request not found.',
            ], 404);
        }

        $paymentStatus = $validated['status'] === 'approved'
            ? 'unpaid'
            : 'unpaid';

        $serviceRequest->update([
            'status' => $validated['status'],
            'payment_status' => $paymentStatus,
        ]);

        // Create room reservation if this is a hotel/boarding approval
        if ($validated['status'] === 'approved' && ($serviceRequest->request_type === 'hotel' || $serviceRequest->request_type === 'boarding')) {
            if (!empty($serviceRequest->boarding_room_id)) {
                // Get room details and create reservation
                $room = \App\Models\BoardingRoom::find($serviceRequest->boarding_room_id);
                if ($room) {
                    // Check availability one more time before creating reservation
                    $existingReservations = \App\Models\BoardingRoomReservation::where('room_id', $room->id)
                        ->where('check_in_date', '<', $serviceRequest->check_out_date ?? $serviceRequest->check_in_date)
                        ->where('check_out_date', '>', $serviceRequest->check_in_date ?? $serviceRequest->check_in_date)
                        ->whereIn('status', ['pending', 'approved', 'scheduled', 'checked_in'])
                        ->count();
                    
                    $availableRooms = $room->total_rooms - $existingReservations;
                    
                    if ($availableRooms > 0) {
                        // Create room reservation
                        $reservation = \App\Models\BoardingRoomReservation::create([
                            'room_id' => $room->id,
                            'source_type' => 'service_request',
                            'source_id' => $serviceRequest->id,
                            'pet_id' => $serviceRequest->pet_id,
                            'customer_id' => $serviceRequest->customer_id,
                            'check_in_date' => $serviceRequest->check_in_date ?? $serviceRequest->check_in_date,
                            'check_out_date' => $serviceRequest->check_out_date ?? $serviceRequest->check_in_date,
                            'status' => 'approved',
                        ]);
                        
                        // Create billing record for hotel stay
                        $checkIn = Carbon::parse($serviceRequest->check_in_date ?? $serviceRequest->check_in_date);
                        $checkOut = Carbon::parse($serviceRequest->check_out_date ?? $serviceRequest->check_in_date);
                        $totalDays = $checkIn->diffInDays($checkOut);
                        
                        \App\Models\ServiceItemUsage::create([
                            'service_type' => 'boarding',
                            'service_id' => $serviceRequest->id,
                            'item_type' => 'base_service',
                            'description' => $room->room_name . ' - ' . $totalDays . ' days',
                            'quantity_used' => $totalDays,
                            'unit' => 'day',
                            'unit_price' => $room->daily_rate,
                            'total_price' => $room->daily_rate * $totalDays,
                            'is_billable' => true,
                            'is_paid' => false,
                            'pet_id' => $serviceRequest->pet_id,
                            'customer_id' => $serviceRequest->customer_id,
                        ]);
                    }
                }
            }
        }

        WorkflowNotifier::notifyEmail(
            $serviceRequest->customer_email,
            'Service Request Updated',
            "Your {$serviceRequest->service_name} request is now {$validated['status']}.",
            $validated['status'] === 'rejected' ? 'error' : 'success',
            'service_request',
            $serviceRequest->id
        );

        ActivityLog::log(Auth::id() ?? 0, 'service_request_' . $validated['status'], "Service request #{$serviceRequest->id} set to {$validated['status']}", [
            'category' => 'service_requests',
            'reference_type' => 'service_request',
            'reference_id' => $serviceRequest->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Request status updated successfully.',
            'request' => $this->formatRequest($serviceRequest),
        ]);
    }

    public function uploadPaymentProof(Request $request, $id)
    {
        $user = Auth::user();
        
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'payment_method' => 'nullable|string|max:255',
            'payment_reference' => 'nullable|string|max:255',
            'payment_proof' => 'required|file|mimes:jpg,jpeg,png,pdf|max:5120',
        ]);

        $serviceRequest = ServiceRequest::findOrFail($id);

        if (!$this->customerOwnsRequest($serviceRequest, $user)) {
            return response()->json(['message' => 'Forbidden: You can only upload proof for your own requests'], 403);
        }

        // Only allow payment proof upload for approved or scheduled requests
        if (!in_array($serviceRequest->status, ['approved', 'scheduled'])) {
            return response()->json([
                'message' => 'Payment proof can only be uploaded for approved requests.',
            ], 403);
        }

        // Reject upload if payment is already pending or paid
        if (in_array($serviceRequest->payment_status, ['pending', 'paid'])) {
            return response()->json([
                'message' => 'Payment proof has already been uploaded or payment is verified.',
            ], 422);
        }

        // Store the uploaded file in private storage
        $originalName = $request->file('payment_proof')->getClientOriginalName();
        $extension = $request->file('payment_proof')->getClientOriginalExtension();
        $randomName = 'proof_' . time() . '_' . Str::random(10) . '.' . $extension;
        $path = $request->file('payment_proof')->storeAs('payment-proofs', $randomName, 'private');

        $serviceRequest->update([
            'payment_method' => $validated['payment_method'] ?? 'Online Payment',
            'payment_reference' => $validated['payment_reference'],
            'payment_proof' => $path,
            'payment_status' => 'pending',
        ]);

        // Notify cashier role
        $this->notifyRole(
            'cashier',
            'New Payment Proof Uploaded',
            'A customer uploaded payment proof for service request #' . $serviceRequest->id,
            'info',
            'service_request',
            $serviceRequest->id
        );

        ActivityLog::log($user->id, 'payment_proof_uploaded', "Customer uploaded proof for service request #{$serviceRequest->id}", [
            'category' => 'service_requests',
            'reference_type' => 'service_request',
            'reference_id' => $serviceRequest->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payment proof uploaded successfully. Waiting for cashier verification.',
            'request' => $this->formatRequest($serviceRequest),
            'payment_status' => 'pending',
            'proof_url' => $path ? "/api/files/payment-proofs/service-request/{$serviceRequest->id}/view" : null,
        ]);
    }

    public function receipt(Request $request, $id)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $serviceRequest = ServiceRequest::findOrFail($id);

        $isOwner = false;
        if (Schema::hasColumn('service_requests', 'customer_id') && $serviceRequest->customer_id) {
            $isOwner = (int) $serviceRequest->customer_id === (int) $user->id;
        } elseif (Schema::hasColumn('service_requests', 'customer_email') && $serviceRequest->customer_email) {
            $isOwner = $serviceRequest->customer_email === $user->email;
        }

        if (!$isOwner) {
            return response()->json(['message' => 'Receipt not found'], 404);
        }

        if ($serviceRequest->payment_status !== 'paid') {
            return response()->json([
                'message' => 'Receipt is only available after payment verification.',
            ], 422);
        }

        return response()->json([
            'receipt' => [
                'receipt_number' => $serviceRequest->receipt_number,
                'request_id' => $serviceRequest->id,
                'customer_name' => $serviceRequest->customer_name,
                'customer_email' => $serviceRequest->customer_email,
                'pet_name' => $serviceRequest->pet_name,
                'service_type' => $serviceRequest->request_type ?? $serviceRequest->service_type,
                'service_name' => $serviceRequest->service_name,
                'service_date' => $serviceRequest->request_date,
                'total_amount' => $serviceRequest->total_amount ?? $serviceRequest->price ?? 500,
                'payment_status' => $serviceRequest->payment_status,
                'payment_method' => $serviceRequest->payment_method,
                'payment_reference' => $serviceRequest->payment_reference,
                'paid_at' => $serviceRequest->paid_at,
                'verified_by' => $serviceRequest->verified_by,
                'cashier_remarks' => $serviceRequest->cashier_remarks,
                'created_at' => $serviceRequest->created_at,
            ],
        ]);
    }

    private function notifyRole($role, $title, $message, $type = 'info', $relatedType = null, $relatedId = null, $data = [])
    {
        try {
            $users = \App\Models\User::where('role', $role)
                ->where('is_active', true)
                ->get();

            foreach ($users as $user) {
                \App\Models\Notification::create([
                    'user_id' => $user->id,
                    'role' => $role,
                    'title' => $title,
                    'message' => $message,
                    'type' => $type,
                    'related_type' => $relatedType,
                    'related_id' => $relatedId,
                    'data' => !empty($data) ? json_encode($data) : null,
                    'read' => false,
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('notifyRole failed: ' . $e->getMessage());
        }
    }

    private function customerOwnsRequest(ServiceRequest $serviceRequest, $user): bool
    {
        if (Schema::hasColumn('service_requests', 'customer_id') && $serviceRequest->customer_id) {
            return (int) $serviceRequest->customer_id === (int) $user->id;
        }

        return Schema::hasColumn('service_requests', 'customer_email')
            && $serviceRequest->customer_email
            && $serviceRequest->customer_email === $user->email;
    }
}
