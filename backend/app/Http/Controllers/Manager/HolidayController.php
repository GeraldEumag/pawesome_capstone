<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Holiday;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HolidayController extends Controller
{
    /** GET /manager/holidays?year=2026 */
    public function index(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);
        $holidays = Holiday::where('year', $year)->orderBy('date')->get();

        return response()->json(['success' => true, 'data' => $holidays]);
    }

    /** POST /manager/holidays */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date'         => 'required|date',
            'name'         => 'required|string|max:255',
            'type'         => 'required|in:regular,special_non_working',
            'is_recurring' => 'boolean',
        ]);

        $date = \Carbon\Carbon::parse($data['date']);
        $data['year'] = $date->year;
        $data['created_by'] = auth()->id();

        $holiday = Holiday::create($data);

        return response()->json(['success' => true, 'data' => $holiday], 201);
    }

    /** PUT /manager/holidays/{holiday} */
    public function update(Request $request, Holiday $holiday): JsonResponse
    {
        $data = $request->validate([
            'date'         => 'sometimes|date',
            'name'         => 'sometimes|string|max:255',
            'type'         => 'sometimes|in:regular,special_non_working',
            'is_recurring' => 'sometimes|boolean',
        ]);

        if (isset($data['date'])) {
            $data['year'] = \Carbon\Carbon::parse($data['date'])->year;
        }

        $holiday->update($data);

        return response()->json(['success' => true, 'data' => $holiday->fresh()]);
    }

    /** DELETE /manager/holidays/{holiday} */
    public function destroy(Holiday $holiday): JsonResponse
    {
        $holiday->delete();
        return response()->json(['success' => true, 'message' => 'Holiday deleted.']);
    }

    /**
     * POST /manager/holidays/generate-recurring?year=2027
     * Auto-generate recurring holidays for a new year based on previous year's
     * is_recurring = true records.
     */
    public function generateRecurring(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year + 1);

        $recurring = Holiday::where('is_recurring', true)
            ->where('year', '!=', $year)
            ->get()
            ->unique('name');

        $created = 0;
        foreach ($recurring as $h) {
            $originalDate = \Carbon\Carbon::parse($h->date);
            $newDate = $originalDate->copy()->setYear($year);

            $exists = Holiday::where('year', $year)->where('name', $h->name)->exists();
            if (!$exists) {
                Holiday::create([
                    'date'         => $newDate->toDateString(),
                    'name'         => $h->name,
                    'type'         => $h->type,
                    'year'         => $year,
                    'is_recurring' => true,
                    'created_by'   => auth()->id(),
                ]);
                $created++;
            }
        }

        return response()->json([
            'success' => true,
            'message' => "{$created} recurring holidays generated for {$year}.",
        ]);
    }
}
