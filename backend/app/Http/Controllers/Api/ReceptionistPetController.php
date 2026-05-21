<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pet;
use Illuminate\Http\Request;

class ReceptionistPetController extends Controller
{
    public function index()
    {
        $pets = Pet::latest()
            ->get()
            ->map(function ($pet) {
                return [
                    'id' => $pet->id,
                    'customerId' => $pet->customer_id,
                    'name' => $pet->name,
                    'type' => $pet->type ?? $pet->species ?? 'Pet',
                    'species' => $pet->species ?? $pet->type ?? 'Pet',
                    'breed' => $pet->breed ?? 'Unknown',
                    'age' => $pet->age ?? 'N/A',
                    'image' => $pet->image ?? 'https://placehold.co/120x120?text=Pet',
                    'image_url' => $pet->image_url,
                ];
            });

        return response()->json([
            'success' => true,
            'pets' => $pets,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'customer_id' => 'required|exists:customers,id',
            'name' => 'required|string|max:150',
            'type' => 'nullable|string|max:100',
            'species' => 'nullable|string|max:100',
            'breed' => 'nullable|string|max:100',
            'age' => 'nullable|string|max:50',
            'image' => 'nullable|string',
        ]);

        $pet = Pet::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Pet created successfully.',
            'pet' => $pet,
        ], 201);
    }
}
