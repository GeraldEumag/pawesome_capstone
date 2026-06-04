/**
 * Pet Species and Breed Configuration
 * Centralized configuration for all pet species and their breeds
 * Used across customer pet registration and service compatibility checks
 */

// Predetermined species options — restricted to dog and cat for this platform
export const SPECIES_OPTIONS = [
  "Dog",
  "Cat"
];

// Predetermined breeds per species
export const SPECIES_BREED_DATA = {
  "Dog": [
    "Aspin",
    "Shih Tzu",
    "Chihuahua",
    "Pomeranian",
    "Golden Retriever",
    "Labrador Retriever",
    "Siberian Husky",
    "Beagle",
    "Pug",
    "Mixed Breed",
    "Other / Not listed"
  ],
  "Cat": [
    "Puspin",
    "Persian",
    "Siamese",
    "Bengal",
    "British Shorthair",
    "Maine Coon",
    "Ragdoll",
    "Mixed Breed",
    "Other / Not listed"
  ]
};

/**
 * Get all species options
 * @returns {string[]} Array of species options
 */
export const getSpeciesOptions = () => {
  return SPECIES_OPTIONS;
};

/**
 * Get breed options for a specific species
 * @param {string} species - The species to get breeds for
 * @returns {string[]} Array of breed options for the species
 */
export const getBreedOptions = (species) => {
  return SPECIES_BREED_DATA[species] || [];
};

/**
 * Check if manual species input is required
 * @param {string} species - Selected species
 * @returns {boolean} True if manual input is required
 */
export const isManualSpeciesRequired = (species) => {
  return species === "Other";
};

/**
 * Check if manual breed input is required
 * @param {string} breed - Selected breed
 * @returns {boolean} True if manual input is required
 */
export const isManualBreedRequired = (breed) => {
  return breed === "Mixed Breed" || breed === "Other / Not listed";
};

/**
 * Resolve the final species value to save
 * @param {string} selectedSpecies - Selected species from dropdown
 * @param {string} manualSpecies - Manual species input
 * @returns {string} Final species value to save
 */
export const resolveFinalSpecies = (selectedSpecies, manualSpecies) => {
  if (selectedSpecies === "Other" && manualSpecies?.trim()) {
    return manualSpecies.trim();
  }
  return selectedSpecies;
};

/**
 * Resolve the final breed value to save
 * @param {string} selectedBreed - Selected breed from dropdown
 * @param {string} manualBreed - Manual breed input
 * @returns {string} Final breed value to save
 */
export const resolveFinalBreed = (selectedBreed, manualBreed) => {
  if ((selectedBreed === "Mixed Breed" || selectedBreed === "Other / Not listed") && manualBreed?.trim()) {
    return manualBreed.trim();
  }
  return selectedBreed;
};

/**
 * Check if a species exists in the predetermined options
 * @param {string} species - Species to check
 * @returns {boolean} True if species is predetermined
 */
export const isPredeterminedSpecies = (species) => {
  return SPECIES_OPTIONS.includes(species);
};

/**
 * Check if a breed exists in the predetermined options for a species
 * @param {string} species - Species to check
 * @param {string} breed - Breed to check
 * @returns {boolean} True if breed is predetermined
 */
export const isPredeterminedBreed = (species, breed) => {
  return SPECIES_BREED_DATA[species]?.includes(breed) || false;
};

/**
 * Get species category for service compatibility
 * @param {string} species - Species to categorize
 * @returns {string} Category of the species
 */
export const getSpeciesCategory = (species) => {
  const speciesLower = String(species || "").toLowerCase();
  
  if (speciesLower.includes("dog") || speciesLower.includes("cat")) {
    return "standard";
  } else if (speciesLower.includes("rabbit") || speciesLower.includes("hamster")) {
    return "small_animal";
  } else if (speciesLower.includes("bird")) {
    return "exotic";
  } else if (speciesLower.includes("fish")) {
    return "aquatic";
  } else if (speciesLower.includes("reptile") || speciesLower.includes("turtle") || 
             speciesLower.includes("gecko") || speciesLower.includes("snake") || 
             speciesLower.includes("lizard") || speciesLower.includes("iguana")) {
    return "reptile";
  } else {
    return "custom";
  }
};

/**
 * Validate species and breed combination
 * @param {string} species - Selected species
 * @param {string} breed - Selected breed
 * @param {string} manualSpecies - Manual species input
 * @param {string} manualBreed - Manual breed input
 * @returns {string[]} Array of validation error messages
 */
export const validateSpeciesBreed = (species, breed, manualSpecies, manualBreed) => {
  const errors = [];
  
  if (!species) {
    errors.push("Please select pet species.");
  }
  
  if (isManualSpeciesRequired(species) && !manualSpecies?.trim()) {
    errors.push("Please specify the species when 'Other' is selected.");
  }
  
  if (!breed) {
    errors.push("Please select pet breed.");
  }
  
  if (isManualBreedRequired(breed) && !manualBreed?.trim()) {
    errors.push("Please specify the breed when 'Mixed Breed' or 'Other / Not listed' is selected.");
  }
  
  return errors;
};

export default {
  SPECIES_OPTIONS,
  SPECIES_BREED_DATA,
  getSpeciesOptions,
  getBreedOptions,
  isManualSpeciesRequired,
  isManualBreedRequired,
  resolveFinalSpecies,
  resolveFinalBreed,
  isPredeterminedSpecies,
  isPredeterminedBreed,
  getSpeciesCategory,
  validateSpeciesBreed
};
