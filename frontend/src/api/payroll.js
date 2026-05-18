import { apiRequest } from "./client";

export const payrollApi = {
  // Get all payroll records with filters
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/payroll?${queryString}`);
  },

  // Get payroll summary
  getSummary: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/payroll/summary?${queryString}`);
  },

  // Get single payroll record
  getById: (id) => apiRequest(`/payroll/${id}`),

  // Create payroll record
  create: (data) =>
    apiRequest("/payroll", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Update payroll record
  update: (id, data) =>
    apiRequest(`/payroll/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Delete payroll record
  delete: (id) =>
    apiRequest(`/payroll/${id}`, {
      method: "DELETE",
    }),

  // Generate payroll for period
  generateForPeriod: (data) =>
    apiRequest("/payroll/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Process payment
  processPayment: (id, data) =>
    apiRequest(`/payroll/${id}/process`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Approve payroll (changes status to pending)
  approve: (id) =>
    apiRequest(`/payroll/${id}/approve`, {
      method: "POST",
    }),

  // Mark payroll as paid
  markAsPaid: (id) =>
    apiRequest(`/payroll/${id}/release`, {
      method: "POST",
    }),

  // Get payslip
  getPayslip: (id) => apiRequest(`/payroll/${id}/payslip`),

  // Get my payroll (for employees)
  getMyPayroll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/my-payroll?${queryString}`);
  },
};
