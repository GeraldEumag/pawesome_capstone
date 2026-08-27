<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class AttendanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Attendance::with(['user', 'approver']);

        // Filter by date
        if ($request->has('date')) {
            $query->forDate($request->date);
        }

        // Filter by user
        if ($request->has('user_id')) {
            $query->forUser($request->user_id);
        }

        // Filter by date range
        if ($request->has('start_date') && $request->has('end_date')) {
            $query->forPeriod($request->start_date, $request->end_date);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by department (via user relationship)
        if ($request->has('department')) {
            $query->whereHas('user', function ($q) use ($request) {
                $q->where('department', $request->department);
            });
        }

        // Search by name or email
        if ($request->has('search')) {
            $search = $request->search;
            $query->whereHas('user', function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $attendance = $query->orderBy('date', 'desc')->orderBy('check_in', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $attendance,
            'count' => $attendance->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'date' => 'required|date',
            'check_in' => 'nullable|date_format:H:i',
            'check_out' => 'nullable|date_format:H:i',
            'break_time' => 'nullable|date_format:H:i',
            'status' => 'nullable|in:present,absent,late,early_leave,on_leave',
            'location' => 'nullable|string',
            'notes' => 'nullable|string',
            'salary_rate' => 'nullable|numeric',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        // Check for duplicate attendance record
        $existing = Attendance::where('user_id', $request->user_id)
            ->where('date', $request->date)
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record already exists for this user on this date.',
            ], 422);
        }

        $user = User::find($request->user_id);

        $attendanceData = $request->all();
        $attendanceData['salary_rate'] = $request->salary_rate ?? $user->hourly_rate ?? ($user->base_salary / 160);
        $attendanceData['approved_by'] = auth()->id();

        $attendance = Attendance::create($attendanceData);

        return response()->json([
            'success' => true,
            'message' => 'Attendance record created successfully.',
            'data' => $attendance->load(['user', 'approver']),
        ], 201);
    }

    public function show($id): JsonResponse
    {
        $attendance = Attendance::with(['user', 'approver'])->find($id);

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $attendance,
        ]);
    }

    public function update(Request $request, $id): JsonResponse
    {
        $attendance = Attendance::find($id);

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record not found.',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'check_in' => 'nullable|date_format:H:i',
            'check_out' => 'nullable|date_format:H:i',
            'break_time' => 'nullable|date_format:H:i',
            'status' => 'nullable|in:present,absent,late,early_leave,on_leave',
            'location' => 'nullable|string',
            'notes' => 'nullable|string',
            'remarks' => 'nullable|string',
            'review_status' => 'nullable|in:pending,reviewed,rejected',
            'salary_rate' => 'nullable|numeric',
            'source' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $attendance->update($request->all());

        return response()->json([
            'success' => true,
            'message' => 'Attendance record updated successfully.',
            'data' => $attendance->fresh()->load(['user', 'approver']),
        ]);
    }

    public function destroy($id): JsonResponse
    {
        $attendance = Attendance::find($id);

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'Attendance record not found.',
            ], 404);
        }

        $attendance->delete();

        return response()->json([
            'success' => true,
            'message' => 'Attendance record deleted successfully.',
        ]);
    }

    public function today(Request $request): JsonResponse
    {
        $today = Carbon::today()->toDateString();
        $query = Attendance::with('user')->forDate($today);

        if ($request->has('department')) {
            $query->whereHas('user', function ($q) use ($request) {
                $q->where('department', $request->department);
            });
        }

        $attendance = $query->get();

        // Calculate statistics
        $stats = [
            'total' => $attendance->count(),
            'present' => $attendance->whereIn('status', ['present', 'late', 'early_leave'])->count(),
            'absent' => $attendance->where('status', 'absent')->count(),
            'late' => $attendance->where('is_late', true)->count(),
            'early_leave' => $attendance->where('is_early_leave', true)->count(),
            'on_leave' => $attendance->where('status', 'on_leave')->count(),
        ];

        return response()->json([
            'success' => true,
            'date' => $today,
            'statistics' => $stats,
            'data' => $attendance,
        ]);
    }

    public function statistics(Request $request): JsonResponse
    {
        $startDate = $request->get('start_date', Carbon::now()->startOfMonth()->toDateString());
        $endDate = $request->get('end_date', Carbon::now()->endOfMonth()->toDateString());

        $query = Attendance::forPeriod($startDate, $endDate);

        if ($request->has('user_id')) {
            $query->forUser($request->user_id);
        }

        if ($request->has('department')) {
            $query->whereHas('user', function ($q) use ($request) {
                $q->where('department', $request->department);
            });
        }

        $attendance = $query->get();

        $stats = [
            'period_start' => $startDate,
            'period_end' => $endDate,
            'total_records' => $attendance->count(),
            'present_days' => $attendance->whereIn('status', ['present', 'late', 'early_leave'])->count(),
            'absent_days' => $attendance->where('status', 'absent')->count(),
            'late_count' => $attendance->where('is_late', true)->count(),
            'early_leave_count' => $attendance->where('is_early_leave', true)->count(),
            'total_hours' => $attendance->sum('total_hours'),
            'overtime_hours' => $attendance->sum('overtime_hours'),
            'total_earnings' => $attendance->sum('daily_earnings'),
        ];

        return response()->json([
            'success' => true,
            'statistics' => $stats,
        ]);
    }

    public function checkIn(Request $request): JsonResponse
    {
        $userId = auth()->id();
        $today = Carbon::today()->toDateString();
        $now = Carbon::now()->format('H:i');

        // Check if already checked in today
        $existing = Attendance::where('user_id', $userId)
            ->where('date', $today)
            ->first();

        if ($existing && $existing->check_in) {
            return response()->json([
                'success' => false,
                'message' => 'Already checked in today.',
            ], 422);
        }

        $user = User::find($userId);

        if ($existing) {
            $existing->update([
                'check_in' => $now,
                'location' => $request->location,
            ]);
            $attendance = $existing;
        } else {
            $attendance = Attendance::create([
                'user_id' => $userId,
                'date' => $today,
                'check_in' => $now,
                'location' => $request->location,
                'salary_rate' => $user->hourly_rate ?? ($user->base_salary / 160),
                'approved_by' => $userId,
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Check-in successful.',
            'data' => $attendance,
        ]);
    }

    public function checkOut(Request $request): JsonResponse
    {
        $userId = auth()->id();
        $today = Carbon::today()->toDateString();
        $now = Carbon::now()->format('H:i');

        $attendance = Attendance::where('user_id', $userId)
            ->where('date', $today)
            ->first();

        if (!$attendance) {
            return response()->json([
                'success' => false,
                'message' => 'No check-in record found for today.',
            ], 404);
        }

        if (!$attendance->check_in) {
            return response()->json([
                'success' => false,
                'message' => 'Please check in first.',
            ], 422);
        }

        if ($attendance->check_out) {
            return response()->json([
                'success' => false,
                'message' => 'Already checked out today.',
            ], 422);
        }

        $attendance->update([
            'check_out' => $now,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Check-out successful.',
            'data' => $attendance->fresh(),
        ]);
    }

    public function export(Request $request): JsonResponse
    {
        $format = $request->get('format', 'json');
        
        $query = Attendance::with('user');

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->forPeriod($request->start_date, $request->end_date);
        }

        if ($request->has('user_id')) {
            $query->forUser($request->user_id);
        }

        $data = $query->get();

        if ($format === 'excel' || $format === 'csv') {
            // For now, return JSON - in production, use a package like maatwebsite/excel
            return response()->json([
                'success' => true,
                'message' => 'Export data prepared.',
                'format' => $format,
                'data' => $data,
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }
}
