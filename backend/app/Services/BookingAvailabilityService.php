<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\GroomingAppointment;
use App\Models\Boarding;
use App\Models\BoardingRoom;
use App\Models\HotelRoom;
use App\Models\Holiday;
use App\Models\Service;
use App\Services\ServiceDurationService;
use App\Support\StoreHours;
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
        // Phase B appointment statuses (replacing needs_confinement/treated)
        'requested',
        'in_treatment',
        'awaiting_results',
        'clinical_complete',
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

    private static function blockingServiceBookings(
        string $serviceType,
        string $date,
        ?int $veterinarianId = null,
        ?int $ignoreAppointmentId = null,
        ?int $ignoreServiceRequestId = null
    ): array {
        $bookings = [];
        $types = $serviceType === 'grooming'
            ? ['grooming']
            : ['vet', 'veterinary', 'appointment', 'vet appointment'];

        if (Schema::hasTable('service_requests')) {
            $query = DB::table('service_requests')
                ->whereDate('request_date', $date)
                ->whereIn('status', self::BLOCKING_BOOKING_STATUSES)
                ->whereIn(DB::raw('LOWER(request_type)'), $types);
            if ($ignoreServiceRequestId) {
                $query->where('id', '!=', $ignoreServiceRequestId);
            }
            if ($serviceType === 'veterinary'
                && Schema::hasTable('appointments')
                && Schema::hasColumn('appointments', 'service_request_id')) {
                $query->whereNotExists(function ($linkedAppointment) {
                    $linkedAppointment->select(DB::raw(1))
                        ->from('appointments')
                        ->whereColumn('appointments.service_request_id', 'service_requests.id')
                        ->whereIn('appointments.status', self::BLOCKING_BOOKING_STATUSES);
                });
            }
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
            if ($ignoreAppointmentId) {
                $query->where('id', '!=', $ignoreAppointmentId);
            }
            if ($veterinarianId) {
                $query->where(function ($assigned) use ($veterinarianId) {
                    $assigned->where('veterinarian_id', $veterinarianId)->orWhereNull('veterinarian_id');
                });
            }
            foreach ($query->get() as $booking) {
                $bookings[] = [
                    'time' => ServiceDurationService::inStoreTimezone($booking->scheduled_at)->format('H:i'),
                    'service' => $booking->service?->name,
                ];
            }
        }

        if ($serviceType === 'grooming' && Schema::hasTable('appointments')) {
            $query = Appointment::with('service:id,name')
                ->whereDate('scheduled_at', $date)
                ->whereIn('status', self::BLOCKING_BOOKING_STATUSES)
                ->whereHas('service', fn ($serviceQuery) => $serviceQuery
                    ->whereRaw('LOWER(category) = ?', ['grooming']));

            foreach ($query->get() as $booking) {
                $bookings[] = [
                    'time' => ServiceDurationService::inStoreTimezone($booking->scheduled_at)->format('H:i'),
                    'service' => $booking->service?->name,
                ];
            }
        }

        if ($serviceType === 'grooming' && Schema::hasTable('groomings')) {
            $query = DB::table('groomings')
                ->whereDate('appointment_date', $date)
                ->whereIn('status', self::BLOCKING_BOOKING_STATUSES);
            if ($ignoreServiceRequestId && Schema::hasColumn('groomings', 'service_request_id')) {
                $query->where(function ($q) use ($ignoreServiceRequestId) {
                    $q->whereNull('service_request_id')->orWhere('service_request_id', '!=', $ignoreServiceRequestId);
                });
            }
            if ($ignoreAppointmentId && Schema::hasColumn('groomings', 'appointment_id')) {
                $query->where(function ($q) use ($ignoreAppointmentId) {
                    $q->whereNull('appointment_id')->orWhere('appointment_id', '!=', $ignoreAppointmentId);
                });
            }
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

    public static function lockServiceSchedule(): void
    {
        Service::query()->orderBy('id')->lockForUpdate()->first();
    }

    public static function appointmentTimes(string $scheduledAt): array
    {
        $hasTimezone = preg_match('/(?:Z|[+-]\\d{2}:?\\d{2})$/i', trim($scheduledAt)) === 1;
        $instant = $hasTimezone
            ? Carbon::parse($scheduledAt)
            : Carbon::parse($scheduledAt, ServiceDurationService::STORE_TIMEZONE);
        $utc = $instant->copy()->setTimezone('UTC');
        $local = $instant->copy()->setTimezone(ServiceDurationService::STORE_TIMEZONE);

        return [$utc, $local];
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

    /** A date accepts bookings when the store is open that weekday and the date is not a holiday. */
    public static function isBookableDate(string $date, bool $allowHoliday = false): bool
    {
        $day = Carbon::parse($date, ServiceDurationService::STORE_TIMEZONE);
        return StoreHours::isOpenDay($day) && ($allowHoliday || !Holiday::isBlockedForBooking($day->toDateString()));
    }

    private static function serviceSlots(string $date, string $serviceType, ?string $serviceName = null, ?int $veterinarianId = null, bool $allowHoliday = false): array
    {
        $date = Carbon::parse($date, ServiceDurationService::STORE_TIMEZONE)->toDateString();
        if (ServiceDurationService::isSameDayBookingClosed($date) || !self::isBookableDate($date, $allowHoliday)) {
            return [];
        }

        $bookings = self::blockingServiceBookings($serviceType, $date, $veterinarianId);
        $slotMinutes = ServiceDurationService::getTimeSlotInterval();
        $slotDuration = self::serviceMinutes($serviceType, $serviceName);
        $now = Carbon::now(ServiceDurationService::STORE_TIMEZONE);
        $slots = [];

        for ($minutes = StoreHours::openMinutes(); $minutes < StoreHours::closeMinutes(); $minutes += $slotMinutes) {
            $time = sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
            $start = Carbon::parse("{$date} {$time}", ServiceDurationService::STORE_TIMEZONE);
            if ($start->lessThanOrEqualTo($now)) {
                continue;
            }
            $end = $start->copy()->addMinutes($slotDuration);
            if ($end->format('H:i') > StoreHours::closesAt()) {
                continue;
            }

            $available = true;
            foreach ($bookings as $booking) {
                if (empty($booking['time'])) {
                    $available = false;
                    break;
                }
                $existingStart = Carbon::parse("{$date} {$booking['time']}", ServiceDurationService::STORE_TIMEZONE);
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

    public static function isServiceTimeAvailable(
        string $serviceType,
        string $date,
        string $time,
        ?string $serviceName = null,
        ?int $veterinarianId = null,
        ?int $ignoreAppointmentId = null,
        ?int $ignoreServiceRequestId = null,
        bool $allowSameDayCutoff = false,
        bool $allowHoliday = false
    ): bool {
        $normalizedType = $serviceType === 'grooming' ? 'grooming' : 'veterinary';
        $date = Carbon::parse($date, ServiceDurationService::STORE_TIMEZONE)->toDateString();
        if (!$allowSameDayCutoff && ServiceDurationService::isSameDayBookingClosed($date)) {
            return false;
        }
        if (!self::isBookableDate($date, $allowHoliday)) {
            return false;
        }

        $start = Carbon::parse("{$date} {$time}", ServiceDurationService::STORE_TIMEZONE);
        $end = $start->copy()->addMinutes(self::serviceMinutes($normalizedType, $serviceName));
        if ($start->lessThanOrEqualTo(Carbon::now(ServiceDurationService::STORE_TIMEZONE))
            || $start->minute % ServiceDurationService::getTimeSlotInterval() !== 0
            || $start->format('H:i') < StoreHours::opensAt()
            || $end->format('H:i') > StoreHours::closesAt()) {
            return false;
        }

        foreach (self::blockingServiceBookings(
            $normalizedType,
            $date,
            $veterinarianId,
            $ignoreAppointmentId,
            $ignoreServiceRequestId
        ) as $booking) {
            if (empty($booking['time'])) {
                return false;
            }
            $existingStart = Carbon::parse("{$date} {$booking['time']}", ServiceDurationService::STORE_TIMEZONE);
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
    public static function getVeterinaryAvailability(?string $date = null, ?int $serviceId = null, ?string $serviceName = null, ?int $veterinarianId = null, bool $allowHoliday = false): array
    {
        if (!$date) {
            $date = Carbon::now(ServiceDurationService::STORE_TIMEZONE)->toDateString();
        }

        $serviceName = $serviceName ?? ($serviceId ? Service::find($serviceId)?->name : null);
        $allSlots = self::serviceSlots($date, 'veterinary', $serviceName, $veterinarianId, $allowHoliday);
        $blockedSlots = collect($allSlots)->where('available', false)->values();

        return [
            'success' => true,
            'date' => Carbon::parse($date, ServiceDurationService::STORE_TIMEZONE)->toDateString(),
            'slots' => $allSlots,
            'blocked_slots' => $blockedSlots->all(),
            'holiday' => Holiday::blockedNameOn($date),
        ];
    }

    /**
     * Check grooming availability for a specific date
     */
    public static function getGroomingAvailability(?string $date = null, ?string $serviceName = null, bool $allowHoliday = false): array
    {
        if (!$date) {
            $date = Carbon::now(ServiceDurationService::STORE_TIMEZONE)->toDateString();
        }

        $slots = self::serviceSlots($date, 'grooming', $serviceName, null, $allowHoliday);
        $isAvailable = collect($slots)->contains(fn ($slot) => $slot['available']);

        return [
            'success' => true,
            'date' => Carbon::parse($date, ServiceDurationService::STORE_TIMEZONE)->toDateString(),
            'available' => $isAvailable,
            'holiday' => Holiday::blockedNameOn($date),
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
            $checkIn = Carbon::now(ServiceDurationService::STORE_TIMEZONE)->toDateString();
        }
        if (!$checkOut) {
            $checkOut = $checkIn;
        }

        $checkInDate = Carbon::parse($checkIn, ServiceDurationService::STORE_TIMEZONE)->startOfDay();
        $checkOutDate = Carbon::parse($checkOut, ServiceDurationService::STORE_TIMEZONE)->startOfDay();

        if ($checkOutDate->lessThan($checkInDate)) {
            return [
                'success' => false,
                'message' => 'Check-out date cannot be before check-in date',
            ];
        }

        $blockedDays = Holiday::blockedBetween($checkInDate, $checkOutDate);
        if ($blockedDays) {
            return [
                'success' => true,
                'check_in' => $checkIn,
                'check_out' => $checkOut,
                'rooms' => [],
                'holidays' => $blockedDays,
                'message' => 'Hotel stays cannot start or end on, or include, a public holiday.',
            ];
        }

        // Get all rooms that are potentially available
        $allRooms = HotelRoom::where('status', 'available')->get();

        $availableRooms = [];

        foreach ($allRooms as $room) {
            // Legacy hotel_rooms are single units (capacity = pets per room),
            // so any blocking stay makes the whole room unavailable.
            $hasConflict = self::blockingBoardingRoomUnits(
                $room->id,
                $checkInDate,
                $checkOutDate,
                'hotel_rooms'
            ) > 0;

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

        // Modern boarding_rooms pool — each row represents total_rooms
        // identical units, so availability is capacity-based, not boolean.
        if (Schema::hasTable('boarding_rooms')) {
            $boardingQuery = BoardingRoom::where('is_active', true);
            if (Schema::hasColumn('boarding_rooms', 'customer_selectable')) {
                $boardingQuery->where('customer_selectable', true);
            }

            foreach ($boardingQuery->get() as $room) {
                $capacity = max(1, (int) ($room->total_rooms ?? 1));
                $blocking = self::blockingBoardingRoomUnits($room->id, $checkInDate, $checkOutDate, 'boarding_rooms');
                $remaining = max(0, $capacity - $blocking);
                $isFree = $remaining > 0;

                $availableRooms[] = [
                    'id' => $room->id,
                    'name' => $room->room_name,
                    'type' => $room->room_type,
                    'size' => null,
                    'capacity' => $capacity,
                    'daily_rate' => $room->daily_rate,
                    'available' => $isFree,
                    'available_rooms' => $remaining,
                    'status' => $isFree ? 'available' : 'unavailable',
                    'reason' => $isFree ? 'Available' : 'Room fully booked for selected dates',
                ];
            }
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
     * Count overlapping bookings/reservations occupying units of a room.
     * The two room tables are separate pools with their own id namespace:
     * hotel_rooms are blocked by boardings.hotel_room_id, while
     * boarding_rooms are blocked by boarding_room_reservations.room_id.
     */
    private static function blockingBoardingRoomUnits(int $roomId, Carbon $checkInDate, Carbon $checkOutDate, string $pool = 'boarding_rooms'): int
    {
        if ($pool === 'hotel_rooms') {
            return Boarding::where('hotel_room_id', $roomId)
                ->whereIn('status', self::BLOCKING_BOOKING_STATUSES)
                ->whereDate('check_in', '<=', $checkOutDate)
                ->whereDate('check_out', '>=', $checkInDate)
                ->count();
        }

        if (!Schema::hasTable('boarding_room_reservations')) {
            return 0;
        }

        $roomColumn = Schema::hasColumn('boarding_room_reservations', 'room_id') ? 'room_id' : 'boarding_room_id';
        return DB::table('boarding_room_reservations')
            ->where($roomColumn, $roomId)
            ->whereIn('status', self::BLOCKING_BOOKING_STATUSES)
            ->whereDate('check_in_date', '<=', $checkOutDate)
            ->whereDate('check_out_date', '>=', $checkInDate)
            ->count();
    }

    /**
     * Check if a boarding room is available for date range.
     * Capacity-aware: boarding_rooms with total_rooms > 1 stay available
     * until every unit is booked; hotel_rooms rows are single units.
     */
    public static function isBoardingRoomAvailable(int $roomId, string $checkIn, string $checkOut, string $pool = 'boarding_rooms'): bool
    {
        $checkInDate = Carbon::parse($checkIn);
        $checkOutDate = Carbon::parse($checkOut);

        $blocking = self::blockingBoardingRoomUnits($roomId, $checkInDate, $checkOutDate, $pool);
        $capacity = $pool === 'hotel_rooms'
            ? 1
            : (int) (BoardingRoom::find($roomId)?->total_rooms ?? 1);

        return $blocking < max(1, $capacity);
    }
}
