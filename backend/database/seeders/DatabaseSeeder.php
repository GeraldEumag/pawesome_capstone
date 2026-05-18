<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            DemoUsersSeeder::class,
            InventorySeeder::class, // Comprehensive inventory data for testing
            DemoDataSeeder::class,
            ChatbotFaqSeeder::class,
            CashierTestDataSeeder::class, // Test data for cashier features
            VeterinaryServicesSeeder::class,
            BoardingRoomsSeederFixed::class, // Seed boarding rooms for hotel bookings
            PawesomeLiveDemoSeeder::class,
            AddOnsSeeder::class, // Seed add-ons with missing items
            AddOnInventoryMappingSeeder::class, // Map add-ons to inventory items
        ]);
    }
}
