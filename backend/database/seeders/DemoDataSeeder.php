<?php

namespace Database\Seeders;

use App\Models\Boarding;
use App\Models\BoardingRoom;
use App\Models\Customer;
use App\Models\Grooming;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Models\VetAppointment;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $this->command?->info('Creating demo data for capstone presentation...');

        // Get customer user
        $customerUser = User::where('email', 'customer@example.com')->first();
        if (!$customerUser) {
            $this->command?->error('Customer user not found. Please run PawesomeLiveDemoSeeder first.');
            return;
        }

        // Create or get customer record
        $customer = Customer::firstOrCreate(
            ['user_id' => $customerUser->id],
            [
                'name' => 'Demo Customer',
                'email' => 'customer@example.com',
                'phone' => '09123456789',
                'address' => '123 Demo Street, Manila',
                'is_active' => true,
            ]
        );

        // Create demo pet
        $pet = $this->createDemoPet($customer);

        // Create grooming appointment
        $this->createGroomingAppointment($customer, $pet);

        // Create vet appointment
        $this->createVetAppointment($pet);

        // Create boarding reservation (may skip if no hotel rooms available)
        $this->createBoardingReservation($customer, $pet);

        // Create inventory movement
        $this->createInventoryMovement();

        $this->command?->info('Demo data created successfully!');
        $this->command?->info('Pet: ' . $pet->name);
        $this->command?->info('Grooming: ' . Grooming::where('pet_id', $pet->id)->count() . ' appointment(s)');
        $this->command?->info('Vet Appointments: ' . VetAppointment::where('pet_id', $pet->id)->count() . ' appointment(s)');
        $this->command?->info('Boardings: ' . Boarding::where('pet_id', $pet->id)->count() . ' reservation(s)');
    }


    private function createDemoPet(Customer $customer): Pet
    {
        $pet = Pet::firstOrCreate(
            [
                'customer_id' => $customer->id,
                'name' => 'Buddy',
            ],
            [
                'species' => 'Dog',
                'breed' => 'Golden Retriever',
                'birthdate' => '2022-05-15',
                'age' => 2,
                'gender' => 'male',
                'status' => 'active',
                'notes' => 'Friendly and energetic. Loves playing fetch.',
            ]
        );

        $this->command?->info('Created demo pet: ' . $pet->name);
        return $pet;
    }

    private function createGroomingAppointment(Customer $customer, Pet $pet): void
    {
        $service = Service::where('name', 'Full Grooming Medium Breed')->first();
        
        if (!$service) {
            $service = Service::firstOrCreate(
                ['name' => 'Full Grooming Medium Breed'],
                [
                    'category' => 'Grooming',
                    'price' => 950,
                    'duration' => 150,
                    'duration_minutes' => 150,
                    'description' => 'Full grooming for medium breeds',
                    'is_active' => true,
                ]
            );
        }

        $grooming = Grooming::firstOrCreate(
            [
                'customer_id' => $customer->id,
                'pet_id' => $pet->id,
                'appointment_date' => now()->addDays(2)->toDateString(),
            ],
            [
                'service' => $service->name,
                'appointment_time' => '10:00',
                'notes' => 'First grooming appointment',
                'base_amount' => $service->price,
                'additional_charges' => 0,
                'total_amount' => $service->price,
                'amount_paid' => 0,
                'balance_due' => $service->price,
                'payment_status' => 'pending',
                'status' => 'pending',
            ]
        );

        $this->command?->info('Created grooming appointment for ' . $pet->name);
    }

    private function createVetAppointment(Pet $pet): void
    {
        $service = Service::where('name', 'General Check-up')->first();
        
        if (!$service) {
            $service = Service::firstOrCreate(
                ['name' => 'General Check-up'],
                [
                    'category' => 'Consultation',
                    'price' => 500,
                    'duration' => 30,
                    'duration_minutes' => 30,
                    'description' => 'Routine veterinary check-up and wellness exam',
                    'is_active' => true,
                ]
            );
        }

        $appointment = VetAppointment::firstOrCreate(
            [
                'pet_id' => $pet->id,
                'appointment_date' => now()->addDays(1)->toDateString(),
            ],
            [
                'pet_name' => $pet->name,
                'service' => $service->name,
                'concern' => 'Annual wellness check-up and vaccination review',
                'status' => 'pending',
            ]
        );

        $this->command?->info('Created vet appointment for ' . $pet->name);
    }

    private function createBoardingReservation(Customer $customer, Pet $pet): void
    {
        // Check if hotel_rooms table has data
        $hotelRoom = \App\Models\HotelRoom::where('status', 'available')->first();
        
        if (!$hotelRoom) {
            $this->command?->warn('No available hotel rooms. Skipping boarding reservation (schema mismatch with boarding_rooms).');
            return;
        }

        $checkIn = now()->addDays(5);
        $checkOut = now()->addDays(7);
        $days = $checkIn->diffInDays($checkOut);
        $totalAmount = $days * $hotelRoom->daily_rate;

        $boarding = Boarding::firstOrCreate(
            [
                'pet_id' => $pet->id,
                'check_in' => $checkIn,
            ],
            [
                'pet_name' => $pet->name,
                'pet_type' => $pet->species,
                'pet_breed' => $pet->breed,
                'customer_id' => $customer->id,
                'customer_email' => $customer->email,
                'customer_name' => $customer->name,
                'hotel_room_id' => $hotelRoom->id,
                'stay_type' => 'overnight',
                'check_in_time' => '14:00',
                'check_out_time' => '12:00',
                'boarding_type' => 'standard',
                'status' => 'pending',
                'base_amount' => $totalAmount,
                'additional_charges' => 0,
                'total_amount' => $totalAmount,
                'amount_paid' => 0,
                'balance_due' => $totalAmount,
                'payment_status' => 'pending',
                'notes' => 'Demo boarding reservation for capstone presentation',
                'special_requests' => 'Please give extra treats',
            ]
        );

        $this->command?->info('Created boarding reservation for ' . $pet->name . ' in ' . $hotelRoom->name);
    }

    private function createInventoryMovement(): void
    {
        // Find a suitable inventory item for testing
        $item = InventoryItem::first();
        
        if (!$item) {
            $this->command?->warn('No inventory items found. Skipping inventory movement.');
            return;
        }

        // Create a stock adjustment log (without updating item due to schema complexity)
        InventoryLog::firstOrCreate(
            [
                'inventory_item_id' => $item->id,
                'type' => 'adjustment',
                'created_at' => now()->toDateString(),
            ],
            [
                'delta' => 10,
                'stock_before' => 100,
                'stock_after' => 110,
                'reason' => 'Demo stock adjustment for capstone presentation',
                'performed_by' => User::where('email', 'inventory@example.com')->first()->id ?? 1,
                'item_name_snapshot' => $item->name,
            ]
        );

        $this->command?->info('Created inventory movement log for: ' . $item->name);
    }
}
