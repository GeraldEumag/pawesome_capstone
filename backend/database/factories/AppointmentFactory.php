<?php

namespace Database\Factories;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Pet;
use App\Models\Service;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Appointment>
 */
class AppointmentFactory extends Factory
{
    protected $model = Appointment::class;

    public function definition(): array
    {
        return [
            'customer_id' => Customer::factory(),
            'pet_id' => Pet::factory(),
            'service_id' => Service::factory(),
            'status' => $this->faker->randomElement(['requested', 'scheduled', 'completed', 'cancelled']),
            'scheduled_at' => $this->faker->dateTimeBetween('now', '+30 days'),
            'price' => $this->faker->randomFloat(2, 50, 500),
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
