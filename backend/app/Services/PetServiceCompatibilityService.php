<?php

namespace App\Services;

use App\Models\Pet;

class PetServiceCompatibilityService
{
    /**
     * Service compatibility rules by species
     */
    private const SPECIES_SERVICE_RULES = [
        'Dog' => [
            'category' => 'standard',
            'petHotel' => ['allowed' => true, 'autoPricing' => true, 'staffApproval' => 'normal'],
            'veterinary' => ['allowed' => true, 'autoPricing' => true, 'staffApproval' => 'normal'],
            'grooming' => ['allowed' => true, 'autoPricing' => true, 'staffApproval' => 'normal'],
        ],
        'Cat' => [
            'category' => 'standard',
            'petHotel' => ['allowed' => true, 'autoPricing' => true, 'staffApproval' => 'normal'],
            'veterinary' => ['allowed' => true, 'autoPricing' => true, 'staffApproval' => 'normal'],
            'grooming' => ['allowed' => true, 'autoPricing' => true, 'staffApproval' => 'normal'],
        ],
        'Rabbit' => [
            'category' => 'small_animal',
            'petHotel' => ['allowed' => true, 'autoPricing' => false, 'staffApproval' => 'required'],
            'veterinary' => ['allowed' => true, 'autoPricing' => true, 'staffApproval' => 'normal'],
            'grooming' => ['allowed' => false, 'autoPricing' => false, 'staffApproval' => 'required'],
        ],
        'Bird' => [
            'category' => 'exotic',
            'petHotel' => ['allowed' => true, 'autoPricing' => false, 'staffApproval' => 'required'],
            'veterinary' => ['allowed' => true, 'autoPricing' => true, 'staffApproval' => 'normal'],
            'grooming' => ['allowed' => false, 'autoPricing' => false, 'staffApproval' => 'required'],
        ],
        'Hamster' => [
            'category' => 'small_animal',
            'petHotel' => ['allowed' => true, 'autoPricing' => false, 'staffApproval' => 'required'],
            'veterinary' => ['allowed' => true, 'autoPricing' => true, 'staffApproval' => 'normal'],
            'grooming' => ['allowed' => false, 'autoPricing' => false, 'staffApproval' => 'required'],
        ],
        'Fish' => [
            'category' => 'aquatic',
            'petHotel' => ['allowed' => false, 'autoPricing' => false, 'staffApproval' => 'required'],
            'veterinary' => ['allowed' => true, 'autoPricing' => false, 'staffApproval' => 'required'],
            'grooming' => ['allowed' => false, 'autoPricing' => false, 'staffApproval' => 'required'],
        ],
        'Reptile' => [
            'category' => 'reptile',
            'petHotel' => ['allowed' => false, 'autoPricing' => false, 'staffApproval' => 'required'],
            'veterinary' => ['allowed' => true, 'autoPricing' => false, 'staffApproval' => 'required'],
            'grooming' => ['allowed' => false, 'autoPricing' => false, 'staffApproval' => 'required'],
        ],
        'Other' => [
            'category' => 'custom',
            'petHotel' => ['allowed' => false, 'autoPricing' => false, 'staffApproval' => 'required'],
            'veterinary' => ['allowed' => true, 'autoPricing' => false, 'staffApproval' => 'required'],
            'grooming' => ['allowed' => false, 'autoPricing' => false, 'staffApproval' => 'required'],
        ],
    ];

