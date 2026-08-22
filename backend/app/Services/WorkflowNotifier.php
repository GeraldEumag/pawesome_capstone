<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;

class WorkflowNotifier
{
    public static function notifyUser(?int $userId, string $title, string $message, string $type = 'info', ?string $relatedType = null, $relatedId = null, array $data = []): void
    {
        if (!$userId) {
            return;
        }

        Notification::create([
            'user_id' => $userId,
            'title' => $title,
            'message' => $message,
            'type' => $type,
            'related_type' => $relatedType,
            'related_id' => $relatedId,
            'data' => $data,
            'read' => false,
        ]);
    }

    public static function notifyEmail(?string $email, string $title, string $message, string $type = 'info', ?string $relatedType = null, $relatedId = null, array $data = []): void
    {
        if (!$email) {
            return;
        }

        $user = User::where('email', $email)->first();
        self::notifyUser($user?->id, $title, $message, $type, $relatedType, $relatedId, array_merge($data, [
            'customer_email' => $email,
        ]));
    }

    public static function notifyRole(string $role, string $title, string $message, string $type = 'info', ?string $relatedType = null, $relatedId = null, array $data = []): void
    {
        // Expand target role to include composite super roles that inherit it
        $targetRoles = [$role];
        if ($role === 'admin') {
            $targetRoles[] = 'super_admin';
        }
        if (in_array($role, ['receptionist', 'cashier', 'inventory'], true)) {
            $targetRoles[] = 'super_receptionist';
        }

        User::whereIn('role', $targetRoles)->get()->each(function (User $user) use ($role, $title, $message, $type, $relatedType, $relatedId, $data) {
            Notification::create([
                'user_id' => $user->id,
                'role' => $role,
                'title' => $title,
                'message' => $message,
                'type' => $type,
                'related_type' => $relatedType,
                'related_id' => $relatedId,
                'data' => $data,
                'read' => false,
            ]);
        });
    }
}
