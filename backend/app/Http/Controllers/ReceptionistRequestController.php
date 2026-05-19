<?php

namespace App\Http\Controllers;

use App\Models\ServiceRequest;
use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Models\ActivityLog;
use App\Services\WorkflowNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class ReceptionistRequestController extends Controller
{
    private function requestIsVet(ServiceRequest $serviceRequest): bool
    {
        return strtolower((string) $serviceRequest->request_type) === 'vet'
            || str_contains(strtolower((string) $serviceRequest->service_name), 'vet')
            || str_contains(strtolower((string) $serviceRequest->service_name), 'consult');
    }

    private function resolveCustomer(ServiceRequest $serviceRequest): ?Customer
    {
        if ($serviceRequest->pet_id) {
            $customer = Pet::with('customer')->find($serviceRequest->pet_id)?->customer;

            if ($customer) {
                return $customer;
            }
        }

        if ($serviceRequest->customer_email) {
            $customer = Customer::where('email', $serviceRequest->customer_email)->first();

            if ($customer) {
                return $customer;
            }
        }

        if ($serviceRequest->customer_id) {
            $user = User::find($serviceRequest->customer_id);

            if ($user) {
                $customer = Customer::where('user_id', $user->id)
                    ->orWhere('email', $user->email)
                    ->first();

                if ($customer) {
                    return $customer;
                }
            }

            $customer = Customer::find($serviceRequest->customer_id);

            if ($customer) {
                return $customer;
            }
        }

        if ($serviceRequest->customer_name) {
            $matches = Customer::whereRaw('LOWER(name) = ?', [strtolower($serviceRequest->customer_name)])->get();

            if ($matches->count() === 1) {
                return $matches->first();
            }
        }

        return null;
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
        $serviceName = trim((string) $serviceRequest->service_name);

        if ($serviceName !== '') {
            $service = Service::whereRaw('LOWER(name) = ?', [strtolower($serviceName)])->first();

            if ($service) {
                return $service;
            }

            $category = collect(['Consultation', 'Vaccination', 'Surgery', 'Dental'])
                ->first(fn ($item) => str_contains(strtolower($serviceName), strtolower($item)));

            if ($category) {
                $service = Service::where('category', $category)->first();

                if ($service) {
                    return $service;
                }
            }
        }

        $service = Service::whereIn('category', ['Consultation', 'Vaccination', 'Surgery', 'Dental'])
                ->orderByRaw("CASE category WHEN 'Consultation' THEN 1 WHEN 'Vaccination' THEN 2 WHEN 'Surgery' THEN 3 WHEN 'Dental' THEN 4 ELSE 5 END")
                ->first();

        if ($service) {
            return $service;
        }

        $createData = [
            'category' => 'Consultation',
            'price' => 500,
            'description' => 'Default veterinary consultation service for approved vet requests.',
            'is_active' => true,
        ];

        if (!Schema::hasColumn('services', 'category')) {
            unset($createData['category']);
        }

        if (!Schema::hasColumn('services', 'is_active')) {
            unset($createData['is_active']);
        }

        return Service::firstOrCreate(
            ['name' => 'Veterinary Consultation'],
            $createData
        );
    }

    private function formatRequest(ServiceRequest $item): array
    {
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
            'status' => $item->status,
            'payment_status' => $item->payment_status,
            'payment' => $item->payment_status,
            'notes' => $item->notes,
            'created_at' => $item->created_at,
        ];
    }

    public function index()
    {
        $requests = ServiceRequest::latest()->get()->map(fn ($item) => $this->formatRequest($item));

        return response()->json([
            'success' => true,
            'requests' => $requests
        ]);
    }

    public function pending()
    {
        $requests = ServiceRequest::where('status', 'pending')
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
        $requests = ServiceRequest::whereIn('status', ['approved', 'completed', 'paid'])
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
        $requests = ServiceRequest::whereIn('status', ['scheduled', 'confirmed', 'rescheduled', 'approved'])
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
        $requests = ServiceRequest::whereIn('status', ['rejected', 'cancelled', 'canceled'])
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
            'customer_name' => 'required|string|max:255',
            'customer_email' => 'nullable|email|max:255',
            'pet_name' => 'nullable|string|max:255',
            'service_name' => 'required|string|max:255',
            'request_date' => 'nullable|date',
            'request_time' => 'nullable|string',
            'notes' => 'nullable|string',
            'status' => 'nullable|in:pending,scheduled,approved,rejected',
        ]);

        // Role-based status validation
        $user = $request->user();
        $status = 'pending'; // Default for customers
        
        if ($user && in_array($user->role, ['receptionist', 'admin'])) {
            $status = $validated['status'] ?? 'scheduled'; // Default to scheduled for receptionist/admin
        }

        $createData = [
            'request_type' => $validated['request_type'] ?? $validated['service_type'] ?? 'grooming',
            'customer_name' => $validated['customer_name'],
            'pet_name' => $validated['pet_name'] ?? null,
            'service_name' => $validated['service_name'],
            'request_date' => $validated['request_date'] ?? null,
            'request_time' => $validated['request_time'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'status' => $status,
            'payment_status' => 'pending',
        ];

        if (Schema::hasColumn('service_requests', 'customer_email')) {
            $createData['customer_email'] = $validated['customer_email'] ?? null;
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
            'status' => 'required|in:pending,approved,rejected',
        ]);

        $serviceRequest = ServiceRequest::findOrFail($id);
        $serviceRequest->status = $validated['status'];

        if ($validated['status'] === 'approved') {
            $serviceRequest->payment_status = 'unpaid';
        }

        if ($validated['status'] === 'rejected') {
            $serviceRequest->payment_status = 'unpaid';
        }

        $serviceRequest->save();

        WorkflowNotifier::notifyEmail(
            $serviceRequest->customer_email,
            'Service Request Updated',
            "Your {$serviceRequest->service_name} request is now {$validated['status']}.",
            $validated['status'] === 'rejected' ? 'error' : 'success',
            'service_request',
            $serviceRequest->id
        );

        ActivityLog::log(auth()->id(), 'service_request_' . $validated['status'], "Service request #{$serviceRequest->id} set to {$validated['status']}", [
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
        ]);

        $serviceRequest = ServiceRequest::findOrFail($id);
        $appointment = null;

        if ($this->requestIsVet($serviceRequest)) {
            $vet = User::find($validated['veterinarian_id'] ?? null);

            if (!$vet || !in_array($vet->role, ['veterinary', 'vet', 'veterinarian'], true)) {
                return response()->json(['message' => 'Choose a valid veterinarian before approving this vet request.'], 422);
            }

            $customer = $this->resolveCustomer($serviceRequest);
            $pet = $this->resolvePet($serviceRequest, $customer);

            if (!$customer && $pet) {
                $customer = $pet->customer;
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

            if (!$serviceRequest->pet_id) {
                $serviceRequest->pet_id = $pet->id;
            }

            if (!$serviceRequest->customer_email) {
                $serviceRequest->customer_email = $customer->email;
            }

            if (!$serviceRequest->customer_name) {
                $serviceRequest->customer_name = $customer->name;
            }

            $scheduledAt = $serviceRequest->request_date
                ? Carbon::parse($serviceRequest->request_date . ' ' . ($serviceRequest->request_time ?: '09:00'))
                : now()->addHour();

            $appointment = Appointment::firstOrCreate(
                [
                    'customer_id' => $customer->id,
                    'pet_id' => $pet->id,
                    'service_id' => $service->id,
                    'scheduled_at' => $scheduledAt,
                ],
                [
                    'veterinarian_id' => $vet->id,
                    'status' => 'approved',
                    'notes' => $serviceRequest->notes,
                    'price' => $service->price ?? 0,
                ]
            );

            if (!$appointment->wasRecentlyCreated) {
                $appointment->update([
                    'veterinarian_id' => $vet->id,
                    'status' => 'approved',
                    'notes' => $serviceRequest->notes,
                    'price' => $service->price ?? $appointment->price,
                ]);
            }
        }

        $serviceRequest->update([
            'status' => 'approved',
            'payment_status' => 'unpaid',
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'receptionist_remarks' => $validated['receptionist_remarks'] ?? 'Approved by receptionist',
        ]);

        WorkflowNotifier::notifyEmail(
            $serviceRequest->customer_email,
            'Service Request Approved',
            "Your {$serviceRequest->service_name} request was approved and is ready for payment.",
            'success',
            'service_request',
            $serviceRequest->id
        );

        return response()->json([
            'success' => true,
            'message' => 'Request approved successfully.',
            'request' => $this->formatRequest($serviceRequest),
            'appointment' => $appointment?->load(['customer', 'pet', 'service', 'veterinarian']),
        ]);
    }

    public function reject(Request $request, $id)
    {
        $validated = $request->validate([
            'rejection_reason' => 'required|string|max:1000',
            'receptionist_remarks' => 'nullable|string|max:1000',
        ]);

        $serviceRequest = ServiceRequest::findOrFail($id);

        $serviceRequest->update([
            'status' => 'rejected',
            'rejected_by' => $request->user()->id,
            'rejected_at' => now(),
            'rejection_reason' => $validated['rejection_reason'],
            'receptionist_remarks' => $validated['receptionist_remarks'] ?? $validated['rejection_reason'],
        ]);

        WorkflowNotifier::notifyEmail(
            $serviceRequest->customer_email,
            'Service Request Rejected',
            "Your {$serviceRequest->service_name} request was rejected.",
            'error',
            'service_request',
            $serviceRequest->id
        );

        return response()->json([
            'success' => true,
            'message' => 'Request rejected successfully.',
            'request' => $this->formatRequest($serviceRequest),
        ]);
    }
}