    /**
     * Get service rules for a specific species
     */
    public static function getPetServiceRules(string $species): array
    {
        $speciesLower = strtolower(trim($species));
        
        // Handle variations and custom species
        foreach (self::SPECIES_SERVICE_RULES as $key => $rules) {
            if (strtolower($key) === $speciesLower) {
                return $rules;
            }
        }
        
        // Check for partial matches (e.g., "turtle" matches "Reptile")
        if (strpos($speciesLower, 'turtle') !== false || 
            strpos($speciesLower, 'gecko') !== false || 
            strpos($speciesLower, 'snake') !== false || 
            strpos($speciesLower, 'lizard') !== false || 
            strpos($speciesLower, 'iguana') !== false) {
            return self::SPECIES_SERVICE_RULES['Reptile'];
        }
        
        if (strpos($speciesLower, 'fish') !== false || 
            strpos($speciesLower, 'betta') !== false || 
            strpos($speciesLower, 'goldfish') !== false) {
            return self::SPECIES_SERVICE_RULES['Fish'];
        }
        
        if (strpos($speciesLower, 'bird') !== false || 
            strpos($speciesLower, 'parakeet') !== false || 
            strpos($speciesLower, 'cockatiel') !== false) {
            return self::SPECIES_SERVICE_RULES['Bird'];
        }
        
        if (strpos($speciesLower, 'rabbit') !== false || 
            strpos($speciesLower, 'bunny') !== false) {
            return self::SPECIES_SERVICE_RULES['Rabbit'];
        }
        
        if (strpos($speciesLower, 'hamster') !== false) {
            return self::SPECIES_SERVICE_RULES['Hamster'];
        }
        
        // Default to custom/other
        return self::SPECIES_SERVICE_RULES['Other'];
    }

    /**
     * Check if pet can book hotel service
     */
    public static function canBookHotel(string $species): bool
    {
        $rules = self::getPetServiceRules($species);
        return $rules['petHotel']['allowed'] ?? false;
    }

    /**
     * Check if pet can book veterinary service
     */
    public static function canBookVeterinary(string $species): bool
    {
        $rules = self::getPetServiceRules($species);
        return $rules['veterinary']['allowed'] ?? false;
    }

    /**
     * Check if pet can book grooming service
     */
    public static function canBookGrooming(string $species): bool
    {
        $rules = self::getPetServiceRules($species);
        return $rules['grooming']['allowed'] ?? false;
    }

    /**
     * Check if service requires staff approval
     */
    public static function requiresStaffApproval(string $species, string $serviceType): bool
    {
        $rules = self::getPetServiceRules($species);
        $serviceRules = $rules[$serviceType] ?? [];
        return ($serviceRules['staffApproval'] ?? 'normal') === 'required';
    }

    /**
     * Check if service requires manual quotation
     */
    public static function requiresManualQuotation(string $species, string $serviceType): bool
    {
        $rules = self::getPetServiceRules($species);
        $serviceRules = $rules[$serviceType] ?? [];
        return !($serviceRules['autoPricing'] ?? false);
    }

    /**
     * Get unavailable service message
     */
    public static function getUnavailableServiceMessage(string $species, string $serviceType): string
    {
        $rules = self::getPetServiceRules($species);
        $serviceRules = $rules[$serviceType] ?? [];
        
        $messages = [
            'petHotel' => [
                'Fish' => 'Standard pet hotel boarding is currently available for dogs and cats only. Fish require aquatic care and must be reviewed manually.',
                'Reptile' => 'Standard pet hotel boarding is currently available for dogs and cats only. Reptiles require special enclosure, temperature, and handling requirements.',
                'Other' => 'This pet requires staff review for hotel boarding. Please submit a special care request.',
                'default' => 'Pet hotel service is not available for this pet species.'
            ],
            'veterinary' => [
                'Fish' => 'This pet requires aquatic veterinary consultation. Availability may depend on veterinarian review.',
                'Reptile' => 'This pet requires reptile/exotic veterinary consultation. Availability may depend on veterinarian review.',
                'Other' => 'This pet requires staff review for veterinary consultation.',
                'default' => 'Veterinary service is not available for this pet species.'
            ],
            'grooming' => [
                'default' => 'Grooming service is not available for the selected pet species.'
            ]
        ];
        
        $category = $rules['category'] ?? 'custom';
        $serviceMessages = $messages[$serviceType] ?? [];
        
        return $serviceMessages[$category] ?? $serviceMessages['default'] ?? 'Service is not available for this pet species.';
    }

