<?php

namespace Tests\Unit;

use App\Services\BookingWorkflowStage as Stage;
use PHPUnit\Framework\TestCase;

class BookingWorkflowStageTest extends TestCase
{
    public function test_grooming_pending_waits_for_approval(): void
    {
        $this->assertSame(Stage::TO_APPROVE, Stage::forServiceRequest('grooming', 'pending', 'unpaid'));
    }

    public function test_approved_grooming_is_to_pay_until_paid_then_on_going(): void
    {
        $this->assertSame(Stage::TO_PAY, Stage::forServiceRequest('grooming', 'approved', 'unpaid'));
        $this->assertSame(Stage::TO_PAY, Stage::forServiceRequest('grooming', 'approved', 'rejected'));
        $this->assertSame(Stage::ON_GOING, Stage::forServiceRequest('grooming', 'approved', 'paid'));
    }

    public function test_grooming_pickup_lifecycle(): void
    {
        $this->assertSame(Stage::ON_GOING, Stage::forServiceRequest('grooming', 'in_progress', 'paid'));
        $this->assertSame(Stage::READY_TO_PICKUP, Stage::forServiceRequest('grooming', 'ready_for_pickup', 'paid'));
        $this->assertSame(Stage::COMPLETE, Stage::forServiceRequest('grooming', 'completed', 'paid'));
    }

    public function test_cancelled_and_rejected_requests_are_canceled(): void
    {
        $this->assertSame(Stage::CANCELED, Stage::forServiceRequest('grooming', 'rejected', 'unpaid'));
        $this->assertSame(Stage::CANCELED, Stage::forServiceRequest('vet', 'cancelled', 'unpaid'));
    }

    public function test_finalized_vet_consultation_is_ready_to_pickup_even_when_unpaid(): void
    {
        $this->assertSame(
            Stage::READY_TO_PICKUP,
            Stage::forServiceRequest('veterinary', 'approved', 'unpaid', 'checkout')
        );
        $this->assertSame(
            Stage::READY_TO_PICKUP,
            Stage::forServiceRequest('veterinary', 'approved', 'unpaid', 'clinical_complete')
        );
    }

    public function test_vet_appointment_status_takes_precedence_over_request_status(): void
    {
        $this->assertSame(Stage::COMPLETE, Stage::forServiceRequest('vet', 'approved', 'paid', 'completed'));
        $this->assertSame(Stage::ON_GOING, Stage::forServiceRequest('vet', 'approved', 'unpaid', 'in_consultation'));
        $this->assertSame(Stage::CANCELED, Stage::forServiceRequest('vet', 'approved', 'unpaid', 'no_show'));
    }

    public function test_approved_vet_without_consultation_follows_payment(): void
    {
        $this->assertSame(Stage::TO_PAY, Stage::forServiceRequest('vet', 'approved', 'unpaid', 'scheduled'));
        $this->assertSame(Stage::ON_GOING, Stage::forServiceRequest('vet', 'approved', 'paid', 'scheduled'));
    }

    public function test_hotel_stay_stages(): void
    {
        $this->assertSame(Stage::TO_APPROVE, Stage::forBoarding('pending', 'unpaid'));
        $this->assertSame(Stage::TO_PAY, Stage::forBoarding('approved', 'unpaid'));
        $this->assertSame(Stage::ON_GOING, Stage::forBoarding('checked_in', 'paid'));
        $this->assertSame(Stage::ON_GOING, Stage::forBoarding('in_care', 'paid'));
        $this->assertSame(Stage::READY_TO_PICKUP, Stage::forBoarding('ready_for_pickup', 'paid'));
        $this->assertSame(Stage::COMPLETE, Stage::forBoarding('completed', 'paid'));
        $this->assertSame(Stage::CANCELED, Stage::forBoarding('cancelled', 'unpaid'));
    }
}
