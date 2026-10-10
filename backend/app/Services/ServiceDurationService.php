<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class ServiceDurationService
{
    /**
     * Service durations in minutes by service type and name
     */
    private const SERVICE_DURATIONS = [
        'veterinary' => [
            'General Check-up' => 30,
            'Vaccination' => 20,
            'Deworming' => 20,
            'Follow-up Check-up' => 30,
            'Consultation with Treatment' => 60,
            'Emergency' => 90, // Staff/manual scheduling only
            'Surgery' => 120, // Staff/manual scheduling only
            'Dental Care' => 45,
            'Laboratory Test' => 30,
            'General Consultation' => 30,
            'Checkup' => 30,
        ],
        'grooming' => [
            'Nail Trim' => 30,
            'Basic Bath' => 60,
            'Basic Grooming' => 60,
            'Full Grooming' => 90,
            'Full Grooming Package' => 90,
            'Haircut Only' => 45,
            'Teeth Cleaning' => 30,
            'Medicated Grooming' => 120,
            'Flea Treatment' => 60,
            'De-matting / Special Coat Care' => 120,
        ],
        'boarding' => [
            'default_check_in_time' => '14:00', // 2:00 PM
            'default_check_out_time' => '12:00', // 12:00 PM
            'cleaning_buffer_minutes' => 60, // Room cleaning between stays
        ]
    ];

    /**
     * Buffer times in minutes by service type
     */
    private const BUFFER_TIMES = [
        'veterinary' => 10, // minutes between appointments
        'grooming' => 15, // minutes between appointments
        'boarding' => 60, // minutes for room cleaning
    ];

    /**
     * Time slot interval in minutes
     */
    private const TIME_SLOT_INTERVAL = 30;

    /**
     * Business hours
     */
    private const BUSINESS_HOURS = [
        'start' => '10:00', // 10:00 AM
        'end' => '18:00',   // 6:00 PM
    ];

    private const STORE_TIMEZONE = 'Asia/Manila';
    private const STORE_CLOSING_TIME = '18:00';

    public static function isSameDayBookingClosed(string $requestedDate): bool
    {
        $now = Carbon::now(self::STORE_TIMEZONE);
        $today = $now->copy()->startOfDay();

        return Carbon::parse($requestedDate, self::STORE_TIMEZONE)->toDateString() === $today->toDateString()
            && $now->greaterThanOrEqualTo(
                $today->copy()->setTimeFromTimeString(self::STORE_CLOSING_TIME)
            );
    }

    /**
     * Get service duration in minutes
     */
    public static function getServiceDuration(string $serviceType, string $serviceName): int
    {
        if (!isset(self::SERVICE_DURATIONS[$serviceType])) {
            Log::warning("Unknown service type: {$serviceType}");
            return 30; // Default fallback
        }

        if (!isset(self::SERVICE_DURATIONS[$serviceType][$serviceName])) {
            Log::warning("Unknown service name: {$serviceName} for type: {$serviceType}");
            return $serviceType === 'grooming' ? 60 : 30; // Service type fallback
        }

        return self::SERVICE_DURATIONS[$serviceType][$serviceName];
    }

    /**
     * Get total time including buffer (duration + buffer)
     */
    public static function getTotalTimeWithBuffer(string $serviceType, string $serviceName): int
    {
        $duration = self::getServiceDuration($serviceType, $serviceName);
        $buffer = self::getBufferTime($serviceType);
        return $duration + $buffer;
    }

    /**
     * Get buffer time for service type
     */
    public static function getBufferTime(string $serviceType): int
    {
        return self::BUFFER_TIMES[$serviceType] ?? 0;
    }

    /**
     * Check if service requires manual scheduling (not customer bookable)
     */
    public static function requiresManualScheduling(string $serviceType, string $serviceName): bool
    {
        $duration = self::getServiceDuration($serviceType, $serviceName);
        return $duration >= 90; // Services 90+ minutes require manual scheduling
    }

    /**
     * Generate time slots for a given date
     */
    public static function generateTimeSlots(string $date, string $serviceType, string $serviceName, array $existingBookings = []): array
    {
        $duration = self::getServiceDuration($serviceType, $serviceName);
        $buffer = self::getBufferTime($serviceType);
        $totalTime = $duration + $buffer;

        $slots = [];
        [$startHour, $startMinute] = explode(':', self::BUSINESS_HOURS['start']);
        [$endHour, $endMinute] = explode(':', self::BUSINESS_HOURS['end']);

        // Generate all possible slots
        for ($hour = (int)$startHour; $hour < (int)$endHour; $hour++) {
            for ($minute = 0; $minute < 60; $minute += self::TIME_SLOT_INTERVAL) {
                if ($minute >= 60) break;

                $slotTime = sprintf('%02d:%02d', $hour, $minute);
                $slotLabel = Carbon::createFromTime($hour, $minute)->format('g:i A');

                // Calculate slot end time
                $slotStart = Carbon::parse($date . ' ' . $slotTime);
                $slotEnd = $slotStart->copy()->addMinutes($totalTime);

                // Check if slot fits within business hours
                if ($slotEnd->hour > (int)$endHour || 
                    ($slotEnd->hour === (int)$endHour && $slotEnd->minute > (int)$endMinute)) {
                    continue; // Slot would extend beyond business hours
                }

                // Check for overlaps with existing bookings
                $isAvailable = true;
                foreach ($existingBookings as $booking) {
                    $bookingStart = Carbon::parse($booking['start_datetime']);
                    $bookingEnd = Carbon::parse($booking['end_datetime']);

                    // Overlap condition: newStart < existingEnd AND newEnd > existingStart
                    if ($slotStart->lt($bookingEnd) && $slotEnd->gt($bookingStart)) {
                        $isAvailable = false;
                        break;
                    }
                }

                $slots[] = [
                    'start_time' => $slotTime,
                    'end_time' => $slotEnd->format('H:i'),
                    'label' => $slotLabel . ' - ' . $slotEnd->format('g:i A'),
                    'duration_minutes' => $duration,
                    'buffer_minutes' => $buffer,
                    'total_minutes' => $totalTime,
                    'available' => $isAvailable,
                    'start_datetime' => $slotStart->toISOString(),
                    'end_datetime' => $slotEnd->toISOString()
                ];
            }
        }

        return $slots;
    }

    /**
     * Calculate end datetime from start datetime and service duration
     */
    public static function calculateEndDatetime(string $startDatetime, string $serviceType, string $serviceName): string
    {
        $duration = self::getServiceDuration($serviceType, $serviceName);
        $buffer = self::getBufferTime($serviceType);
        $totalTime = $duration + $buffer;

        $endDatetime = Carbon::parse($startDatetime)->addMinutes($totalTime);
        return $endDatetime->toISOString();
    }

    /**
     * Validate if a time slot is valid for booking
     */
    public static function isValidTimeSlot(string $startTime, string $serviceType, string $serviceName): bool
    {
        // Check if it's a valid 30-minute interval
        [$hours, $minutes] = explode(':', $startTime);
        if ((int)$minutes % self::TIME_SLOT_INTERVAL !== 0) {
            return false;
        }

        // Check if within business hours
        $duration = self::getServiceDuration($serviceType, $serviceName);
        $buffer = self::getBufferTime($serviceType);
        $totalTime = $duration + $buffer;

        $slotStart = Carbon::parse('2000-01-01 ' . $startTime);
        $slotEnd = $slotStart->copy()->addMinutes($totalTime);

        [$endHour, $endMinute] = explode(':', self::BUSINESS_HOURS['end']);

        return $slotEnd->hour < (int)$endHour || 
               ($slotEnd->hour === (int)$endHour && $slotEnd->minute <= (int)$endMinute);
    }

    /**
     * Get default boarding check-in time
     */
    public static function getDefaultBoardingCheckInTime(): string
    {
        return self::SERVICE_DURATIONS['boarding']['default_check_in_time'];
    }

    /**
     * Get default boarding check-out time
     */
    public static function getDefaultBoardingCheckOutTime(): string
    {
        return self::SERVICE_DURATIONS['boarding']['default_check_out_time'];
    }

    /**
     * Get boarding cleaning buffer time
     */
    public static function getBoardingCleaningBuffer(): int
    {
        return self::SERVICE_DURATIONS['boarding']['cleaning_buffer_minutes'];
    }

    /**
     * Get all available service types and their services
     */
    public static function getAllServices(): array
    {
        return self::SERVICE_DURATIONS;
    }

    /**
     * Get business hours
     */
    public static function getBusinessHours(): array
    {
        return self::BUSINESS_HOURS;
    }

    /**
     * Get time slot interval
     */
    public static function getTimeSlotInterval(): int
    {
        return self::TIME_SLOT_INTERVAL;
    }
}
