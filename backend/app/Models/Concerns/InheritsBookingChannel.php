<?php

namespace App\Models\Concerns;

use App\Models\Appointment;
use App\Models\ServiceRequest;
use App\Support\BookingChannel;
use Illuminate\Support\Facades\Schema;

/**
 * Copies booking_channel from the linked service_request when a promoted
 * booking row (boarding/grooming/appointment) is created without one, so
 * the channel survives receptionist promotion to the cashier-payable table.
 * MedicalConfinement has no service_request_id — it links through
 * consultation_id to the appointment that produced it.
 */
trait InheritsBookingChannel
{
    protected function inheritBookingChannelFromRequest(): void
    {
        if (!empty($this->booking_channel)) {
            return;
        }

        $requestId = $this->service_request_id ?? null;

        if ($requestId && Schema::hasColumn('service_requests', 'booking_channel')) {
            $channel = ServiceRequest::whereKey($requestId)->value('booking_channel');
            if ($channel) {
                $this->booking_channel = $channel;
            }
            return;
        }

        // Confinements are initiated by the veterinarian on an existing
        // appointment — inherit the appointment's channel, defaulting to
        // the counter channel for legacy rows with none recorded.
        if (($this->consultation_id ?? null) && Schema::hasColumn('appointments', 'booking_channel')) {
            $channel = Appointment::whereKey($this->consultation_id)->value('booking_channel');
            $this->booking_channel = $channel ?: BookingChannel::WALK_IN;
        }
    }
}
