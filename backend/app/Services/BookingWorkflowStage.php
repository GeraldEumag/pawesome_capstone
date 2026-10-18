<?php

namespace App\Services;

/**
 * Single definition of the receptionist workflow stage for a booking.
 *
 * Stages drive the TO APPROVE / TO PAY / ON GOING / READY TO PICKUP /
 * COMPLETE / CANCELED tabs on the Hotel, Grooming, and Vet booking pages.
 * Keep every status rule here; the frontend only filters on the result.
 */
class BookingWorkflowStage
{
    public const TO_APPROVE = 'to_approve';
    public const TO_PAY = 'to_pay';
    public const ON_GOING = 'on_going';
    public const READY_TO_PICKUP = 'ready_to_pickup';
    public const COMPLETE = 'complete';
    public const CANCELED = 'canceled';

    private const PAID = ['paid', 'verified', 'completed'];
    private const CANCELLED = ['cancelled', 'canceled', 'rejected'];
    private const VET_IN_CONSULTATION = ['in_progress', 'in_consultation', 'treated', 'needs_confinement'];

    /**
     * Grooming or vet service request (service_requests row plus its linked appointment).
     */
    public static function forServiceRequest(
        ?string $requestType,
        ?string $status,
        ?string $paymentStatus,
        ?string $appointmentStatus = null
    ): string {
        $status = strtolower((string) $status);
        $payment = strtolower((string) $paymentStatus);
        $appointment = strtolower((string) $appointmentStatus);
        $isVet = self::isVet((string) $requestType);

        if (in_array($status, self::CANCELLED, true) || in_array($appointment, ['cancelled', 'rejected', 'no_show'], true)) {
            return self::CANCELED;
        }

        if ($isVet && $appointment !== '') {
            if ($appointment === 'completed') return self::COMPLETE;
            if ($appointment === 'awaiting_payment') return self::READY_TO_PICKUP;
            if (in_array($appointment, self::VET_IN_CONSULTATION, true)) return self::ON_GOING;
        }

        if ($status === 'completed') return self::COMPLETE;
        if ($status === 'ready_for_pickup') return self::READY_TO_PICKUP;
        if ($status === 'in_progress') return self::ON_GOING;
        if ($status === 'pending') return self::TO_APPROVE;

        return self::paidOrOpen($payment);
    }

    /**
     * Hotel boarding (boardings row).
     */
    public static function forBoarding(?string $status, ?string $paymentStatus): string
    {
        $status = strtolower((string) $status);
        $payment = strtolower((string) $paymentStatus);

        if (in_array($status, self::CANCELLED, true)) return self::CANCELED;
        if (in_array($status, ['completed', 'checked_out'], true)) return self::COMPLETE;
        if ($status === 'ready_for_pickup') return self::READY_TO_PICKUP;
        if (in_array($status, ['checked_in', 'in_care'], true)) return self::ON_GOING;
        if ($status === 'pending') return self::TO_APPROVE;

        return self::paidOrOpen($payment);
    }

    private static function paidOrOpen(string $payment): string
    {
        return in_array($payment, self::PAID, true) ? self::ON_GOING : self::TO_PAY;
    }

    private static function isVet(string $requestType): bool
    {
        $type = strtolower($requestType);
        return in_array($type, ['vet', 'veterinary'], true) || str_contains($type, 'veterinar') || str_contains($type, 'consult');
    }
}
