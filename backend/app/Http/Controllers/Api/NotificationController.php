<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $role = $user->role ?? null;
        $userId = $user->id;

        // Get notifications for user or their role
        $query = Notification::forUserOrRole($userId, $role)
            ->latest();

        $notifications = $query->limit(30)->get();
        $unreadCount = (clone $query)->where('read', false)->count();

        return response()->json([
            'success' => true,
            'notifications' => $notifications->map(function ($n) {
                return $this->formatNotification($n);
            }),
            'unread_count' => $unreadCount,
        ]);
    }

    public function markAsRead(Notification $notification)
    {
        $notification->markAsRead();

        return response()->json([
            'success' => true,
            'message' => 'Notification marked as read.',
        ]);
    }

    public function markAllAsRead(Request $request)
    {
        $user = $request->user();
        $role = $user->role ?? null;
        $userId = $user->id;

        Notification::where(function ($q) use ($userId, $role) {
            $q->where('user_id', $userId)
              ->orWhere('role', $role);
        })->update([
            'read' => true,
            'read_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'All notifications marked as read.',
        ]);
    }

    public function unreadCount(Request $request)
    {
        $user = $request->user();
        $role = $user->role ?? null;
        $userId = $user->id;

        $unreadCount = Notification::where(function ($q) use ($userId, $role) {
            $q->where('user_id', $userId)
              ->orWhere('role', $role);
        })->where('read', false)->count();

        return response()->json([
            'success' => true,
            'unread_count' => $unreadCount,
        ]);
    }

    public function getUnread(Request $request)
    {
        $user = $request->user();
        $role = $user->role ?? null;
        $userId = $user->id;

        $notifications = Notification::forUserOrRole($userId, $role)
            ->unread()
            ->recent(20)
            ->get();

        return response()->json([
            'success' => true,
            'notifications' => $notifications->map(function ($n) {
                return $this->formatNotification($n);
            }),
            'unread_count' => $notifications->count(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'nullable|exists:users,id',
            'role' => 'nullable|string|in:admin,customer,receptionist,cashier,veterinary,vet_tech,manager,inventory',
            'title' => 'required|string|max:255',
            'message' => 'required|string|max:1000',
            'type' => 'nullable|string|in:info,warning,success,error',
            'related_type' => 'nullable|string|max:255',
            'related_id' => 'nullable|integer',
            'data' => 'nullable|array',
        ]);

        $notification = Notification::create([
            'user_id' => $validated['user_id'] ?? null,
            'role' => $validated['role'] ?? null,
            'title' => $validated['title'],
            'message' => $validated['message'],
            'type' => $validated['type'] ?? 'info',
            'related_type' => $validated['related_type'] ?? null,
            'related_id' => $validated['related_id'] ?? null,
            'data' => $validated['data'] ?? null,
            'read' => false,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Notification created successfully.',
            'notification' => $this->formatNotification($notification),
        ], 201);
    }

    public function destroy(Notification $notification)
    {
        $notification->delete();

        return response()->json([
            'success' => true,
            'message' => 'Notification deleted successfully.',
        ]);
    }

    private function formatNotification(Notification $notification): array
    {
        return [
            'id' => $notification->id,
            'title' => $notification->title,
            'message' => $notification->message,
            'type' => $notification->type,
            'read' => $notification->read,
            'user_id' => $notification->user_id,
            'role' => $notification->role,
            'related_type' => $notification->related_type,
            'related_id' => $notification->related_id,
            'data' => $notification->data,
            'read_at' => $notification->read_at?->toIso8601String(),
            'created_at' => $notification->created_at?->toIso8601String(),
            'time' => $notification->created_at?->diffForHumans() ?? 'Just now',
        ];
    }
}
