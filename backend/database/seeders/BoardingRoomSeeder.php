<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class BoardingRoomSeeder extends Seeder
{
    public function run(): void
    {
        if (DB::table('boarding_rooms')->count() > 0) {
            return;
        }

        $rooms = [
            // ── Dog Rooms ──────────────────────────────────────────────
            [
                'room_code'           => 'DOG-STD-01',
                'room_name'           => 'Standard Kennel A',
                'room_type'           => 'dog_standard',
                'allowed_species'     => json_encode(['dog']),
                'max_capacity'        => 1,
                'total_rooms'         => 3,
                'daily_rate'          => 350.00,
                'is_active'           => true,
                'customer_selectable' => true,
                'notes'               => 'Suitable for small to medium dogs.',
            ],
            [
                'room_code'           => 'DOG-LRG-01',
                'room_name'           => 'Large Kennel A',
                'room_type'           => 'dog_large',
                'allowed_species'     => json_encode(['dog']),
                'max_capacity'        => 1,
                'total_rooms'         => 2,
                'daily_rate'          => 500.00,
                'is_active'           => true,
                'customer_selectable' => true,
                'notes'               => 'Suitable for large and giant breed dogs.',
            ],
            [
                'room_code'           => 'DOG-FAM-01',
                'room_name'           => 'Family Suite',
                'room_type'           => 'dog_family',
                'allowed_species'     => json_encode(['dog']),
                'max_capacity'        => 3,
                'total_rooms'         => 1,
                'daily_rate'          => 800.00,
                'is_active'           => true,
                'customer_selectable' => true,
                'notes'               => 'Spacious suite for multiple dogs or large breeds.',
            ],
            // ── Cat Rooms ──────────────────────────────────────────────
            [
                'room_code'           => 'CAT-CDO-01',
                'room_name'           => 'Cat Condo A',
                'room_type'           => 'cat_condo',
                'allowed_species'     => json_encode(['cat']),
                'max_capacity'        => 2,
                'total_rooms'         => 3,
                'daily_rate'          => 300.00,
                'is_active'           => true,
                'customer_selectable' => true,
                'notes'               => 'Multi-level condo with climbing structures.',
            ],
            [
                'room_code'           => 'CAT-STE-01',
                'room_name'           => 'Cat Suite',
                'room_type'           => 'cat_suite',
                'allowed_species'     => json_encode(['cat']),
                'max_capacity'        => 3,
                'total_rooms'         => 2,
                'daily_rate'          => 450.00,
                'is_active'           => true,
                'customer_selectable' => true,
                'notes'               => 'Premium suite with window perch for cats.',
            ],
            // ── Small Pets ─────────────────────────────────────────────
            [
                'room_code'           => 'SML-PET-01',
                'room_name'           => 'Small Pet Enclosure',
                'room_type'           => 'small_pet',
                'allowed_species'     => json_encode(['bird', 'rabbit', 'hamster', 'other']),
                'max_capacity'        => 2,
                'total_rooms'         => 2,
                'daily_rate'          => 200.00,
                'is_active'           => true,
                'customer_selectable' => true,
                'notes'               => 'For birds and other small animals.',
            ],
        ];

        foreach ($rooms as $room) {
            $room['created_at'] = now();
            $room['updated_at'] = now();
            DB::table('boarding_rooms')->insert($room);
        }

        $this->command->info('Boarding rooms seeded: ' . count($rooms) . ' rooms created.');
    }
}
