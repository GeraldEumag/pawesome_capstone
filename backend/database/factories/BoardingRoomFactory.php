<?php

namespace Database\Factories;

use App\Models\BoardingRoom;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BoardingRoom>
 */
class BoardingRoomFactory extends Factory
{
    protected $model = BoardingRoom::class;

    public function definition(): array
    {
        return [
            'room_code' => 'ROOM-' . $this->faker->unique()->numerify('####'),
            'room_name' => $this->faker->words(2, true),
            'room_type' => 'dog_standard',
            'hotel_category' => 'dog_hotel',
            'allowed_species' => ['dog'],
            'max_capacity' => 1,
            'total_rooms' => 1,
            'daily_rate' => $this->faker->randomFloat(2, 500, 1500),
            'is_active' => true,
            'customer_selectable' => true,
        ];
    }
}