    /**
     * Get species category
     */
    public static function getSpeciesCategory(string $species): string
    {
        $rules = self::getPetServiceRules($species);
        return $rules['category'] ?? 'custom';
    }

    /**
     * Get consultation type for veterinary service
     */
    public static function getVeterinaryConsultationType(string $species): string
    {
        $rules = self::getPetServiceRules($species);
        $category = $rules['category'] ?? 'custom';
        
        $consultationTypes = [
            'standard' => 'standard',
            'small_animal' => 'small_animal',
            'exotic' => 'exotic',
            'aquatic' => 'aquatic',
            'reptile' => 'reptile',
            'custom' => 'custom'
        ];
        
        return $consultationTypes[$category] ?? 'custom';
    }

    /**
     * Map a services.category value to the compatibility service type
     * ('grooming' | 'petHotel' | 'veterinary').
     */
    public static function serviceTypeForCategory(?string $category): string
    {
        $normalized = strtolower(trim((string) $category));

        if ($normalized === 'grooming') {
            return 'grooming';
        }

        if (in_array($normalized, ['hotel', 'boarding', 'boarding care', 'daycare', 'pet hotel'], true)) {
            return 'petHotel';
        }

        return 'veterinary';
    }

    /**
     * Validate service compatibility for a pet
     */
    public static function validateServiceCompatibility(int $petId, string $serviceType): array
    {
        $pet = Pet::find($petId);
        
        if (!$pet) {
            return [
                'valid' => false,
                'message' => 'Pet not found.',
                'error_code' => 'pet_not_found'
            ];
        }
        
        $species = $pet->species ?? $pet->type ?? '';
        $rules = self::getPetServiceRules($species);
        $serviceRules = $rules[$serviceType] ?? [];
        
        if (!($serviceRules['allowed'] ?? false)) {
            return [
                'valid' => false,
                'message' => self::getUnavailableServiceMessage($species, $serviceType),
                'error_code' => 'service_not_allowed',
                'species' => $species,
                'service_type' => $serviceType,
                'requires_staff_approval' => ($serviceRules['staffApproval'] ?? 'normal') === 'required',
                'requires_manual_quotation' => !($serviceRules['autoPricing'] ?? false)
            ];
        }
        
        return [
            'valid' => true,
            'message' => 'Service is compatible with this pet species.',
            'species' => $species,
            'service_type' => $serviceType,
            'category' => $rules['category'] ?? 'custom',
            'requires_staff_approval' => ($serviceRules['staffApproval'] ?? 'normal') === 'required',
            'requires_manual_quotation' => !($serviceRules['autoPricing'] ?? false),
            'consultation_type' => $serviceType === 'veterinary' ? self::getVeterinaryConsultationType($species) : null
        ];
    }

    /**
     * Check if hotel booking requires special care
     */
    public static function getHotelSpecialCareRequirements(string $species): array
    {
        $rules = self::getPetServiceRules($species);
        $category = $rules['category'] ?? 'custom';
        
        $requirements = [
            'small_animal' => [
                'cageProvided' => true,
                'feedingSchedule' => true,
                'medicationNotes' => true,
                'handlingInstructions' => true
            ],
            'exotic' => [
                'cageProvided' => true,
                'feedingSchedule' => true,
                'medicationNotes' => true,
                'handlingInstructions' => true
            ],
            'aquatic' => [],
            'reptile' => [],
            'custom' => []
        ];
        
        return $requirements[$category] ?? [];
    }

    /**
     * Check if hotel booking is special request only
     */
    public static function isHotelSpecialRequestOnly(string $species): bool
    {
        $rules = self::getPetServiceRules($species);
        $category = $rules['category'] ?? 'custom';
        
        return in_array($category, ['aquatic', 'reptile', 'custom']);
    }
}
