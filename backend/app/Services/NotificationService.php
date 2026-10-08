<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use App\Models\Boarding;
use App\Models\Appointment;
use App\Models\Customer;
use App\Models\SystemSetting;
use App\Mail\PaymentReceiptMail;
use App\Support\EmailContent;
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
        $staffUsers = User::whereIn('role', ['receptionist', 'super_receptionist', 'manager', 'admin'])->get();
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

        self::sendEmailNotification($customer, 'Hotel Reservation Created', $message, 'info', [
            'event_key' => 'boarding.created',
            'occurrence_key' => "boarding.created:{$boarding->id}",
            'source_type' => 'boarding',
            'source_id' => $boarding->id,
            'content' => [
                'subject' => "[Pawesome] Hotel Reservation Received — BD-{$boarding->id}",
                'customer_name' => $customer->name,
                'intro' => 'Thank you — we have received your pet hotel reservation. Our team will confirm it shortly.',
                'details' => [
                    ['label' => 'Reference', 'value' => "BD-{$boarding->id}"],
                    ['label' => 'Pet', 'value' => $boarding->pet_name],
                    ['label' => 'Room', 'value' => $boarding->room_name],
                    ['label' => 'Check-in', 'value' => EmailContent::datetime($boarding->check_in)],
                    ['label' => 'Check-out', 'value' => EmailContent::datetime($boarding->check_out)],
                    ['label' => 'Estimated total', 'value' => EmailContent::money($boarding->total_amount)],
                ],
                'status' => 'Pending confirmation',
                'status_type' => 'info',
                'cta_url' => EmailContent::frontendUrl('/customer/boardings'),
                'cta_label' => 'View Reservation',
            ],
        ]);
    }

    /**
     * Notify boarding status change
     */
    public static function notifyBoardingStatusChange(Boarding $boarding, string $oldStatus): void
    {
        $customer = Customer::find($boarding->customer_id);
        if (!$customer || !$customer->user_id) return;

        $messages = [
            'approved' => "Your hotel reservation has been approved!\n" .
                        "Check-in: {$boarding->check_in->format('M d, Y')}",
            'scheduled' => "Your hotel reservation has been scheduled.\n" .
                        "Check-in: {$boarding->check_in->format('M d, Y')}",
            'confirmed' => "Your hotel reservation has been confirmed!\n" .
                        "Check-in: {$boarding->check_in->format('M d, Y')}",
            'checked_in' => "Your pet has been checked in. Enjoy their stay!",
            'in_care' => "Your pet is now in our care. We'll keep them comfortable!",
            'ready_for_pickup' => "Your pet is ready for pickup. See you soon!",
            'checked_out' => "Your pet has been checked out. Thank you for choosing us!",
            'completed' => "Booking BD-{$boarding->id} for {$boarding->pet_name} has been completed. Thank you for choosing us!",
            'cancelled' => "Your hotel reservation has been cancelled.",
            'rejected' => "Your hotel reservation request was not approved.",
        ];

        if (!isset($messages[$boarding->status])) return;

        $type = match($boarding->status) {
            'cancelled', 'rejected' => 'error',
            default => 'success',
        };
        $completed = $boarding->status === 'completed' && $oldStatus !== 'completed';

        self::createNotification(
            $customer->user_id,
            'Reservation Update',
            $messages[$boarding->status],
            $type,
            'boarding',
            $boarding->id,
            ['boarding_id' => $boarding->id, 'status' => $boarding->status]
        );

        self::sendEmailNotification($customer, $completed ? 'Booking Completed' : 'Reservation Update', $messages[$boarding->status], $type, [
            'event_key' => $completed ? 'booking.completed' : 'boarding.status',
            'occurrence_key' => $completed
                ? "booking.completed:boarding:{$boarding->id}:" . $boarding->updated_at?->format('Uv')
                : "boarding.status:{$boarding->id}:{$oldStatus}>{$boarding->status}:" . $boarding->updated_at?->format('Uv'),
            'source_type' => 'boarding',
            'source_id' => $boarding->id,
            'content' => [
                'subject' => $completed ? "[Pawesome] Booking Completed — BD-{$boarding->id}" : "[Pawesome] Boarding " . EmailContent::status($boarding->status) . " — BD-{$boarding->id}",
                'customer_name' => $customer->name,
                'intro' => $messages[$boarding->status],
                'details' => [
                    ['label' => 'Reference', 'value' => "BD-{$boarding->id}"],
                    ['label' => 'Pet', 'value' => $boarding->pet_name],
                    ['label' => 'Room', 'value' => $boarding->room_name],
                    ['label' => 'Check-in', 'value' => EmailContent::datetime($boarding->check_in)],
                    ['label' => 'Check-out', 'value' => EmailContent::datetime($boarding->check_out)],
                ],
                'status' => $completed ? 'Booking Completed' : EmailContent::status($boarding->status),
                'status_type' => $type === 'error' ? 'error' : 'success',
                'cta_url' => EmailContent::frontendUrl('/customer/bookings'),
                'cta_label' => $completed ? 'View Booking' : 'View Reservation',
            ],
        ]);
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

        self::sendEmailNotification($customer, 'Appointment Scheduled', $message, 'info', [
            'event_key' => 'appointment.created',
            'occurrence_key' => "appointment.created:{$appointment->id}",
            'source_type' => 'appointment',
            'source_id' => $appointment->id,
            'content' => [
                'subject' => "[Pawesome] Appointment Scheduled — APT-{$appointment->id}",
                'customer_name' => $customer->name,
                'intro' => 'Your veterinary appointment has been scheduled. Please review the details below.',
                'details' => [
                    ['label' => 'Reference', 'value' => "APT-{$appointment->id}"],
                    ['label' => 'Pet', 'value' => $appointment->pet?->name],
                    ['label' => 'Service', 'value' => $appointment->service?->name],
                    ['label' => 'Veterinarian', 'value' => $appointment->veterinarian?->name],
                    ['label' => 'Schedule', 'value' => EmailContent::datetime($appointment->scheduled_at)],
                ],
                'status' => 'Pending confirmation',
                'status_type' => 'info',
                'cta_url' => EmailContent::frontendUrl('/customer/appointments'),
                'cta_label' => 'View Appointment',
            ],
        ]);
    }

    /**
     * Notify appointment status change
     */
    public static function notifyAppointmentStatusChange(Appointment $appointment, string $oldStatus): void
    {
        $customer = Customer::find($appointment->customer_id);
        if (!$customer || !$customer->user_id) return;

        // Routine in-progress states notify in-app only; lifecycle
        // transitions customers need in their inbox also go to email.
        $messages = [
            'approved' => ["Your appointment has been confirmed!\n" .
                       "Date: {$appointment->scheduled_at->format('M d, Y h:i A')}", true],
            'scheduled' => ["Your appointment has been scheduled.\n" .
                       "Date: {$appointment->scheduled_at->format('M d, Y h:i A')}", true],
            'in_progress' => ["Your appointment is now in progress.", false],
            'completed' => ["Appointment APT-{$appointment->id} has been completed. Thank you!", true],
            'cancelled' => ["Your appointment has been cancelled.", true],
            'rejected' => ["Your appointment has been rejected.", true],
        ];

        if (!isset($messages[$appointment->status])) return;
        [$text, $emailCustomer] = $messages[$appointment->status];

        $type = match($appointment->status) {
            'cancelled', 'rejected' => 'error',
            'in_progress' => 'info',
            default => 'success',
        };
        $completed = $appointment->status === 'completed' && $oldStatus !== 'completed';

        self::createNotification(
            $customer->user_id,
            'Appointment Update',
            $text,
            $type,
            'appointment',
            $appointment->id,
            ['appointment_id' => $appointment->id, 'status' => $appointment->status]
        );

        if ($emailCustomer) {
            self::sendEmailNotification($customer, $completed ? 'Booking Completed' : 'Appointment Update', $text, $type, [
                'event_key' => $completed ? 'booking.completed' : 'appointment.status',
                'occurrence_key' => $completed
                    ? "booking.completed:appointment:{$appointment->id}:" . $appointment->updated_at?->format('Uv')
                    : "appointment.status:{$appointment->id}:{$oldStatus}>{$appointment->status}:" . $appointment->updated_at?->format('Uv'),
                'source_type' => 'appointment',
                'source_id' => $appointment->id,
                'content' => [
                    'subject' => $completed ? "[Pawesome] Booking Completed — APT-{$appointment->id}" : "[Pawesome] Appointment " . EmailContent::status($appointment->status) . " — APT-{$appointment->id}",
                    'customer_name' => $customer->name,
                    'intro' => $text,
                    'details' => [
                        ['label' => 'Reference', 'value' => "APT-{$appointment->id}"],
                        ['label' => 'Pet', 'value' => $appointment->pet?->name],
                        ['label' => 'Service', 'value' => $appointment->service?->name],
                        ['label' => 'Veterinarian', 'value' => $appointment->veterinarian?->name],
                        ['label' => 'Schedule', 'value' => EmailContent::datetime($appointment->scheduled_at)],
                    ],
                    'status' => $completed ? 'Booking Completed' : EmailContent::status($appointment->status),
                    'status_type' => $type === 'error' ? 'error' : ($type === 'info' ? 'info' : 'success'),
                    'cta_url' => EmailContent::frontendUrl($completed ? '/customer/bookings' : '/customer/appointments'),
                    'cta_label' => $completed ? 'View Booking' : 'View Appointment',
                ],
            ]);
        }
    }

    /**
     * Send reminder notification
     */
    public static function sendReminder($model, string $type, int $hoursBefore): void
    {
        $customer = null;
        $message = '';
        $title = '';
        $eventAt = null;
        $allowedStatuses = [];

        if ($type === 'boarding' && $model instanceof Boarding) {
            $customer = Customer::find($model->customer_id);
            $title = 'Upcoming Check-in Reminder';
            $eventAt = $model->check_in;
            $allowedStatuses = ['pending', 'approved', 'scheduled', 'confirmed'];
            $message = "Reminder: Your pet's hotel check-in is coming up.\n" .
                      "Check-in: {$eventAt->format('M d, Y h:i A')}";
        } elseif ($type === 'appointment' && $model instanceof Appointment) {
            $customer = Customer::find($model->customer_id);
            $title = 'Appointment Reminder';
            $eventAt = $model->scheduled_at;
            $allowedStatuses = ['approved'];
            $message = "Reminder: Your appointment is coming up.\n" .
                      "Service: {$model->service?->name}\n" .
                      "Time: {$eventAt->format('M d, Y h:i A')}";
        }

        if (!$customer || !$customer->user_id || !$eventAt) return;

        self::createNotification(
            $customer->user_id,
            $title,
            $message,
            'warning',
            $type,
            $model->id,
            ['reminder' => true, 'hours_before' => $hoursBefore]
        );

        // A cancelled/rejected/re-purposed record suppresses the send even
        // if the job runs late; the event datetime bounds usefulness.
        self::sendEmailNotification($customer, $title, $message, 'warning', [
            'event_key' => "reminder.{$type}",
            'occurrence_key' => "reminder.{$type}:{$model->id}:" . $eventAt->format('YmdHis'),
            'source_type' => $type,
            'source_id' => $model->id,
            'expires_at' => $eventAt,
            'suppression' => [
                ['type' => 'model_field', 'table' => $type === 'boarding' ? 'boardings' : 'appointments',
                    'id' => $model->id, 'field' => 'status', 'allowed' => $allowedStatuses],
            ],
            'content' => [
                'subject' => "[Pawesome] {$title}",
                'customer_name' => $customer->name,
                'intro' => $message,
                'details' => [
                    ['label' => 'Reference', 'value' => ($type === 'boarding' ? 'BD-' : 'APT-') . $model->id],
                    ['label' => 'Scheduled', 'value' => EmailContent::datetime($eventAt)],
                ],
                'status' => 'Reminder',
                'status_type' => 'warning',
                'cta_url' => EmailContent::frontendUrl($type === 'boarding' ? '/customer/boardings' : '/customer/appointments'),
                'cta_label' => 'View Details',
            ],
        ]);
    }

    /**
     * Send low stock alert to admins
     */
    public static function sendLowStockAlert($inventoryItem): void
    {
        $admins = User::whereIn('role', ['admin', 'manager'])->get();

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

    public static function sendPaymentReceiptEmail(?string $email, string $receiptType, array $receipt, array $context = []): void
    {
        if (empty($email)) {
            return;
        }

        // The system-wide email switch and per-customer preference are
        // enforced inside paymentReceipt() at intent time and re-checked
        // by the worker at send time via suppression descriptors.
        app(EmailDeliveryService::class)->paymentReceipt($email, $receiptType, $receipt, $context);
    }

    /**
     * Record a customer-facing email through the durable outbox.
     * The system-wide email switch and per-customer email preference are
     * honored at intent time and re-checked by the worker at send time.
     */
    private static function sendEmailNotification(Customer $customer, string $title, string $message, string $type = 'info', array $context = []): void
    {
        $email = $customer->email ?? $customer->user?->email;
        if (empty($email)) {
            return;
        }

        try {
            app(EmailDeliveryService::class)->lifecycle($email, $title, $message, $type, [
                'user_id' => $customer->user_id,
                'customer_id' => $customer->id,
                'event_key' => $context['event_key'] ?? 'customer.notification',
                'occurrence_key' => $context['occurrence_key'] ?? ('customer.notification:' . $customer->id . ':' . sha1($title . $message)),
                'source_type' => $context['source_type'] ?? null,
                'source_id' => $context['source_id'] ?? null,
                'expires_at' => $context['expires_at'] ?? null,
                'suppression' => $context['suppression'] ?? [],
                'content' => $context['content'] ?? null,
            ]);
        } catch (\Throwable $e) {
            Log::error('Failed to record customer notification email', ['exception' => get_class($e)]);
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
