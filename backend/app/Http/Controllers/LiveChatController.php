<?php

namespace App\Http\Controllers;

use App\Models\LiveChatMessage;
use App\Models\LiveChatSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LiveChatController extends Controller
{
    // ─── CUSTOMER ENDPOINTS ───────────────────────────────────────────────────

    /**
     * Get customer's current active/waiting session (if any).
     */
    public function mySession(Request $request): JsonResponse
    {
        $user = $request->user();

        $session = LiveChatSession::where('customer_id', $user->id)
            ->whereIn('status', ['waiting', 'active'])
            ->with(['lastMessage', 'assignedStaff:id,name'])
            ->latest()
            ->first();

        if (!$session) {
            return response()->json(['session' => null]);
        }

        return response()->json(['session' => $this->formatSession($session)]);
    }

    /**
     * Customer starts a new live chat session.
     */
    public function startSession(Request $request): JsonResponse
    {
        $user = $request->user();

        // Close any existing open sessions for this customer
        LiveChatSession::where('customer_id', $user->id)
            ->whereIn('status', ['waiting', 'active'])
            ->update(['status' => 'closed', 'closed_at' => now()]);

        $session = LiveChatSession::create([
            'customer_id'    => $user->id,
            'customer_name'  => $user->name,
            'customer_email' => $user->email,
            'status'         => 'waiting',
            'last_message_at' => now(),
        ]);

        // Inject a system welcome message
        $this->addSystemMessage($session, 'Customer connected. Waiting for a staff member to join.');

        return response()->json([
            'session'    => $this->formatSession($session->fresh(['lastMessage'])),
            'message'    => 'Live chat session started. Please wait for a staff member.',
        ], 201);
    }

    /**
     * Customer sends a message.
     */
    public function customerMessage(Request $request, LiveChatSession $session): JsonResponse
    {
        $user = $request->user();

        if ((int) $session->customer_id !== (int) $user->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if ($session->status === 'closed') {
            return response()->json(['message' => 'This chat session is closed.'], 422);
        }

        $data = $request->validate(['message' => 'required|string|max:2000']);

        $msg = LiveChatMessage::create([
            'session_id'          => $session->id,
            'sender_type'         => 'customer',
            'sender_id'           => $user->id,
            'sender_name'         => $user->name,
            'message'             => $data['message'],
            'is_read_by_staff'    => false,
            'is_read_by_customer' => true,
        ]);

        $session->update(['last_message_at' => now()]);

        return response()->json(['message_obj' => $this->formatMessage($msg)], 201);
    }

    /**
     * Customer closes their own session.
     */
    public function customerClose(Request $request, LiveChatSession $session): JsonResponse
    {
        $user = $request->user();

        if ((int) $session->customer_id !== (int) $user->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if ($session->status === 'closed') {
            return response()->json(['message' => 'Session already closed.'], 422);
        }

        $this->addSystemMessage($session, 'Customer ended the chat.');
        $session->update(['status' => 'closed', 'closed_at' => now()]);

        return response()->json(['message' => 'Chat closed.']);
    }

    // ─── SHARED ENDPOINT ──────────────────────────────────────────────────────

    /**
     * Get messages for a session (customer or staff).
     * Supports ?after_id=X for incremental polling.
     */
    public function getMessages(Request $request, LiveChatSession $session): JsonResponse
    {
        $user = $request->user();
        $afterId = (int) $request->query('after_id', 0);

        // Authorization: customer can only read their own session
        $isCustomer = $user->role === 'customer';
        if ($isCustomer && (int) $session->customer_id !== (int) $user->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $messages = LiveChatMessage::where('session_id', $session->id)
            ->when($afterId > 0, fn ($q) => $q->where('id', '>', $afterId))
            ->orderBy('id')
            ->get();

        // Mark as read
        if ($isCustomer) {
            LiveChatMessage::where('session_id', $session->id)
                ->where('sender_type', 'staff')
                ->where('is_read_by_customer', false)
                ->update(['is_read_by_customer' => true]);
        } else {
            LiveChatMessage::where('session_id', $session->id)
                ->where('sender_type', 'customer')
                ->where('is_read_by_staff', false)
                ->update(['is_read_by_staff' => true]);
        }

        return response()->json([
            'messages'       => $messages->map([$this, 'formatMessage'])->values(),
            'session_status' => $session->status,
            'assigned_to'    => $session->assignedStaff?->name,
        ]);
    }

    // ─── STAFF ENDPOINTS ──────────────────────────────────────────────────────

    /**
     * Get all waiting + active sessions (inbox).
     */
    public function inbox(Request $request): JsonResponse
    {
        $sessions = LiveChatSession::with(['lastMessage', 'assignedStaff:id,name'])
            ->whereIn('status', ['waiting', 'active'])
            ->orderByRaw("FIELD(status, 'waiting', 'active')")
            ->orderByDesc('last_message_at')
            ->get();

        // Also include recently closed (last 30 min) for reference
        $recentClosed = LiveChatSession::with(['lastMessage', 'assignedStaff:id,name'])
            ->where('status', 'closed')
            ->where('closed_at', '>=', now()->subMinutes(30))
            ->orderByDesc('closed_at')
            ->limit(10)
            ->get();

        $waiting = $sessions->where('status', 'waiting')->count();
        $active  = $sessions->where('status', 'active')->count();

        return response()->json([
            'sessions'       => $sessions->map([$this, 'formatSession'])->values(),
            'recent_closed'  => $recentClosed->map([$this, 'formatSession'])->values(),
            'counts'         => ['waiting' => $waiting, 'active' => $active],
        ]);
    }

    /**
     * Staff claims a waiting session.
     */
    public function claimSession(Request $request, LiveChatSession $session): JsonResponse
    {
        $user = $request->user();

        if ($session->status === 'closed') {
            return response()->json(['message' => 'Session is already closed.'], 422);
        }

        // Atomic claim — prevents race condition
        $updated = DB::table('live_chat_sessions')
            ->where('id', $session->id)
            ->whereNull('assigned_to')
            ->update([
                'assigned_to' => $user->id,
                'status'      => 'active',
                'updated_at'  => now(),
            ]);

        if (!$updated) {
            // Already claimed or closed
            $session->refresh();
            if ($session->assigned_to && $session->assigned_to !== $user->id) {
                return response()->json(['message' => 'This session was already claimed by another staff member.'], 422);
            }
        }

        $this->addSystemMessage($session, "{$user->name} joined the chat.");
        $session->refresh()->load(['lastMessage', 'assignedStaff:id,name']);

        return response()->json(['session' => $this->formatSession($session)]);
    }

    /**
     * Staff sends a reply.
     */
    public function staffReply(Request $request, LiveChatSession $session): JsonResponse
    {
        $user = $request->user();

        if ($session->status === 'closed') {
            return response()->json(['message' => 'This chat session is closed.'], 422);
        }

        $data = $request->validate(['message' => 'required|string|max:2000']);

        // Auto-claim if not yet assigned
        if (!$session->assigned_to) {
            $session->update(['assigned_to' => $user->id, 'status' => 'active']);
            $this->addSystemMessage($session, "{$user->name} joined the chat.");
        }

        $msg = LiveChatMessage::create([
            'session_id'          => $session->id,
            'sender_type'         => 'staff',
            'sender_id'           => $user->id,
            'sender_name'         => $user->name,
            'message'             => $data['message'],
            'is_read_by_staff'    => true,
            'is_read_by_customer' => false,
        ]);

        $session->update(['last_message_at' => now()]);

        return response()->json(['message_obj' => $this->formatMessage($msg)], 201);
    }

    /**
     * Staff closes the session.
     */
    public function closeSession(Request $request, LiveChatSession $session): JsonResponse
    {
        $user = $request->user();

        if ($session->status === 'closed') {
            return response()->json(['message' => 'Session already closed.'], 422);
        }

        $this->addSystemMessage($session, "{$user->name} closed the chat. Thank you for contacting Pawesome!");
        $session->update(['status' => 'closed', 'closed_at' => now()]);

        return response()->json(['message' => 'Chat closed.']);
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────

    private function addSystemMessage(LiveChatSession $session, string $text): LiveChatMessage
    {
        $msg = LiveChatMessage::create([
            'session_id'          => $session->id,
            'sender_type'         => 'system',
            'sender_id'           => null,
            'sender_name'         => 'System',
            'message'             => $text,
            'is_read_by_staff'    => true,
            'is_read_by_customer' => false,
        ]);

        $session->update(['last_message_at' => now()]);

        return $msg;
    }

    public function formatSession(LiveChatSession $session): array
    {
        $lastMsg = $session->lastMessage;
        $unread  = LiveChatMessage::where('session_id', $session->id)
            ->where('sender_type', 'customer')
            ->where('is_read_by_staff', false)
            ->count();

        return [
            'id'              => $session->id,
            'customer_name'   => $session->customer_name,
            'customer_email'  => $session->customer_email,
            'status'          => $session->status,
            'assigned_to'     => $session->assignedStaff?->name,
            'assigned_to_id'  => $session->assigned_to,
            'last_message'    => $lastMsg ? $lastMsg->message : null,
            'last_message_at' => $session->last_message_at?->toIso8601String(),
            'unread_count'    => $unread,
            'started_at'      => $session->created_at->toIso8601String(),
            'closed_at'       => $session->closed_at?->toIso8601String(),
        ];
    }

    public function formatMessage(LiveChatMessage $msg): array
    {
        return [
            'id'          => $msg->id,
            'session_id'  => $msg->session_id,
            'sender_type' => $msg->sender_type,
            'sender_id'   => $msg->sender_id,
            'sender_name' => $msg->sender_name,
            'message'     => $msg->message,
            'is_read_by_staff'    => $msg->is_read_by_staff,
            'is_read_by_customer' => $msg->is_read_by_customer,
            'created_at'  => $msg->created_at->toIso8601String(),
        ];
    }
}
