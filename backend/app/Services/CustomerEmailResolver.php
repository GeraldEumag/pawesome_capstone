<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Pet;
use App\Models\ServiceRequest;
use App\Models\User;

/**
 * Resolves the authoritative customer/recipient for booking records.
 *
 * Identity domains differ across this codebase and must never be
 * interchanged:
 *  - service_requests.customer_id stores a users.id
 *  - dedicated service records (groomings, boardings, appointments,
 *    medical_confinements) store a customers.id
 *
 * Resolution only follows stable ownership links. Email/name matching is
 * reserved for genuinely unlinked contact records (walk-in or legacy
 * requests with no account reference) and never overrides an account link.
 */
class CustomerEmailResolver
{
    /**
     * Resolve the owning customer for a service request.
     *
     * Order: pet ownership → account link → unlinked contact fallback.
     * A linked request (customer_id set) never falls back to email/name
     * guessing — a missing Customer record is unresolved, not reassigned.
     */
    public static function forServiceRequest(ServiceRequest $serviceRequest): ?Customer
    {
        if ($serviceRequest->pet_id) {
            $customer = Pet::with('customer')->find($serviceRequest->pet_id)?->customer;

            if ($customer) {
                return $customer;
            }
        }

        if ($serviceRequest->customer_id) {
            $user = User::find($serviceRequest->customer_id);

            if (!$user) {
                return null;
            }

            // Primary: the stable user_id link. Fallback: an unclaimed
            // legacy row whose email matches the verified account —
            // this is the sync invariant enforced on email change, not
            // an arbitrary match against request-supplied data.
            return Customer::where('user_id', $user->id)->first()
                ?? Customer::where('email', $user->email)->whereNull('user_id')->first();
        }

        // Unlinked contact record (walk-in/legacy): the stored contact
        // email is the only identity available.
        if ($serviceRequest->customer_email) {
            return Customer::where('email', $serviceRequest->customer_email)->first();
        }

        return null;
    }

    /**
     * Resolve the user account that should receive communications for a
     * dedicated-service record whose customer_id stores a customers.id.
     */
    public static function userForCustomer(?Customer $customer): ?User
    {
        if (!$customer) {
            return null;
        }

        if ($customer->user_id) {
            return User::find($customer->user_id);
        }

        return $customer->email ? User::where('email', $customer->email)->first() : null;
    }

    /**
     * Resolve the recipient user for a service request. Returns null when
     * the request has no reachable account — callers must treat that as
     * suppressed, never guess.
     */
    public static function userForServiceRequest(ServiceRequest $serviceRequest): ?User
    {
        if ($serviceRequest->customer_id) {
            return User::find($serviceRequest->customer_id);
        }

        return self::userForCustomer(self::forServiceRequest($serviceRequest));
    }
}
