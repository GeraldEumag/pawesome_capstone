/**
 * Service Duration Configuration
 * Defines default durations and buffer times for all service types
 */

export const SERVICE_DURATIONS = {
  // Veterinary Services (in minutes)
  veterinary: {
    'General Check-up': 30,
    'Vaccination': 20,
    'Deworming': 20,
    'Follow-up Check-up': 30,
    'Consultation with Treatment': 60,
    'Emergency': 90, // Staff/manual scheduling only
    'Surgery': 120, // Staff/manual scheduling only
    'Dental Care': 45,
    'Laboratory Test': 30,
    'General Consultation': 30,
    'Checkup': 30,
  },
  
  // Grooming Services (in minutes)
  grooming: {
    'Nail Trim': 30,
    'Basic Bath': 60,
    'Basic Grooming': 60,
    'Full Grooming': 90,
    'Full Grooming Package': 90,
    'Haircut Only': 45,
    'Teeth Cleaning': 30,
    'Medicated Grooming': 120,
    'Flea Treatment': 60,
    'De-matting / Special Coat Care': 120,
  },
  
  // Boarding Services (handled as date ranges, not hourly)
  boarding: {
    // Default check-in/check-out times
    default_check_in_time: '14:00', // 2:00 PM
    default_check_out_time: '12:00', // 12:00 PM
    cleaning_buffer_minutes: 60, // Room cleaning between stays
  }
};

export const BUFFER_TIMES = {
  veterinary: 10, // minutes between appointments
  grooming: 15, // minutes between appointments
  boarding: 60, // minutes for room cleaning
};

export const TIME_SLOT_INTERVAL = 30; // minutes

export const BUSINESS_HOURS = {
  start: '10:00', // 10:00 AM
  end: '18:00',   // 6:00 PM
};

/**
 * Get service duration in minutes
 * @param {string} serviceType - veterinary, grooming, boarding
 * @param {string} serviceName - Name of the specific service
 * @returns {number} Duration in minutes
 */
export function getServiceDuration(serviceType, serviceName) {
  if (!SERVICE_DURATIONS[serviceType]) {
    console.warn(`Unknown service type: ${serviceType}`);
    return 30; // Default fallback
  }
  
  const duration = SERVICE_DURATIONS[serviceType][serviceName];
  if (duration === undefined) {
    console.warn(`Unknown service name: ${serviceName} for type: ${serviceType}`);
    return serviceType === 'grooming' ? 60 : 30; // Service type fallback
  }
  
  return duration;
}

/**
 * Get total time including buffer (duration + buffer)
 * @param {string} serviceType - veterinary, grooming, boarding
 * @param {string} serviceName - Name of the specific service
 * @returns {number} Total time in minutes including buffer
 */
export function getTotalTimeWithBuffer(serviceType, serviceName) {
  const duration = getServiceDuration(serviceType, serviceName);
  const buffer = BUFFER_TIMES[serviceType] || 0;
  return duration + buffer;
}

/**
 * Get buffer time for service type
 * @param {string} serviceType - veterinary, grooming, boarding
 * @returns {number} Buffer time in minutes
 */
export function getBufferTime(serviceType) {
  return BUFFER_TIMES[serviceType] || 0;
}

/**
 * Check if service requires manual scheduling (not customer bookable)
 * @param {string} serviceType - veterinary, grooming, boarding
 * @param {string} serviceName - Name of the specific service
 * @returns {boolean} True if requires staff scheduling
 */
export function requiresManualScheduling(serviceType, serviceName) {
  const duration = getServiceDuration(serviceType, serviceName);
  return duration >= 90; // Services 90+ minutes require manual scheduling
}

/**
 * Generate time slots for a given date
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} serviceType - veterinary, grooming
 * @param {string} serviceName - Name of the specific service
 * @param {Array} existingBookings - Array of existing bookings with start/end times
 * @returns {Array} Available time slots
 */
