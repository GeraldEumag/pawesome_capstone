<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;

class ReceptionistCustomerController extends Controller
{
    public function index()
    {
        $customers = Customer::withCount('pets')
            ->latest()
            ->get()
            ->map(function ($customer) {
                return [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'phone' => $customer->phone,
                    'email' => $customer->email ?? 'N/A',
                    'address' => $customer->address ?? 'N/A',
                    'notes' => $customer->notes,
                    'joinDate' => $customer->created_at
                        ? $customer->created_at->format('Y-m-d')
                        : null,
                    'totalBookings' => 0,
                    'petsCount' => $customer->pets_count,
                ];
            });

        return response()->json([
            'success' => true,
            'customers' => $customers,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'phone' => 'required|string|max:50',
            'email' => 'nullable|email|max:150',
            'address' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $customer = Customer::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Customer created successfully.',
            'customer' => $customer,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $customer = Customer::find($id);

        if (!$customer) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:150',
            'phone' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:150',
            'address' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $customer->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Customer updated successfully.',
            'customer' => $customer->fresh(),
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $validated = $request->validate([
            'reason' => 'required|string|min:3|max:500',
        ]);

        $customer = Customer::find($id);

        if (!$customer) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        // Match the admin policy: a customer whose pets have any appointment
        // or boarding records cannot be deleted (soft-deleting would orphan
        // reporting/history that joins back to the customer).
        $hasRecords = $customer->pets()->whereHas('appointments')->exists()
            || $customer->pets()->whereHas('boardings')->exists();

        if ($hasRecords) {
            return response()->json([
                'message' => 'Cannot delete a customer whose pets have appointments or boardings.',
            ], 422);
        }

        $customer->deletion_reason = trim($validated['reason']);
        $customer->deleted_by = $request->user()?->id;
        $customer->save();

        // A customer linked to a user account loses portal access too —
        // login rejects inactive users.
        if ($customer->user) {
            $customer->user->is_active = false;
            $customer->user->save();
        }

        $customer->delete();

        return response()->json([
            'success' => true,
            'message' => 'Customer account deleted successfully.',
        ]);
    }
}
