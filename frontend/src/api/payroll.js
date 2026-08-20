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
