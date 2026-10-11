import { apiRequest } from "./client";

export const attendanceApi = {
  // Get all attendance records with filters
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/attendance?${queryString}`);
  },

  // Get today's attendance
  getToday: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/attendance/today?${queryString}`);
  },

  // Get attendance statistics
  getStatistics: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/attendance/statistics?${queryString}`);
  },

  // Get single attendance record
  getById: (id) => apiRequest(`/attendance/${id}`),

  // Create attendance record
  create: (data) =>
    apiRequest("/attendance", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Update attendance record
  update: (id, data) =>
    apiRequest(`/attendance/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Delete attendance record
  delete: (id) =>
    apiRequest(`/attendance/${id}`, {
      method: "DELETE",
    }),

  // Check in
  checkIn: (location) =>
    apiRequest("/attendance/check-in", {
      method: "POST",
      body: JSON.stringify({ location }),
    }),

  // Check out
  checkOut: () =>
    apiRequest("/attendance/check-out", {
      method: "POST",
    }),

  // Export attendance
  export: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/attendance/export?${queryString}`);
  },
};
