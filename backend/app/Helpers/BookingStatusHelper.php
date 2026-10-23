<?php

namespace App\Helpers;

class BookingStatusHelper
{
    // APPOINTMENT STATUSES
    // Blocking statuses (prevent availability). 'checkout' is excluded — the
    // clinical slot is released once the visit leaves the consultation room.
    const APPOINTMENT_BLOCKING = [
        'requested',
        'scheduled',
        'checked_in',
        'in_consultation',
        'in_treatment',
        'awaiting_results',
        'clinical_complete',
    ];
    
    // Non-blocking statuses (don't prevent availability)
    const APPOINTMENT_NON_BLOCKING = [
        'completed',
        'cancelled',
        'rejected',
        'no_show'
    ];

    // GROOMING APPOINTMENT STATUSES
    // Blocking statuses
    const GROOMING_BLOCKING = [
        'pending',
        'approved'
    ];
    
    // Non-blocking statuses
    const GROOMING_NON_BLOCKING = [
        'completed',
        'cancelled',
        'rejected'
    ];

    // BOARDING STATUSES
    // Blocking statuses
    const BOARDING_BLOCKING = [
        'pending',
        'approved',
        'scheduled',
        'confirmed',
        'checked_in',
        'in_care',
        'ready_for_pickup'
    ];
    
    // Non-blocking statuses
    const BOARDING_NON_BLOCKING = [
        'checked_out',
        'completed',
        'cancelled',
        'rejected'
    ];

    // SERVICE REQUEST STATUSES
    // Blocking statuses
    const SERVICE_REQUEST_BLOCKING = [
        'pending',
        'approved'
    ];
    
    // Non-blocking statuses
    const SERVICE_REQUEST_NON_BLOCKING = [
        'rejected',
        'cancelled'
    ];

    /**
     * Map pending_review to existing status safely
     * For appointments: use 'pending' (already exists)
     * For service requests: use 'pending' (already exists)
     */
    public static function mapPendingReviewStatus(string $bookingType): string
    {
        return 'pending'; // All systems already support 'pending'
    }

    /**
     * Map pending_verification to existing payment_status safely
     * All systems already support 'pending' for payment_status
     */
    public static function mapPendingVerificationStatus(): string
    {
        return 'pending'; // All systems already support 'pending'
    }

    /**
     * Check if an appointment status blocks availability
     */
    public static function isAppointmentBlocking(string $status): bool
    {
        return in_array($status, self::APPOINTMENT_BLOCKING);
    }

    /**
     * Check if a grooming appointment status blocks availability
     */
    public static function isGroomingBlocking(string $status): bool
    {
        return in_array($status, self::GROOMING_BLOCKING);
    }

    /**
     * Check if a boarding status blocks availability
     */
    public static function isBoardingBlocking(string $status): bool
    {
        return in_array($status, self::BOARDING_BLOCKING);
    }

    /**
     * Check if a service request status blocks availability
     */
    public static function isServiceRequestBlocking(string $status): bool
    {
        return in_array($status, self::SERVICE_REQUEST_BLOCKING);
    }

    /**
     * Get all blocking statuses for a booking type
     */
    public static function getBlockingStatuses(string $bookingType): array
    {
        return match($bookingType) {
            'appointment' => self::APPOINTMENT_BLOCKING,
            'grooming' => self::GROOMING_BLOCKING,
            'boarding' => self::BOARDING_BLOCKING,
            'service_request' => self::SERVICE_REQUEST_BLOCKING,
            default => []
        };
    }

    /**
     * Get all non-blocking statuses for a booking type
     */
    public static function getNonBlockingStatuses(string $bookingType): array
    {
        return match($bookingType) {
            'appointment' => self::APPOINTMENT_NON_BLOCKING,
            'grooming' => self::GROOMING_NON_BLOCKING,
            'boarding' => self::BOARDING_NON_BLOCKING,
            'service_request' => self::SERVICE_REQUEST_NON_BLOCKING,
            default => []
        };
    }
}
