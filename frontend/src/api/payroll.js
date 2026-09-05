import { apiRequest } from "./client";

export const payrollApi = {
  // Get all payroll records with filters
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/manager/payroll?${queryString}`);
  },

  // Get payroll summary
  getSummary: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/manager/reports/payroll?${queryString}`);
  },

  // Create payroll record
  create: (data) =>
    apiRequest("/manager/payroll", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Update an existing payroll record (draft or pending only)
  update: (id, data) =>
    apiRequest(`/manager/payroll/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Get payroll records for a specific period
  getByPeriod: (startDate, endDate) => {
    const params = new URLSearchParams({ period_start: startDate, period_end: endDate });
    return apiRequest(`/manager/payroll?${params}`);
  },

  // Generate payroll for period
  generateForPeriod: (data) =>
    apiRequest("/manager/payroll/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Approve payroll (changes status to pending)
  approve: (id) =>
    apiRequest(`/manager/payroll/${id}/approve`, {
      method: "POST",
    }),

  // Mark payroll as paid
  markAsPaid: (id) =>
    apiRequest(`/manager/payroll/${id}/release`, {
      method: "POST",
    }),

  // Get my payroll (for employees)
  getMyPayroll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/my-payroll?${queryString}`);
  },

  // Get my payslip (for employees)
  getMyPayslip: (id) => apiRequest(`/my-payroll/${id}/payslip`),

  // Get payslip (for manager/admin)
  getPayslip: (id) => apiRequest(`/manager/payroll/${id}/payslip`),
};
