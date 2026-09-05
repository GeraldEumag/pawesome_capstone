<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use App\Models\Boarding;
use App\Models\Appointment;
use App\Models\Customer;
use App\Models\SystemSetting;
use App\Mail\CustomerNotificationMail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class NotificationService
{
    /**
     * Create in-app notification
     */
    public static function createNotification(
        int $userId,
        string $title,
        string $message,
        string $type = 'info',
        ?string $relatedType = null,
        ?int $relatedId = null,
        ?array $data = null
    ): Notification {
        return Notification::create([
            'user_id' => $userId,
            'title' => $title,
            'message' => $message,
            'type' => $type,
            'related_type' => $relatedType,
            'related_id' => $relatedId,
            'data' => $data,
        ]);
    }

    /**
     * Notify customer about boarding reservation
     */
    public static function notifyBoardingCreated(Boarding $boarding): void
    {
        // Get customer user
        $customer = Customer::find($boarding->customer_id);
        if (!$customer) return;

        $message = "Your pet hotel reservation has been created.\n" .
                   "Check-in: {$boarding->check_in->format('M d, Y')}\n" .
                   "Check-out: {$boarding->check_out->format('M d, Y')}\n" .
                   "Status: Pending confirmation";

        // In-app notification for customer
        if ($customer->user_id) {
            self::createNotification(
                $customer->user_id,
                'Hotel Reservation Created',
                $message,
                'info',
                'boarding',
                $boarding->id,
                ['boarding_id' => $boarding->id, 'status' => 'pending']
            );
        }

        // Notify receptionists/managers
        $staffUsers = User::whereIn('role', ['receptionist', 'super_receptionist', 'manager', 'admin', 'super_admin'])->get();
        foreach ($staffUsers as $user) {
            self::createNotification(
                $user->id,
                'New Hotel Reservation',
                "New boarding reservation from {$customer->name} needs confirmation.",
                'warning',
                'boarding',
                $boarding->id
            );
        }

        self::sendEmailNotification($customer, 'Hotel Reservation Created', $message, 'info');
    }

    /**
     * Notify boarding status change
     */
    public static function notifyBoardingStatusChange(Boarding $boarding, string $oldStatus): void
    {
        $customer = Customer::find($boarding->customer_id);
        if (!$customer || !$customer->user_id) return;

        $messages = [
            'confirmed' => "Your hotel reservation has been confirmed!\n" .
                        "Check-in: {$boarding->check_in->format('M d, Y')}",
            'checked_in' => "Your pet has been checked in. Enjoy their stay!",
            'checked_out' => "Your pet has been checked out. Thank you for choosing us!",
            'completed' => "Your pet's hotel stay has been completed. Thank you for choosing us!",
            'cancelled' => "Your hotel reservation has been cancelled.",
        ];

        if (!isset($messages[$boarding->status])) return;

        $type = match($boarding->status) {
            'confirmed' => 'success',
            'checked_in' => 'success',
            'checked_out' => 'success',
            'completed' => 'success',
            'cancelled' => 'error',
            default => 'info',
        };

        self::createNotification(
            $customer->user_id,
            'Reservation Update',
            $messages[$boarding->status],
            $type,
            'boarding',
            $boarding->id,
            ['boarding_id' => $boarding->id, 'status' => $boarding->status]
        );

        self::sendEmailNotification($customer, 'Reservation Update', $messages[$boarding->status], $type);
    }

    /**
     * Notify about appointment
     */
    public static function notifyAppointmentCreated(Appointment $appointment): void
    {
        $customer = Customer::find($appointment->customer_id);
        if (!$customer) return;

        $message = "Your appointment has been scheduled.\n" .
                   "Service: {$appointment->service?->name}\n" .
                   "Date: {$appointment->scheduled_at->format('M d, Y h:i A')}\n" .
                   "Status: Pending confirmation";

        if ($customer->user_id) {
            self::createNotification(
                $customer->user_id,
                'Appointment Scheduled',
                $message,
                'info',
                'appointment',
                $appointment->id
            );
        }

        // Notify assigned veterinarian
        if ($appointment->veterinarian_id) {
            self::createNotification(
                $appointment->veterinarian_id,
                'New Appointment Assigned',
                "New appointment with {$customer->name} on {$appointment->scheduled_at->format('M d, Y h:i A')}",
                'info',
                'appointment',
                $appointment->id
            );
        }

        self::sendEmailNotification($customer, 'Appointment Scheduled', $message, 'info');
    }

    /**
     * Notify appointment status change
     */
    public static function notifyAppointmentStatusChange(Appointment $appointment, string $oldStatus): void
    {
        $customer = Customer::find($appointment->customer_id);
        if (!$customer || !$customer->user_id) return;

        $messages = [
            'approved' => "Your appointment has been confirmed!\n" .
                       "Date: {$appointment->scheduled_at->format('M d, Y h:i A')}",
            'in_progress' => "Your appointment is now in progress.",
            'completed' => "Your appointment has been completed. Thank you!",
            'cancelled' => "Your appointment has been cancelled.",
            'rejected' => "Your appointment has been rejected.",
        ];

        if (!isset($messages[$appointment->status])) return;

        $type = match($appointment->status) {
            'approved' => 'success',
            'in_progress' => 'info',
            'completed' => 'success',
            'cancelled' => 'error',
            'rejected' => 'error',
            default => 'info',
        };

        self::createNotification(
            $customer->user_id,
            'Appointment Update',
            $messages[$appointment->status],
            $type,
            'appointment',
            $appointment->id,
            ['appointment_id' => $appointment->id, 'status' => $appointment->status]
        );

        self::sendEmailNotification($customer, 'Appointment Update', $messages[$appointment->status], $type);
    }

    /**
     * Send reminder notification
     */
    public static function sendReminder($model, string $type, int $hoursBefore): void
    {
        $customer = null;
        $message = '';
        $title = '';

        if ($type === 'boarding' && $model instanceof Boarding) {
            $customer = Customer::find($model->customer_id);
            $title = 'Upcoming Check-in Reminder';
            $message = "Reminder: Your pet's check-in is in {$hoursBefore} hours.\n" .
                      "Check-in: {$model->check_in->format('M d, Y h:i A')}";
        } elseif ($type === 'appointment' && $model instanceof Appointment) {
            $customer = Customer::find($model->customer_id);
            $title = 'Appointment Reminder';
            $message = "Reminder: Your appointment is in {$hoursBefore} hours.\n" .
                      "Service: {$model->service?->name}\n" .
                      "Time: {$model->scheduled_at->format('M d, Y h:i A')}";
        }

        if (!$customer || !$customer->user_id) return;

        self::createNotification(
            $customer->user_id,
            $title,
            $message,
            'warning',
            $type,
            $model->id,
            ['reminder' => true, 'hours_before' => $hoursBefore]
        );

        self::sendEmailNotification($customer, $title, $message, 'warning');
    }

    /**
     * Send low stock alert to admins
     */
    public static function sendLowStockAlert($inventoryItem): void
    {
        $admins = User::whereIn('role', ['admin', 'super_admin', 'manager'])->get();

        $message = "Low Stock Alert: {$inventoryItem->name}\n" .
                   "Current Stock: {$inventoryItem->stock}\n" .
                   "Reorder Level: {$inventoryItem->reorder_level}";

        foreach ($admins as $admin) {
            self::createNotification(
                $admin->id,
                'Low Stock Alert',
                $message,
                'warning',
                'inventory',
                $inventoryItem->id
            );
        }
    }

    /**
     * Dispatch the in-app + email notification to a customer.
     */
    private static function sendEmailNotification(Customer $customer, string $title, string $message, string $type = 'info'): void
    {
        if (!(bool) SystemSetting::get('notif_email_notifications', true)) {
            return;
        }

        $preferences = $customer->notification_preferences ?? [];
        if (($preferences['email'] ?? true) === false) {
            return;
        }

        $email = $customer->email ?? $customer->user?->email;
        if (empty($email)) {
            return;
        }

        try {
            Mail::to($email)->queue(new CustomerNotificationMail($title, $message, $type));
        } catch (\Throwable $e) {
            Log::error('Failed to queue customer notification email: ' . $e->getMessage());
        }
    }

    /**
     * Get unread notifications for user
     */
    public static function getUnreadForUser(int $userId): array
    {
        $notifications = Notification::where('user_id', $userId)
            ->where('read', false)
            ->latest()
            ->limit(20)
            ->get();

        $count = Notification::where('user_id', $userId)
            ->where('read', false)
            ->count();

        return [
            'count' => $count,
            'notifications' => $notifications,
        ];
    }

    /**
     * Mark notification as read
     */
    public static function markAsRead(int $notificationId, int $userId): ?Notification
    {
        $notification = Notification::where('id', $notificationId)
            ->where('user_id', $userId)
            ->first();

        if ($notification) {
            $notification->markAsRead();
        }

        return $notification;
    }
}
