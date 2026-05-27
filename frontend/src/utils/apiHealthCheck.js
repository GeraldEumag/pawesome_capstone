/**
 * API Health Check Utility
 * Tests backend connectivity and required endpoints for reporting system
 */

import { apiRequest, API_URL } from "../api/client";

const HEALTH_CHECK_ENDPOINTS = [
  { path: "/health", name: "Health Check", required: true },
  { path: "/api/auth/me", name: "Auth Endpoint", required: true },
  { path: "/admin/reports/executive", name: "Executive Dashboard API", required: false },
  { path: "/admin/reports/predictive", name: "Predictive Analytics API", required: false },
  { path: "/admin/reports/customers/segments", name: "Customer Segmentation API", required: false },
  { path: "/admin/reports/comparison", name: "Comparative Reporting API", required: false },
  { path: "/admin/reports/alerts", name: "Automated Alerts API", required: false },
  { path: "/admin/reports/sales-analysis", name: "Sales Analysis API", required: false },
  { path: "/admin/reports/inventory-opt", name: "Inventory Optimization API", required: false },
  { path: "/admin/reports/staff-performance", name: "Staff Performance API", required: false },
];

/**
 * Check if backend is reachable
 */
export const checkBackendConnection = async () => {
  try {
    const startTime = performance.now();
    const response = await fetch(`${API_URL}/health`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    const endTime = performance.now();
    
    return {
      status: response.ok ? "connected" : "error",
      latency: Math.round(endTime - startTime),
      statusCode: response.status,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "disconnected",
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Test specific API endpoint
 */
export const testEndpoint = async (endpoint) => {
  try {
    const startTime = performance.now();
    const response = await apiRequest(endpoint, { method: "GET" });
    const endTime = performance.now();
    
    return {
      endpoint,
      status: "success",
      latency: Math.round(endTime - startTime),
      data: response,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      endpoint,
      status: "error",
      error: error.message,
      code: error.status || "UNKNOWN",
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Run comprehensive health check on all reporting endpoints
 */
export const runFullHealthCheck = async () => {
  const results = {
    timestamp: new Date().toISOString(),
    apiUrl: API_URL,
    summary: {
      total: HEALTH_CHECK_ENDPOINTS.length,
      connected: 0,
      failed: 0,
      missing: 0,
    },
    endpoints: [],
  };
  
  // Check base connection first
  const connectionCheck = await checkBackendConnection();
  results.connection = connectionCheck;
  
  if (connectionCheck.status !== "connected") {
    results.status = "disconnected";
    results.message = "Cannot connect to backend. Please check your API configuration.";
    return results;
  }
  
  results.status = "connected";
  
  // Test each endpoint
  for (const endpoint of HEALTH_CHECK_ENDPOINTS) {
    const result = await testEndpoint(endpoint.path);
    
    const endpointResult = {
      name: endpoint.name,
      path: endpoint.path,
      required: endpoint.required,
      status: result.status === "success" ? "available" : "unavailable",
      latency: result.latency,
      error: result.error || null,
    };
    
    results.endpoints.push(endpointResult);
    
    if (result.status === "success") {
      results.summary.connected++;
    } else if (endpoint.required) {
      results.summary.failed++;
    } else {
      results.summary.missing++;
    }
  }
  
  // Determine overall status
  if (results.summary.failed > 0) {
    results.overallStatus = "critical";
    results.message = `${results.summary.failed} required endpoints are unavailable.`;
  } else if (results.summary.missing > 0) {
    results.overallStatus = "warning";
    results.message = `${results.summary.missing} optional endpoints not yet implemented.`;
  } else {
    results.overallStatus = "healthy";
    results.message = "All endpoints are operational.";
  }
  
  return results;
};

/**
 * Check if specific Phase 2/3/4 APIs are implemented
 */
export const checkAdvancedAPIs = async () => {
  const advancedEndpoints = [
    "/admin/reports/executive",
    "/admin/reports/predictive",
    "/admin/reports/customers/segments",
    "/admin/reports/comparison",
    "/admin/reports/alerts",
    "/admin/reports/sales-analysis",
    "/admin/reports/inventory-opt",
    "/admin/reports/staff-performance",
  ];
  
  const results = {
    implemented: [],
    missing: [],
  };
  
  for (const endpoint of advancedEndpoints) {
    const result = await testEndpoint(endpoint);
    if (result.status === "success") {
      results.implemented.push(endpoint);
    } else {
      results.missing.push({ endpoint, error: result.error });
    }
  }
  
  return results;
};

/**
 * Simple ping test
 */
export const pingBackend = async () => {
  try {
    const start = performance.now();
    await fetch(API_URL, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    const latency = Math.round(performance.now() - start);
    return { alive: true, latency };
  } catch {
    return { alive: false, latency: null };
  }
};

/**
 * Get API status badge color
 */
export const getStatusColor = (status) => {
  const colors = {
    healthy: "#10b981",
    connected: "#10b981",
    available: "#10b981",
    warning: "#f59e0b",
    critical: "#ef4444",
    disconnected: "#ef4444",
    error: "#ef4444",
    unavailable: "#94a3b8",
  };
  return colors[status] || "#94a3b8";
};

/**
 * Format health check for display
 */
export const formatHealthCheckResults = (results) => {
  if (!results) return "No results available";
  
  const lines = [
    `🔍 API Health Check Results`,
    `📍 API URL: ${results.apiUrl}`,
    `⏱️  Checked: ${new Date(results.timestamp).toLocaleString()}`,
    ``,
    `📊 Connection Status: ${results.connection?.status || "unknown"}`,
    `📈 Latency: ${results.connection?.latency}ms`,
    ``,
    `🔧 Endpoints:`,
  ];
  
  for (const ep of results.endpoints || []) {
    const icon = ep.status === "available" ? "✅" : ep.required ? "❌" : "⚠️";
    lines.push(`  ${icon} ${ep.name} (${ep.path}) - ${ep.latency}ms`);
  }
  
  lines.push("");
  lines.push(`📋 Summary: ${results.message}`);
  lines.push(`   Connected: ${results.summary?.connected}/${results.summary?.total}`);
  
  return lines.join("\n");
};

// Auto-run health check on module load in development
if (process.env.NODE_ENV === "development") {
  console.log("🔍 API Health Check Module Loaded");
  console.log(`   API URL: ${API_URL}`);
}

export default {
  checkBackendConnection,
  testEndpoint,
  runFullHealthCheck,
  checkAdvancedAPIs,
  pingBackend,
  getStatusColor,
  formatHealthCheckResults,
  HEALTH_CHECK_ENDPOINTS,
};
