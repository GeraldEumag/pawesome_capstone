<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Appointment;
use App\Models\GroomingAppointment;
use App\Models\Boarding;
use App\Models\User;
use App\Models\Customer;
use App\Models\Pet;

class TestDoubleBooking extends Command
{
    protected $signature = 'test:double-booking';
    protected $description = 'Test double booking prevention for all booking types';

    public function handle()
    {
        $this->info('🚀 PAWESOME DOUBLE BOOKING PREVENTION TESTS');
        $this->info('===============================================');

        // Test data setup
        $testVet = User::where('role', 'veterinary')->first();
        $testCustomer = Customer::first();
        $testPet = Pet::first();
        
        if (!$testCustomer || !$testPet || !$testVet) {
            $this->error('❌ Missing test data. Please ensure you have:');
            $this->error('   - At least 1 customer record');
            $this->error('   - At least 1 pet record');
            $this->error('   - At least 1 veterinarian user');
            return 1;
        }
        
        $this->info("✅ Test data loaded successfully");
        $this->info("   Customer: {$testCustomer->name}");
        $this->info("   Pet: {$testPet->name}");
        $this->info("   Veterinarian: {$testVet->name}");
        $this->newLine();

        // Test 1: Veterinary Double Booking Prevention
        $this->info('📋 TEST 1: Veterinary Double Booking Prevention');
        $this->info('--------------------------------------------');

        try {
            // Clean up any existing test appointments
            Appointment::where('notes', 'like', '%DB_TEST_%')->delete();
            
            // Create first appointment
            $appointment1 = Appointment::create([
                'customer_id' => $testCustomer->id,
                'pet_id' => $testPet->id,
                'service_id' => 1,
                'veterinarian_id' => $testVet->id,
                'scheduled_at' => '2026-05-15 10:00:00',
                'status' => 'requested',
                'price' => 100.00,
                'notes' => 'DB_TEST_1'
            ]);
            
            $this->info("✅ Created first appointment: #{$appointment1->id}");
            
            // Try to create second appointment with same vet/time
            $appointment2 = Appointment::create([
                'customer_id' => $testCustomer->id,
                'pet_id' => $testPet->id,
                'service_id' => 2,
                'veterinarian_id' => $testVet->id,
                'scheduled_at' => '2026-05-15 10:00:00',
                'status' => 'requested',
                'price' => 150.00,
                'notes' => 'DB_TEST_2'
            ]);
            
            $this->info("✅ Created second appointment: #{$appointment2->id}");
            
            // Test approval of first appointment (should succeed)
            $result1 = $this->approveAppointment($appointment1->id, $testVet->id);
            $this->info("Approve first appointment: " . ($result1 ? "✅ SUCCESS" : "❌ FAILED"));
            
            // Test approval of second appointment (should fail)
            $result2 = $this->approveAppointment($appointment2->id, $testVet->id);
            $this->info("Approve duplicate appointment: " . ($result2 ? "❌ FAILED (should block)" : "✅ SUCCESS (correctly blocked)"));
            
            // Clean up
            Appointment::where('notes', 'like', '%DB_TEST_%')->delete();
            
        } catch (\Exception $e) {
            $this->error("❌ Veterinary test failed: {$e->getMessage()}");
        }

        $this->newLine();

        // Test 2: Grooming Double Booking Prevention
        $this->info('📋 TEST 2: Grooming Double Booking Prevention');
        $this->info('--------------------------------------------');

        try {
            // Clean up any existing test appointments
            GroomingAppointment::where('notes', 'like', '%DB_TEST_%')->delete();
            
            // Create first grooming appointment
            $grooming1 = GroomingAppointment::create([
                'pet_id' => $testPet->id,
                'pet_name' => $testPet->name,
                'service' => 'Full Grooming',
                'appointment_date' => '2026-05-15',
                'status' => 'requested',
                'notes' => 'DB_TEST_1'
            ]);
            
            $this->info("✅ Created first grooming: #{$grooming1->id}");
            
            // Try to create second grooming appointment on same date
            $grooming2 = GroomingAppointment::create([
                'pet_id' => $testPet->id,
                'pet_name' => $testPet->name,
                'service' => 'Basic Grooming',
                'appointment_date' => '2026-05-15',
                'status' => 'requested',
                'notes' => 'DB_TEST_2'
            ]);
            
            $this->info("✅ Created second grooming: #{$grooming2->id}");
            
            // Test approval of first grooming (should succeed)
            $result1 = $this->approveGrooming($grooming1->id);
            $this->info("Approve first grooming: " . ($result1 ? "✅ SUCCESS" : "❌ FAILED"));
            
            // Test approval of second grooming (should fail)
            $result2 = $this->approveGrooming($grooming2->id);
            $this->info("Approve duplicate grooming: " . ($result2 ? "❌ FAILED (should block)" : "✅ SUCCESS (correctly blocked)"));
            
            // Clean up
            GroomingAppointment::where('notes', 'like', '%DB_TEST_%')->delete();
            
        } catch (\Exception $e) {
            $this->error("❌ Grooming test failed: {$e->getMessage()}");
        }

        $this->newLine();

        // Test 3: Boarding Double Booking Prevention
        $this->info('📋 TEST 3: Boarding Double Booking Prevention');
        $this->info('--------------------------------------------');

        try {
            // Clean up any existing test boardings
            Boarding::where('notes', 'like', '%DB_TEST_%')->delete();
            
            // Create first boarding reservation
            $boarding1 = Boarding::create([
                'customer_id' => $testCustomer->id,
                'pet_id' => $testPet->id,
                'pet_name' => $testPet->name,
                'hotel_room_id' => 1,
                'check_in' => '2026-05-15',
                'check_out' => '2026-05-17',
                'status' => 'requested',
                'total_amount' => 500.00,
                'notes' => 'DB_TEST_1'
            ]);
            
            $this->info("✅ Created first boarding: #{$boarding1->id}");
            
            // Try to create overlapping boarding reservation
            $boarding2 = Boarding::create([
                'customer_id' => $testCustomer->id,
                'pet_id' => $testPet->id,
                'pet_name' => $testPet->name,
                'hotel_room_id' => 1,
                'check_in' => '2026-05-16',
                'check_out' => '2026-05-18',
                'status' => 'requested',
                'total_amount' => 400.00,
                'notes' => 'DB_TEST_2'
            ]);
            
            $this->info("✅ Created overlapping boarding: #{$boarding2->id}");
            
            // Test scheduling of first boarding (should succeed)
            $result1 = $this->scheduleBoarding($boarding1->id, 1, '2026-05-15', '2026-05-17');
            $this->info("Schedule first boarding: " . ($result1 ? "✅ SUCCESS" : "❌ FAILED"));
            
            // Test scheduling of overlapping boarding (should fail)
            $result2 = $this->scheduleBoarding($boarding2->id, 1, '2026-05-16', '2026-05-18');
            $this->info("Schedule overlapping boarding: " . ($result2 ? "❌ FAILED (should block)" : "✅ SUCCESS (correctly blocked)"));
            
            // Clean up
            Boarding::where('notes', 'like', '%DB_TEST_%')->delete();
            
        } catch (\Exception $e) {
            $this->error("❌ Boarding test failed: {$e->getMessage()}");
        }

        $this->newLine();
        $this->info('🎯 ALL TESTS COMPLETED');
        $this->info('==================================');
        
        return 0;
    }

