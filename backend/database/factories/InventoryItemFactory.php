<?php

namespace Database\Factories;

use App\Models\InventoryItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InventoryItem>
 */
class InventoryItemFactory extends Factory
{
    protected $model = InventoryItem::class;

    public function definition(): array
    {
        return [
            'sku' => strtoupper($this->faker->bothify('???-####')),
            'name' => $this->faker->words(3, true),
            'category' => $this->faker->randomElement(['Food', 'Accessories', 'Grooming', 'Toys', 'Health', 'Services']),
            'stock' => $this->faker->numberBetween(0, 100),
            'reorder_level' => $this->faker->numberBetween(5, 20),
            'price' => $this->faker->randomFloat(2, 10, 500),
            'status' => $this->faker->randomElement(['active', 'inactive', 'archived']),
            'expiry_date' => $this->faker->optional()->dateTimeBetween('+1 month', '+1 year'),
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
