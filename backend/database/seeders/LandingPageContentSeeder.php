<?php

namespace Database\Seeders;

use App\Models\LandingPageContent;
use Illuminate\Database\Seeder;

class LandingPageContentSeeder extends Seeder
{
    public function run(): void
    {
        $contents = [
            [
                'section_key' => 'hero',
                'content_type' => 'json',
                'content_data' => [
                    'eyebrow' => 'Premium Pet Care & Veterinary Services',
                    'headline' => 'Trusted pet care made simple.',
                    'description' => 'Pawesome Retreat Inc. provides veterinary services, pet hotel boarding, grooming, day care, supplies, and customer-friendly reservation support in one reliable pet care center.',
                    'primary_cta' => 'Book a Service',
                    'secondary_cta' => 'Login to Portal',
                    'image' => null,
                    'tags' => ['Veterinary Clinic', 'Pet Hotel', 'Grooming', 'Pet Supplies'],
                ],
            ],
            [
                'section_key' => 'featured_services',
                'content_type' => 'json',
                'content_data' => [
                    'eyebrow' => 'Our Services',
                    'headline' => 'Book the care your pet deserves',
                    'description' => 'Choose from our three core services and send a booking request in minutes.',
                    'services' => [
                        [
                            'key' => 'hotel',
                            'title' => 'Pet Hotel',
                            'description' => 'Safe, clean, and comfortable boarding facilities with 24/7 care for your pets while you are away.',
                            'cta' => 'Book Hotel',
                            'icon' => 'hotel',
                            'image' => null,
                        ],
                        [
                            'key' => 'grooming',
                            'title' => 'Grooming',
                            'description' => 'Professional grooming, hygiene, and spa care to keep your pet looking and feeling their best.',
                            'cta' => 'Book Grooming',
                            'icon' => 'grooming',
                            'image' => null,
                        ],
                        [
                            'key' => 'vet',
                            'title' => 'Veterinary Services',
                            'description' => 'Trusted veterinary consultations, vaccinations, diagnostics, and emergency care for every pet.',
                            'cta' => 'Book Vet Visit',
                            'icon' => 'vet',
                            'image' => null,
                        ],
                    ],
                ],
            ],
            [
                'section_key' => 'how_it_works',
                'content_type' => 'json',
                'content_data' => [
                    'eyebrow' => 'How It Works',
                    'headline' => 'Simple steps from booking to service',
                    'steps' => [
                        [
                            'number' => '01',
                            'title' => 'Create an Account',
                            'description' => 'Register as a customer and manage your pet information securely.',
                        ],
                        [
                            'number' => '02',
                            'title' => 'Choose a Service',
                            'description' => 'Select veterinary, grooming, boarding, day care, or home service.',
                        ],
                        [
                            'number' => '03',
                            'title' => 'Track Your Request',
                            'description' => 'Monitor booking status, approvals, schedules, and service updates.',
                        ],
                    ],
                ],
            ],
            [
                'section_key' => 'about',
                'content_type' => 'json',
                'content_data' => [
                    'eyebrow' => 'About Pawesome Retreat',
                    'headline' => 'A care center built around pets and their owners.',
                    'description' => 'Pawesome Retreat Inc. is a pet care facility offering Pet Hotel, Grooming, Supplies, and Veterinary Clinic services. The center supports pet owners through laboratory services, vaccination, consultation, boarding, day care, grooming, supplies, accessories, and home veterinary service.',
                    'points' => [
                        [
                            'title' => 'Professional Care',
                            'description' => 'Handled by trained staff and service teams.',
                        ],
                        [
                            'title' => 'Clean Facilities',
                            'description' => 'Designed for comfort, safety, and organized pet handling.',
                        ],
                        [
                            'title' => 'Digital Workflow',
                            'description' => 'Supports reservations, tracking, and service records.',
                        ],
                    ],
                    'image' => null,
                ],
            ],
            [
                'section_key' => 'final_cta',
                'content_type' => 'json',
                'content_data' => [
                    'eyebrow' => 'Customer Portal',
                    'headline' => 'Ready to book your pet\'s care?',
                    'description' => 'Create an account to manage your pets, book services, and track requests all in one place.',
                    'primary_cta' => 'Get Started',
                    'secondary_cta' => 'Contact Us',
                ],
            ],
            [
                'section_key' => 'trust_stats',
                'content_type' => 'json',
                'content_data' => [
                    'stats' => [
                        [
                            'value' => '9+',
                            'label' => 'Core Services',
                        ],
                        [
                            'value' => '24/7',
                            'label' => 'Care Support',
                        ],
                        [
                            'value' => '100%',
                            'label' => 'Pet-Focused Care',
                        ],
                    ],
                ],
            ],
            [
                'section_key' => 'facilities_gallery',
                'content_type' => 'json',
                'content_data' => [
                    'eyebrow' => 'Our Facilities',
                    'headline' => 'See Inside Pawesome Retreat',
                    'description' => 'Take a look at our clean, comfortable, and well-equipped facilities designed for every pet.',
                    'items' => [
                        ['caption' => 'Location',            'image' => null],
                        ['caption' => 'Facility 1',          'image' => null],
                        ['caption' => 'Facility 2',          'image' => null],
                        ['caption' => 'Facility 3',          'image' => null],
                        ['caption' => 'Play Ground',         'image' => null],
                        ['caption' => 'Reception Area',      'image' => null],
                        ['caption' => 'Veterinary Clinic',   'image' => null],
                        ['caption' => 'Veterinary Clinic 2', 'image' => null],
                    ],
                ],
            ],
            [
                'section_key' => 'footer',
                'content_type' => 'json',
                'content_data' => [
                    'brand_name'  => 'Pawesome Retreat Inc.',
                    'tagline'     => 'Pet Hotel, Grooming, Supplies and Vet Clinic',
                    'description' => 'A modern pet care center providing trusted services for pets and convenient support for owners.',
                    'email'       => 'pawesomeretreat24@gmail.com',
                    'address'     => 'Aldana Street San Isidro Village, Las Piñas, Philippines, 1740',
                ],
            ],
            [
                'section_key' => 'auth_pages',
                'content_type' => 'json',
                'content_data' => [
                    'login_bg_image'    => null,
                    'register_bg_image' => null,
                ],
            ],
        ];

        foreach ($contents as $content) {
            LandingPageContent::updateOrCreate(
                ['section_key' => $content['section_key']],
                $content
            );
        }
    }
}
