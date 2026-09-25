import { apiRequest } from './client';
import { sanitizeCsvCell } from '../utils/csvSanitize';

/**
 * Medical Records API
 * Structured consultation data, diagnosis, treatment, prescription, vaccination history
 */

// Get all medical records with optional filters
export async function getMedicalRecords(filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.pet_id) params.append('pet_id', filters.pet_id);
  if (filters.veterinarian_id) params.append('veterinarian_id', filters.veterinarian_id);
  if (filters.status) params.append('status', filters.status);
  if (filters.from_date) params.append('from_date', filters.from_date);
  if (filters.to_date) params.append('to_date', filters.to_date);
  if (filters.search) params.append('search', filters.search);
  
  const queryString = params.toString();
  return apiRequest(`/veterinary/medical-records${queryString ? `?${queryString}` : ''}`);
}

// Get single medical record by ID
export async function getMedicalRecord(id) {
  return apiRequest(`/veterinary/medical-records/${id}`);
}

// Create new medical record
export async function createMedicalRecord(data) {
  return apiRequest('/veterinary/medical-records', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Update medical record
export async function updateMedicalRecord(id, data) {
  return apiRequest(`/veterinary/medical-records/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Delete medical record
export async function deleteMedicalRecord(id) {
  return apiRequest(`/veterinary/medical-records/${id}`, {
    method: 'DELETE',
  });
}

// Lock a medical record (prevent further editing)
export async function lockMedicalRecord(id) {
  return apiRequest(`/veterinary/medical-records/${id}/lock`, {
    method: 'POST',
  });
}

/**
 * Pet-specific medical data
 */

// Get all medical records for a specific pet
export async function getMedicalRecordsForPet(petId) {
  return apiRequest(`/veterinary/pets/${petId}/medical-records`);
}

// Get vaccination history for a specific pet
export async function getVaccinationsForPet(petId) {
  return apiRequest(`/veterinary/pets/${petId}/vaccinations`);
}

/**
 * Helper functions for common filter combinations
 */

// Get recent medical records (default: last 30 days)
export async function getRecentMedicalRecords(days = 30) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  
  return getMedicalRecords({
    from_date: fromDate.toISOString().split('T')[0],
  });
}

// Get medical records by status
export async function getMedicalRecordsByStatus(status) {
  return getMedicalRecords({ status });
}

// Search medical records
export async function searchMedicalRecords(searchTerm) {
  return getMedicalRecords({ search: searchTerm });
}

// Get draft records (for current veterinarian to finalize)
export async function getDraftMedicalRecords() {
  return getMedicalRecordsByStatus('draft');
}

// Get finalized records
export async function getFinalizedMedicalRecords() {
  return getMedicalRecordsByStatus('finalized');
}

/**
 * Prescription helpers
 */

// Get active prescriptions from a medical record
export function getActivePrescriptions(record) {
  if (!record?.prescriptions) return [];
  
  const today = new Date().toISOString().split('T')[0];
  
  return record.prescriptions.filter(p => {
    if (!p.is_active) return false;
    if (p.end_date && p.end_date < today) return false;
    return true;
  });
}

// Get formatted prescription instructions
export function formatPrescriptionInstructions(prescription) {
  const parts = [
    prescription.dosage && prescription.dosage_unit 
      ? `${prescription.dosage} ${prescription.dosage_unit}` 
      : prescription.dosage,
    prescription.frequency,
    prescription.route ? `via ${prescription.route}` : null,
    prescription.duration ? `for ${prescription.duration}` : null,
  ].filter(Boolean);
  
  return parts.join(', ');
}

/**
 * Vaccination helpers
 */

// Get upcoming vaccinations (within specified days)
export function getUpcomingVaccinations(vaccinations, days = 30) {
  if (!Array.isArray(vaccinations)) return [];
  
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return vaccinations.filter(v => {
    if (!v.next_due_date) return false;
    const dueDate = new Date(v.next_due_date);
    return dueDate >= today && dueDate <= futureDate;
  });
}

// Check if vaccination is overdue
export function isVaccinationOverdue(vaccination) {
  if (!vaccination?.next_due_date) return false;
  return new Date(vaccination.next_due_date) < new Date();
}

// Get days until vaccination is due
export function getDaysUntilDue(vaccination) {
  if (!vaccination?.next_due_date) return null;
  
  const today = new Date();
  const dueDate = new Date(vaccination.next_due_date);
  const diffTime = dueDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Export functions
 */

// Export medical record to printable format
export function exportMedicalRecordToJSON(record) {
  const dataStr = JSON.stringify(record, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `medical-record-${record.id}.json`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Generate CSV for medical records list
export function exportMedicalRecordsToCSV(records) {
  if (!Array.isArray(records) || records.length === 0) return;
  
  const headers = [
    'Record ID',
    'Pet Name',
    'Owner Name',
    'Visit Date',
    'Veterinarian',
    'Diagnosis',
    'Status',
    'Weight (kg)',
    'Temperature (°C)',
  ];
  
  const rows = records.map(r => [
    r.id,
    r.pet?.name || '',
    r.pet?.customer?.name || '',
    r.visit_date ? new Date(r.visit_date).toLocaleDateString() : '',
    r.veterinarian?.name || '',
    (r.diagnosis || '').replace(/,/g, ';'),
    r.status,
    r.weight_kg || '',
    r.temperature_celsius || '',
  ]);
  
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${sanitizeCsvCell(cell)}"`).join(','))
    .join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `medical-records-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}