    private function approveAppointment($id, $vetId)
    {
        try {
            $appointment = Appointment::find($id);
            if (!$appointment) return false;
            
            // Simulate the conflict check logic from AppointmentController
            $conflictingAppointment = Appointment::where('veterinarian_id', $vetId)
                ->where('scheduled_at', $appointment->scheduled_at)
                ->whereIn('status', ['scheduled', 'checked_in', 'in_consultation', 'in_treatment', 'awaiting_results'])
                ->where('id', '!=', $appointment->id)
                ->first();

            if ($conflictingAppointment) {
                $this->warn("   ⚠️  Conflict detected with appointment #{$conflictingAppointment->id}");
                return false;
            }

            $appointment->update([
                'status' => 'scheduled',
                'veterinarian_id' => $vetId,
            ]);
            
            return true;
        } catch (\Exception $e) {
            $this->error("   ❌ Approval error: {$e->getMessage()}");
            return false;
        }
    }

    private function approveGrooming($id)
    {
        try {
            $appointment = GroomingAppointment::find($id);
            if (!$appointment) return false;
            
            // Simulate the conflict check logic from GroomingController
            $conflictingAppointment = GroomingAppointment::where('appointment_date', $appointment->appointment_date)
                ->whereIn('status', ['approved', 'scheduled', 'in_progress'])
                ->where('id', '!=', $appointment->id)
                ->first();

            if ($conflictingAppointment) {
                $this->warn("   ⚠️  Conflict detected with appointment #{$conflictingAppointment->id}");
                return false;
            }

            $appointment->update(['status' => 'scheduled']);
            return true;
        } catch (\Exception $e) {
            $this->error("   ❌ Approval error: {$e->getMessage()}");
            return false;
        }
    }

    private function scheduleBoarding($id, $roomId, $checkIn, $checkOut)
    {
        try {
            $boarding = Boarding::find($id);
            if (!$boarding) return false;
            
            // Simulate the conflict check logic from BoardingController
            $conflictingBoarding = Boarding::where('hotel_room_id', $roomId)
                ->whereIn('status', ['approved', 'scheduled', 'checked_in', 'in_stay'])
                ->where('id', '!=', $boarding->id)
                ->where(function ($query) use ($checkIn, $checkOut) {
                    $query->where(function ($subQuery) use ($checkIn, $checkOut) {
                        $subQuery->where('check_in', '<', $checkOut)
                               ->where('check_out', '>', $checkIn);
                    });
                })
                ->first();

            if ($conflictingBoarding) {
                $this->warn("   ⚠️  Conflict detected with boarding #{$conflictingBoarding->id}");
                $this->warn("   📅 Existing: {$conflictingBoarding->check_in} to {$conflictingBoarding->check_out}");
                $this->warn("   📅 Requested: {$checkIn} to {$checkOut}");
                return false;
            }

            $boarding->update([
                'hotel_room_id' => $roomId,
                'check_in' => $checkIn,
                'check_out' => $checkOut,
                'status' => 'scheduled'
            ]);
            
            return true;
        } catch (\Exception $e) {
            $this->error("   ❌ Scheduling error: {$e->getMessage()}");
            return false;
        }
    }
}
