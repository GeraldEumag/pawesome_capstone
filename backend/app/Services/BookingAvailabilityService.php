<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\GroomingAppointment;
use App\Models\Boarding;
use App\Models\HotelRoom;
use App\Models\Service;
use App\Services\ServiceDurationService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BookingAvailabilityService
{
    /**
     * Blocking statuses that prevent double booking
     * These statuses mean the slot/resource is reserved and unavailable
     */
    public const BLOCKING_BOOKING_STATUSES = [
        'pending',
        'pending_review', // Future status - maps to pending for now
        'approved',
        'scheduled',
        'confirmed',
        'in_progress',
        'in_consultation',
        'checked_in',
        'ready_for_pickup',
        'in_stay',
        'in_care',
        'confined',
        'needs_confinement',
        'treated',
    ];

    /**
     * Non-blocking statuses that release the slot/resource
     * These statuses mean the slot/resource is available for new bookings
     */
    public const NON_BLOCKING_BOOKING_STATUSES = [
        'rejected',
        'cancelled',
        'completed',
        'no_show',
        'checked_out',
    ];

    /**
     * Blocking payment statuses that indicate payment is being processed
     */
    public const BLOCKING_PAYMENT_STATUSES = [
        'pending',
        'pending_verification', // Future status - maps to pending for now
        'partial',
    ];

    /**
     * Non-blocking payment statuses that indicate payment is complete or cancelled
     */
    public const NON_BLOCKING_PAYMENT_STATUSES = [
        'unpaid',
        'paid',
        'rejected',
        'refunded',
    ];

    /**
     * Check if a booking status blocks availability
     */
    public static function isBookingStatusBlocking(string $status): bool
    {
        return in_array($status, self::BLOCKING_BOOKING_STATUSES);
    }

    /**
     * Check if a payment status blocks availability
     */
    public static function isPaymentStatusBlocking(string $status): bool
    {
        return in_array($status, self::BLOCKING_PAYMENT_STATUSES);
    }

    private static function blockingServiceBookings(string $serviceType, string $date, ?int $veterinarianId = null): array
    {
        $bookings = [];
        $types = $serviceType === 'grooming'
            ? ['grooming']
            : ['vet', 'veterinary', 'appointment', 'vet appointment'];

        if (Schema::hasTable('service_requests')) {
            $query = DB::table('service_requests')
                ->whereDate('request_date', $date)
                ->whereIn('status', self::BLOCKING_BOOKING_STATUSES)
                ->whereIn(DB::raw('LOWER(request_type)'), $types);
            if (Schema::hasColumn('service_requests', 'request_time')) {
                foreach ($query->get(['request_time', 'service_name']) as $booking) {
                    $bookings[] = ['time' => $booking->request_time, 'service' => $booking->service_name];
                }
            }
        }

        if ($serviceType === 'veterinary' && Schema::hasTable('appointments')) {
            $query = Appointment::with('service:id,name')
                ->whereDate('scheduled_at', $date)
                ->whereIn('status', self::BLOCKING_BOOKING_STATUSES);
            if ($veterinarianId) {
                $query->where('veterinarian_id', $veterinarianId);
            }
            foreach ($query->get() as $booking) {
                $bookings[] = [
                    'time' => Carbon::parse($booking->scheduled_at)->format('H:i'),
                    'service' => $booking->service?->name,
                ];
            }
        }

        if ($serviceType === 'grooming' && Schema::hasTable('groomings')) {
            $query = DB::table('groomings')
                ->whereDate('appointment_date', $date)
                ->whereIn('status', self::BLOCKING_BOOKING_STATUSES);
            $columns = Schema::hasColumn('groomings', 'appointment_time')
                ? ['appointment_time', 'service']
                : ['service'];
            foreach ($query->get($columns) as $booking) {
                $bookings[] = ['time' => $booking->appointment_time ?? null, 'service' => $booking->service ?? null];
            }
        }

        if ($serviceType === 'grooming' && Schema::hasTable('grooming_appointments')) {
            $query = GroomingAppointment::whereDate('appointment_date', $date)
                ->whereIn('status', self::BLOCKING_BOOKING_STATUSES);
            foreach ($query->get() as $booking) {
                $bookings[] = [
                    'time' => $booking->appointment_time ?? null,
                    'service' => $booking->service ?? null,
                ];
            }
        }

        return $bookings;
    }

    private static function serviceMinutes(string $serviceType, ?string $serviceName): int
    {
        if ($serviceName) {
            $service = Service::whereRaw('LOWER(name) = ?', [strtolower(trim($serviceName))])->first();
            if ($service && (int) $service->duration_minutes > 0) {
                return (int) $service->duration_minutes + ServiceDurationService::getBufferTime($serviceType);
            }
        }

        $normalizedName = $serviceName
            ? ucwords(str_replace('_', ' ', trim($serviceName)))
            : '';

        return ServiceDurationService::getTotalTimeWithBuffer($serviceType, $normalizedName);
    }

    private static function serviceSlots(string $date, string $serviceType, ?string $serviceName = null): array
    {
        $bookings = self::blockingServiceBookings($serviceType, $date);
        $slotMinutes = ServiceDurationService::getTimeSlotInterval();
        $slotDuration = self::serviceMinutes($serviceType, $serviceName);
        $slots = [];

        for ($minutes = 9 * 60; $minutes < 18 * 60; $minutes += $slotMinutes) {
            $time = sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
            $start = Carbon::parse("{$date} {$time}");
            $end = $start->copy()->addMinutes($slotDuration);
            if ($end->format('H:i') > '18:00') {
                continue;
            }

            $available = true;
            foreach ($bookings as $booking) {
                if (empty($booking['time'])) {
                    $available = false;
                    break;
                }
                $existingStart = Carbon::parse("{$date} {$booking['time']}");
                $existingEnd = $existingStart->copy()->addMinutes(self::serviceMinutes($serviceType, $booking['service']));
                if ($start->lt($existingEnd) && $end->gt($existingStart)) {
                    $available = false;
                    break;
                }
            }

            $slots[] = [
                'time' => $time,
                'label' => $start->format('g:i A'),
                'available' => $available,
                'status' => $available ? 'available' : 'blocked',
                'reason' => $available ? 'Available' : 'Time slot overlaps an existing booking',
            ];
        }

        return $slots;
    }

    public static function isServiceTimeAvailable(string $serviceType, string $date, string $time, ?string $serviceName = null, ?int $veterinarianId = null): bool
    {
        $normalizedType = $serviceType === 'grooming' ? 'grooming' : 'veterinary';
        $start = Carbon::parse("{$date} {$time}");
        $end = $start->copy()->addMinutes(self::serviceMinutes($normalizedType, $serviceName));
        if ($start->minute % ServiceDurationService::getTimeSlotInterval() !== 0
            || $start->format('H:i') < '09:00'
            || $end->format('H:i') > '18:00') {
            return false;
        }

        foreach (self::blockingServiceBookings($normalizedType, $date, $veterinarianId) as $booking) {
            if (empty($booking['time'])) {
                return false;
            }
            $existingStart = Carbon::parse("{$date} {$booking['time']}");
            $existingEnd = $existingStart->copy()->addMinutes(self::serviceMinutes($normalizedType, $booking['service']));
            if ($start->lt($existingEnd) && $end->gt($existingStart)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get available veterinary time slots for a specific date
     */
    public static function getVeterinaryAvailability(?string $date = null, ?int $serviceId = null, ?string $serviceName = null): array
    {
        if (!$date) {
            $date = now()->format('Y-m-d');
        }

        $serviceName = $serviceName ?? ($serviceId ? Service::find($serviceId)?->name : null);
        $allSlots = self::serviceSlots($date, 'veterinary', $serviceName);
        $blockedSlots = collect($allSlots)->where('available', false)->values();

        return [
            'success' => true,
            'date' => $date,
            'slots' => $allSlots,
            'blocked_slots' => $blockedSlots->all(),
        ];
    }

    /**
     * Check grooming availability for a specific date
     */
    public static function getGroomingAvailability(?string $date = null, ?string $serviceName = null): array
    {
        if (!$date) {
            $date = now()->format('Y-m-d');
        }

        $slots = self::serviceSlots($date, 'grooming', $serviceName);
        $isAvailable = collect($slots)->contains(fn ($slot) => $slot['available']);

        return [
            'success' => true,
            'date' => $date,
            'available' => $isAvailable,
            'message' => $isAvailable
                ? 'Grooming time slots available for this date'
                : 'No grooming time slots are available for this date',
            'slots' => $slots,
            'existing_appointment' => null,
        ];
    }

    /**
     * Get available boarding rooms for date range
     */
    public static function getBoardingAvailability(?string $checkIn = null, ?string $checkOut = null): array
    {
        if (!$checkIn) {
            $checkIn = now()->format('Y-m-d');
        }
        if (!$checkOut) {
            $checkOut = now()->addDays(1)->format('Y-m-d');
        }

        $checkInDate = Carbon::parse($checkIn);
        $checkOutDate = Carbon::parse($checkOut);

        // Validate date range
        if ($checkOutDate->lessThanOrEqualTo($checkInDate)) {
            return [
                'success' => false,
                'message' => 'Check-out date must be after check-in date',
            ];
        }

        // Get all rooms that are potentially available
        $allRooms = HotelRoom::where('status', 'available')->get();

        $availableRooms = [];

        foreach ($allRooms as $room) {
            $hasConflict = !self::isBoardingRoomAvailable(
                $room->id,
                $checkInDate->toDateString(),
                $checkOutDate->toDateString()
            );

            $availableRooms[] = [
                'id' => $room->id,
                'name' => $room->name,
                'type' => $room->type,
                'size' => $room->size,
                'capacity' => $room->capacity,
                'daily_rate' => $room->daily_rate,
                'available' => !$hasConflict,
                'status' => $hasConflict ? 'unavailable' : 'available',
                'reason' => $hasConflict ? 'Room already booked for selected dates' : 'Available',
            ];
        }

        return [
            'success' => true,
            'check_in' => $checkIn,
            'check_out' => $checkOut,
            'rooms' => $availableRooms,
        ];
    }

    /**
     * Check if a specific veterinary slot is available
     */
    public static function isVeterinarySlotAvailable(string $date, string $time, ?int $veterinarianId = null, ?string $serviceName = null): bool
    {
        return self::isServiceTimeAvailable('veterinary', $date, $time, $serviceName, $veterinarianId);
    }

    public static function isGroomingDateAvailable(string $date, ?string $serviceName = null): bool
    {
        return collect(self::serviceSlots($date, 'grooming', $serviceName))
            ->contains(fn ($slot) => $slot['available']);
    }

    /**
     * Check if a boarding room is available for date range
     */
    public static function isBoardingRoomAvailable(int $roomId, string $checkIn, string $checkOut): bool
    {
        $checkInDate = Carbon::parse($checkIn);
        $checkOutDate = Carbon::parse($checkOut);

        $hasBoardingConflict = Boarding::where('hotel_room_id', $roomId)
            ->whereIn('status', self::BLOCKING_BOOKING_STATUSES)
            ->whereDate('check_in', '<=', $checkOutDate)
            ->whereDate('check_out', '>=', $checkInDate)
            ->exists();

        if ($hasBoardingConflict || !Schema::hasTable('boarding_room_reservations')) {
            return !$hasBoardingConflict;
        }

        $roomColumn = Schema::hasColumn('boarding_room_reservations', 'room_id') ? 'room_id' : 'boarding_room_id';
        return !DB::table('boarding_room_reservations')
            ->where($roomColumn, $roomId)
            ->whereIn('status', self::BLOCKING_BOOKING_STATUSES)
            ->whereDate('check_in_date', '<=', $checkOutDate)
            ->whereDate('check_out_date', '>=', $checkInDate)
            ->exists();
    }
}
