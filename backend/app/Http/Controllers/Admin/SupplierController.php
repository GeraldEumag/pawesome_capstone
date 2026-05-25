<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SupplierController extends Controller
{
    public function index(Request $request)
    {
        $query = Supplier::query();

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('contact_person', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        if ($request->has('active_only') && $request->active_only) {
            $query->where('is_active', true);
        }

        $suppliers = $query->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'suppliers' => $suppliers,
            'count' => $suppliers->count(),
        ]);
    }

    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'name' => 'required|string|max:255',
                'contact_person' => 'nullable|string|max:255',
                'phone' => 'nullable|string|max:50',
                'email' => 'nullable|email|max:255',
                'address' => 'nullable|string',
                'notes' => 'nullable|string',
                'is_active' => 'nullable|boolean',
            ]);

            $supplier = Supplier::create($validated);

            return response()->json([
                'success' => true,
                'message' => 'Supplier created successfully',
                'supplier' => $supplier,
            ], 201);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    public function show($id)
    {
        $supplier = Supplier::withCount('inventoryItems')->findOrFail($id);

        return response()->json([
            'success' => true,
            'supplier' => $supplier,
        ]);
    }

    public function update(Request $request, $id)
    {
        try {
            $supplier = Supplier::findOrFail($id);

            $validated = $request->validate([
                'name' => 'sometimes|string|max:255',
                'contact_person' => 'nullable|string|max:255',
                'phone' => 'nullable|string|max:50',
                'email' => 'nullable|email|max:255',
                'address' => 'nullable|string',
                'notes' => 'nullable|string',
                'is_active' => 'nullable|boolean',
            ]);

            $supplier->update($validated);

            return response()->json([
                'success' => true,
                'message' => 'Supplier updated successfully',
                'supplier' => $supplier->fresh(),
            ]);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }

    public function destroy($id)
    {
        try {
            $supplier = Supplier::findOrFail($id);

            // Check if supplier has inventory items
            if ($supplier->inventoryItems()->count() > 0) {
                // Soft-delete approach: just mark inactive
                $supplier->update(['is_active' => false]);
                return response()->json([
                    'success' => true,
                    'message' => 'Supplier has linked inventory items. Marked as inactive instead.',
                    'supplier' => $supplier->fresh(),
                ]);
            }

            $supplier->delete();

            return response()->json([
                'success' => true,
                'message' => 'Supplier deleted successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json(['errors' => [$e->getMessage()]], 422);
        }
    }
}
