<?php

namespace Database\Seeders;

use App\Models\Service;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class PawesomeLiveDemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->ensureUsers();
        $this->ensureRealisticServiceCatalog();

        $this->command?->info('Pawesome live demo data seeded successfully.');
    }

    private function ensureUsers(): array
    {
        $accounts = [
            'admin' => ['name' => 'Administrator', 'role' => 'admin', 'department' => 'Administration', 'position' => 'System Administrator'],
            'manager' => ['name' => 'Manager', 'role' => 'manager', 'department' => 'Operations', 'position' => 'Operations Manager'],
            'receptionist' => ['name' => 'Receptionist', 'role' => 'receptionist', 'department' => 'Front Desk', 'position' => 'Receptionist'],
            'cashier' => ['name' => 'Cashier', 'role' => 'cashier', 'department' => 'Finance', 'position' => 'Cashier'],
            'inventory' => ['name' => 'Inventory Manager', 'role' => 'inventory', 'department' => 'Inventory', 'position' => 'Inventory Manager'],
            'vet' => ['name' => 'Veterinarian', 'role' => 'veterinary', 'department' => 'Veterinary', 'position' => 'Veterinarian'],
            'customer' => ['name' => 'Customer', 'role' => 'customer', 'department' => null, 'position' => null],
        ];

        $users = [];
        foreach ($accounts as $username => $data) {
            $users[$username] = User::updateOrCreate(
                ['username' => $username],
                [
                    'name' => $data['name'],
                    'first_name' => $data['name'],
                    'last_name' => '',
                    'email' => $username . '@example.com',
                    'password' => Hash::make('Password123!'),
                    'role' => $data['role'],
                    'department' => $data['department'],
                    'position' => $data['position'],
                    'base_salary' => $data['role'] === 'customer' ? null : 32000,
                    'hourly_rate' => $data['role'] === 'customer' ? null : 180,
                    'employment_status' => 'active',
                    'is_active' => true,
                ]
            );
        }

        return $users;
    }

    private function ensureRealisticServiceCatalog(): void
    {
        $services = [
            ['General Check-up', 'Consultation', 500, 30, 'Routine veterinary check-up and wellness exam.'],
            ['Consultation', 'Consultation', 450, 30, 'General veterinary consultation.'],
            ['Vaccination', 'Vaccination', 800, 20, 'Core vaccination service.'],
            ['Deworming', 'Treatment', 350, 15, 'Routine deworming treatment.'],
            ['Anti-Rabies Vaccine', 'Vaccination', 700, 20, 'Anti-rabies vaccination.'],
            ['Skin Consultation', 'Consultation', 600, 30, 'Skin, coat, and allergy consultation.'],
            ['Ear Cleaning Treatment', 'Treatment', 300, 20, 'Ear cleaning and basic treatment.'],
            ['Wound Cleaning', 'Treatment', 500, 30, 'Minor wound cleaning and dressing.'],
            ['Minor Treatment', 'Treatment', 750, 45, 'Minor outpatient veterinary treatment.'],
            ['Emergency Consultation', 'Emergency', 1200, 45, 'Urgent veterinary consultation.'],
            ['Basic Bath and Blow Dry Small Breed', 'Grooming', 350, 60, 'Bath and blow dry for small breeds.'],
            ['Basic Bath and Blow Dry Medium Breed', 'Grooming', 500, 75, 'Bath and blow dry for medium breeds.'],
            ['Full Grooming Small Breed', 'Grooming', 700, 120, 'Full grooming for small breeds.'],
            ['Full Grooming Medium Breed', 'Grooming', 950, 150, 'Full grooming for medium breeds.'],
            ['Nail Trimming', 'Grooming', 150, 15, 'Nail trimming service.'],
            ['Ear Cleaning', 'Grooming', 150, 15, 'Routine grooming ear cleaning.'],
            ['Fur Trimming', 'Grooming', 300, 30, 'Basic fur trimming.'],
            ['Medicated Bath', 'Grooming', 650, 75, 'Medicated bath for skin concerns.'],
            ['Tick and Flea Bath', 'Grooming', 600, 75, 'Tick and flea bath treatment.'],
            ['Dog Boarding Small Breed Per Night', 'Hotel', 500, 1440, 'Overnight boarding for small dogs.'],
            ['Dog Boarding Medium Breed Per Night', 'Hotel', 700, 1440, 'Overnight boarding for medium dogs.'],
            ['Cat Boarding Per Night', 'Hotel', 450, 1440, 'Overnight cat boarding.'],
            ['Day Care Half Day', 'Hotel', 300, 240, 'Half-day pet day care.'],
            ['Day Care Full Day', 'Hotel', 550, 480, 'Full-day pet day care.'],
            ['Premium Boarding with Walk', 'Hotel', 900, 1440, 'Premium boarding with supervised walk.'],
            ['Medical Confinement Per Day', 'Boarding Care', 1200, 1440, 'Medical confinement care per day.'],
            ['IV Fluid Monitoring', 'Treatment', 700, 120, 'IV fluid monitoring service.'],
            ['Post-Surgery Monitoring', 'Boarding Care', 1500, 1440, 'Post-surgery monitoring and care.'],
            ['Isolation Room Care', 'Boarding Care', 1800, 1440, 'Isolation room care for medical cases.'],
        ];

        foreach ($services as [$name, $category, $price, $duration, $description]) {
            Service::updateOrCreate(
                ['name' => $name],
                [
                    'category' => $category,
                    'price' => $price,
                    'duration' => $duration,
                    'duration_minutes' => $duration,
                    'description' => $description,
                    'is_active' => true,
                ]
            );
        }
    }
}
