<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class LeaveController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = DB::table('leave_requests')
            ->join('users', 'users.id', '=', 'leave_requests.user_id')
            ->select([
                'leave_requests.id',
                'leave_requests.user_id',
                'users.name as employee_name',
                'users.role as employee_role',
                'leave_requests.type',
                'leave_requests.start_date',
                'leave_requests.end_date',
                'leave_requests.reason',
                'leave_requests.status',
                'leave_requests.manager_remarks',
                'leave_requests.reviewed_by',
                'leave_requests.reviewed_at',
                'leave_requests.created_at',
                'leave_requests.updated_at',
            ]);

        if ($request->has('status') && $request->status !== 'all') {
            $query->where('leave_requests.status', $request->status);
        }

        if ($request->has('type') && $request->type !== 'all') {
            $query->where('leave_requests.type', $request->type);
        }

        if ($request->has('month')) {
            $query->whereMonth('leave_requests.start_date', $request->month);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('users.name', 'like', "%{$search}%")
                  ->orWhere('leave_requests.reason', 'like', "%{$search}%");
            });
        }

        $records = $query->orderByDesc('leave_requests.created_at')->get();

        $stats = [
            'pending' => $records->where('status', 'pending')->count(),
            'approved' => $records->where('status', 'approved')->count(),
            'rejected' => $records->where('status', 'rejected')->count(),
            'on_leave_today' => $records->where('status', 'approved')
                ->filter(fn ($r) => $r->start_date <= Carbon::today()->toDateString() && $r->end_date >= Carbon::today()->toDateString())
                ->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => $records,
            'stats' => $stats,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|exists:users,id',
            'type' => 'required|in:sick_leave,vacation_leave,emergency_leave,maternity_leave,paternity_leave,bereavement_leave',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $id = DB::table('leave_requests')->insertGetId([
            'user_id' => $request->user_id,
            'type' => $request->type,
            'start_date' => $request->start_date,
            'end_date' => $request->end_date,
            'reason' => $request->reason,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Leave request created.',
            'data' => ['id' => $id],
        ]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $record = DB::table('leave_requests')->where('id', $id)->first();

        if (!$record) {
            return response()->json(['success' => false, 'message' => 'Leave request not found.'], 404);
        }

        DB::table('leave_requests')->where('id', $id)->update([
            'status' => 'approved',
            'manager_remarks' => $request->input('remarks', ''),
            'reviewed_by' => Auth::id(),
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Leave request approved.',
        ]);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $record = DB::table('leave_requests')->where('id', $id)->first();

        if (!$record) {
            return response()->json(['success' => false, 'message' => 'Leave request not found.'], 404);
        }

        DB::table('leave_requests')->where('id', $id)->update([
            'status' => 'rejected',
            'manager_remarks' => $request->input('remarks', ''),
            'reviewed_by' => Auth::id(),
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Leave request rejected.',
        ]);
    }

    public function calendar(Request $request): JsonResponse
    {
        $year = (int) $request->get('year', Carbon::now()->year);
        $month = (int) $request->get('month', Carbon::now()->month);

        $records = DB::table('leave_requests')
            ->join('users', 'users.id', '=', 'leave_requests.user_id')
            ->where('leave_requests.status', 'approved')
            ->whereYear('leave_requests.start_date', $year)
            ->whereMonth('leave_requests.start_date', $month)
            ->select([
                'leave_requests.id',
                'leave_requests.user_id',
                'users.name as employee_name',
                'leave_requests.type',
                'leave_requests.start_date',
                'leave_requests.end_date',
            ])
            ->get();

        return response()->json([
            'success' => true,
            'data' => $records,
        ]);
    }
}
