<?php

namespace Database\Seeders;

use App\Models\HotelRoom;
use Illuminate\Database\Seeder;

class HotelRoomSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * Registered in DatabaseSeeder so migrate:fresh --seed populates
     * legacy Pet Hotel rooms (shown in the receptionist "Hotel Rooms" tab).
     * Also safe to run standalone: php artisan db:seed --class=HotelRoomSeeder
     */
    public function run(): void
    {
        $rooms = [
            [
                'room_number' => 'K-101',
                'name' => 'Standard Kennel',
                'description' => 'Standard kennel for small to medium dogs.',
                'type' => 'kennel',
                'size' => 'medium',
                'capacity' => 1,
                'daily_rate' => 500.00,
                'status' => 'available',
                'amenities' => ['bedding', 'daily_walk'],
                'notes' => 'Dog accommodation',
            ],
            [
                'room_number' => 'K-102',
                'name' => 'Large Kennel',
                'description' => 'Spacious kennel for large breed dogs.',
                'type' => 'kennel',
                'size' => 'large',
                'capacity' => 1,
                'daily_rate' => 800.00,
                'status' => 'available',
                'amenities' => ['bedding', 'daily_walk', 'play_area'],
                'notes' => 'Large dog accommodation',
            ],
            [
                'room_number' => 'C-201',
                'name' => 'Cattery Suite',
                'description' => 'Quiet cattery suite for cats.',
                'type' => 'cattery',
                'size' => 'medium',
                'capacity' => 2,
                'daily_rate' => 450.00,
                'status' => 'available',
                'amenities' => ['scratching_post', 'climbing_shelf'],
                'notes' => 'Cat accommodation',
            ],
            [
                'room_number' => 'C-202',
                'name' => 'Deluxe Cattery',
                'description' => 'Deluxe cattery room with window view.',
                'type' => 'cattery',
                'size' => 'large',
                'capacity' => 2,
                'daily_rate' => 700.00,
                'status' => 'available',
                'amenities' => ['scratching_post', 'climbing_shelf', 'window_view'],
                'notes' => 'Premium cat accommodation',
            ],
            [
                'room_number' => 'S-301',
                'name' => 'Standard Room',
                'description' => 'Standard shared room for dogs or cats.',
                'type' => 'standard',
                'size' => 'medium',
                'capacity' => 1,
                'daily_rate' => 600.00,
                'status' => 'available',
                'amenities' => ['bedding'],
                'notes' => 'General accommodation',
            ],
            [
                'room_number' => 'D-401',
                'name' => 'Deluxe Suite',
                'description' => 'Deluxe suite with premium amenities.',
                'type' => 'deluxe',
                'size' => 'large',
                'capacity' => 2,
                'daily_rate' => 1200.00,
                'status' => 'available',
                'amenities' => ['bedding', 'play_area', 'webcam'],
                'notes' => 'Premium accommodation',
            ],
        ];

        foreach ($rooms as $room) {
            HotelRoom::updateOrCreate(
                ['room_number' => $room['room_number']],
                $room
            );
        }

        $this->command?->info('Hotel rooms seeded successfully!');
    }
}