export function generateTimeSlots(date, serviceType, serviceName, existingBookings = []) {
  const duration = getServiceDuration(serviceType, serviceName);
  const buffer = getBufferTime(serviceType);
  const totalTime = duration + buffer;
  
  const slots = [];
  const [startHour] = BUSINESS_HOURS.start.split(':').map(Number);
  const [endHour, endMinute] = BUSINESS_HOURS.end.split(':').map(Number);
  
  // Generate all possible slots
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += TIME_SLOT_INTERVAL) {
      if (minute >= 60) break;
      
      const slotTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const slotLabel = new Date(`2000-01-01T${slotTime}`).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      // Calculate slot end time
      const slotStart = new Date(`${date}T${slotTime}`);
      const slotEnd = new Date(slotStart.getTime() + totalTime * 60000);
      
      // Check if slot fits within business hours
      if (slotEnd.getHours() > endHour || (slotEnd.getHours() === endHour && slotEnd.getMinutes() > endMinute)) {
        continue; // Slot would extend beyond business hours
      }
      
      // Check for overlaps with existing bookings
      const isAvailable = !existingBookings.some(booking => {
        const bookingStart = new Date(booking.start_datetime);
        const bookingEnd = new Date(booking.end_datetime);
        
        // Overlap condition: newStart < existingEnd AND newEnd > existingStart
        return slotStart < bookingEnd && slotEnd > bookingStart;
      });
      
      slots.push({
        start_time: slotTime,
        end_time: slotEnd.toTimeString().slice(0, 5),
        label: `${slotLabel} - ${formatTime(slotEnd.toTimeString().slice(0, 5))}`,
        duration_minutes: duration,
        buffer_minutes: buffer,
        total_minutes: totalTime,
        available: isAvailable,
        start_datetime: slotStart.toISOString(),
        end_datetime: slotEnd.toISOString()
      });
    }
  }
  
  return slots;
}

/**
 * Format time string to readable format
 * @param {string} timeString - HH:MM format
 * @returns {string} Formatted time (e.g., "9:00 AM")
 */
function formatTime(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Calculate end datetime from start datetime and service duration
 * @param {string} startDatetime - ISO datetime string
 * @param {string} serviceType - veterinary, grooming
 * @param {string} serviceName - Name of the specific service
 * @returns {string} ISO datetime string for end time
 */
export function calculateEndDatetime(startDatetime, serviceType, serviceName) {
  const duration = getServiceDuration(serviceType, serviceName);
  const buffer = getBufferTime(serviceType);
  const totalTime = duration + buffer;
  
  const endDatetime = new Date(startDatetime);
  endDatetime.setMinutes(endDatetime.getMinutes() + totalTime);
  
  return endDatetime.toISOString();
}

/**
 * Validate if a time slot is valid for booking
 * @param {string} startTime - HH:MM format
 * @param {string} serviceType - veterinary, grooming
 * @param {string} serviceName - Name of the specific service
 * @returns {boolean} True if valid time slot
 */
export function isValidTimeSlot(startTime, serviceType, serviceName) {
  // Check if it's a valid 30-minute interval
  const [, minutes] = startTime.split(':').map(Number);
  if (minutes % TIME_SLOT_INTERVAL !== 0) {
    return false;
  }
  
  // Check if within business hours
  const duration = getServiceDuration(serviceType, serviceName);
  const buffer = getBufferTime(serviceType);
  const totalTime = duration + buffer;
  
  const slotStart = new Date(`2000-01-01T${startTime}`);
  const slotEnd = new Date(slotStart.getTime() + totalTime * 60000);
  
  const [endHour, endMinute] = BUSINESS_HOURS.end.split(':').map(Number);
  
  return slotEnd.getHours() < endHour || (slotEnd.getHours() === endHour && slotEnd.getMinutes() <= endMinute);
}

const serviceDurationRules = {
  SERVICE_DURATIONS,
  BUFFER_TIMES,
  TIME_SLOT_INTERVAL,
  BUSINESS_HOURS,
  getServiceDuration,
  getTotalTimeWithBuffer,
  getBufferTime,
  requiresManualScheduling,
  generateTimeSlots,
  calculateEndDatetime,
  isValidTimeSlot
};

export default serviceDurationRules;
