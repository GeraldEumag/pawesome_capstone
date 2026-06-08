<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\BoardingRoom;

class BoardingRoomSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * MANUAL-ONLY SEEDER - Do NOT add to DatabaseSeeder.php
     * Run manually: php artisan db:seed --class=BoardingRoomSeeder
     */
    public function run(): void
    {
        $rooms = [
            [
                'room_code' => 'DOG-STD-001',
                'room_name' => 'Standard Dog Room',
                'room_type' => 'dog_standard',
                'allowed_species' => ['dog'],
                'max_capacity' => 1,
                'total_rooms' => 5,
                'daily_rate' => 500.00,
                'is_active' => true,
                'customer_selectable' => true,
                'notes' => 'Standard accommodation for small to medium dogs',
            ],
            [
                'room_code' => 'DOG-LRG-001',
                'room_name' => 'Large Dog Suite',
                'room_type' => 'dog_large',
                'allowed_species' => ['dog'],
                'max_capacity' => 1,
                'total_rooms' => 3,
                'daily_rate' => 800.00,
                'is_active' => true,
                'customer_selectable' => true,
                'notes' => 'Spacious suite for large breed dogs',
            ],
            [
                'room_code' => 'DOG-FAM-001',
                'room_name' => 'Family Dog Room',
                'room_type' => 'dog_family',
                'allowed_species' => ['dog'],
                'max_capacity' => 2,
                'total_rooms' => 2,
                'daily_rate' => 1200.00,
                'is_active' => true,
                'customer_selectable' => true,
                'notes' => 'Accommodates 2 dogs from the same family',
            ],
            [
                'room_code' => 'CAT-CON-001',
                'room_name' => 'Cat Condo',
                'room_type' => 'cat_condo',
                'allowed_species' => ['cat'],
                'max_capacity' => 1,
                'total_rooms' => 4,
                'daily_rate' => 400.00,
                'is_active' => true,
                'customer_selectable' => true,
                'notes' => 'Comfortable condo for single cats',
            ],
            [
                'room_code' => 'CAT-SUI-001',
                'room_name' => 'Cat Suite',
                'room_type' => 'cat_suite',
                'allowed_species' => ['cat'],
                'max_capacity' => 2,
                'total_rooms' => 2,
                'daily_rate' => 700.00,
                'is_active' => true,
                'customer_selectable' => true,
                'notes' => 'Luxury suite for 2 cats from the same family',
            ],
            [
                'room_code' => 'DAY-DOG-001',
                'room_name' => 'Dog Daycare',
                'room_type' => 'daycare_dog',
                'allowed_species' => ['dog'],
                'max_capacity' => 10,
                'total_rooms' => 1,
                'daily_rate' => 300.00,
                'is_active' => true,
                'customer_selectable' => true,
                'notes' => 'Daycare service for dogs (daily rate)',
            ],
            [
                'room_code' => 'DAY-CAT-001',
                'room_name' => 'Cat Daycare',
                'room_type' => 'daycare_cat',
                'allowed_species' => ['cat'],
                'max_capacity' => 8,
                'total_rooms' => 1,
                'daily_rate' => 250.00,
                'is_active' => true,
                'customer_selectable' => true,
                'notes' => 'Daycare service for cats (daily rate)',
            ],
        ];

        foreach ($rooms as $room) {
            BoardingRoom::updateOrCreate(
                ['room_code' => $room['room_code']],
                $room
            );
        }

        $this->command->info('Boarding rooms seeded successfully!');
    }
}
