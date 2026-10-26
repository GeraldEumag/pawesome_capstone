<?php

namespace App\Http\Controllers\Veterinary;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\DiagnosticOrder;
use App\Services\DiagnosticOrderService;
use App\Services\FileStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class DiagnosticOrderController extends Controller
{
    public function index(int $appointmentId): JsonResponse
    {
        $orders = DiagnosticOrder::where('appointment_id', $appointmentId)
            ->with('results')
            ->orderByDesc('ordered_at')
            ->get();

        return response()->json(['success' => true, 'orders' => $orders]);
    }

    public function store(Request $request, int $appointmentId): JsonResponse
    {
        $appointment = Appointment::findOrFail($appointmentId);

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'order_type' => 'nullable|in:lab,imaging,other',
            'priority' => 'nullable|in:routine,urgent,stat',
            'notes' => 'nullable|string|max:2000',
            'charge_price' => 'nullable|numeric|min:0',
        ]);
        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        try {
            $order = DiagnosticOrderService::create($appointment, $validator->validated(), $request->user()->id);

            return response()->json(['success' => true, 'order' => $order->fresh('results')], 201);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function collect(Request $request, int $id): JsonResponse
    {
        $order = DiagnosticOrder::findOrFail($id);
        try {
            $order = DiagnosticOrderService::collect($order, $request->user()->id);

            return response()->json(['success' => true, 'order' => $order]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function result(Request $request, int $id): JsonResponse
    {
        $order = DiagnosticOrder::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'findings' => 'required_without:attachment|nullable|string',
            'is_abnormal' => 'nullable|boolean',
            'attachment' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:10240',
        ]);
        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        try {
            $data = $validator->validated();
            if ($request->hasFile('attachment')) {
                $order = FileStorageService::storeAndPersist(
                    $request->file('attachment'),
                    'diagnostic-results',
                    'private',
                    fn ($path) => DiagnosticOrderService::result(
                        $order,
                        array_merge($data, ['attachment_path' => $path]),
                        $request->user()->id
                    ),
                    null,
                    true,
                    'dx' . $order->id
                );
            } else {
                $order = DiagnosticOrderService::result($order, $data, $request->user()->id);
            }

            return response()->json(['success' => true, 'order' => $order->fresh('results')]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function review(Request $request, int $id): JsonResponse
    {
        $order = DiagnosticOrder::findOrFail($id);
        try {
            $order = DiagnosticOrderService::review($order, $request->user()->id);

            return response()->json(['success' => true, 'order' => $order]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $order = DiagnosticOrder::findOrFail($id);
        try {
            $order = DiagnosticOrderService::cancel($order, $request->user()->id, $request->input('reason'));

            return response()->json(['success' => true, 'order' => $order]);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }
}
