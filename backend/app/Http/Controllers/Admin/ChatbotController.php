<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatbotLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class ChatbotController extends Controller
{
    public function index(): JsonResponse
    {
        $logs = ChatbotLog::query()
            ->with('user')
            ->whereNotNull('user_id')
            ->select('user_id')
            ->selectRaw('COUNT(*) as total_chats')
            ->selectRaw('MAX(created_at) as last_chat_date')
            ->groupBy('user_id')
            ->get()
            ->map(function (ChatbotLog $log) {
                $user = $log->user;

                return [
                    'user_id' => $user?->id ?? 0,
                    'user_name' => $user?->name ?? 'Unknown User',
                    'user_username' => $user?->username ?? 'n/a',
                    'user_email' => $user?->email ?? 'n/a',
                    'user_role' => $user?->role ?? 'unknown',
                    'total_chats' => (int) $log->total_chats,
                    'last_chat_date' => $log->last_chat_date,
                ];
            })
            ->values();

        return response()->json([
            'success' => true,
            'data' => $logs,
        ]);
    }

    public function stats(): JsonResponse
    {
        $base = fn () => ChatbotLog::query()->whereNotNull('user_id');

        return response()->json([
            'success' => true,
            'data' => [
                'total_chats' => $base()->count(),
                'unique_users' => $base()->distinct('user_id')->count('user_id'),
                'chats_today' => $base()->whereDate('created_at', today())->count(),
                'top_intents' => $base()
                    ->selectRaw('intent, COUNT(*) as count')
                    ->groupBy('intent')
                    ->orderBy('count', 'desc')
                    ->limit(5)
                    ->get(),
                'channels' => $base()
                    ->selectRaw('channel, COUNT(*) as count')
                    ->groupBy('channel')
                    ->orderBy('count', 'desc')
                    ->get(),
            ],
        ]);
    }

    public function userHistory(User $user): JsonResponse
    {
        $history = ChatbotLog::query()
            ->where('user_id', $user->id)
            ->latest()
            ->get([
                'id',
                'intent',
                'scope',
                'channel',
                'user_message',
                'bot_response',
                'created_at',
            ]);

        return response()->json([
            'success' => true,
            'data' => $history,
        ]);
    }
}
