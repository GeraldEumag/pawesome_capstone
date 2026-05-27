import React, { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faServer,
  faCheckCircle,
  faExclamationTriangle,
  faTimesCircle,
  faSync,
  faClock,
  faNetworkWired,
} from "@fortawesome/free-solid-svg-icons";
import {
  checkBackendConnection,
  runFullHealthCheck,
  checkAdvancedAPIs,
  pingBackend,
  getStatusColor,
} from "../../utils/apiHealthCheck";
import { API_URL } from "../../api/client";
import "./ApiHealthCheck.css";

/**
 * API Health Check Component
 * Visual interface for testing backend connectivity
 */

const StatusBadge = ({ status, latency }) => {
  const color = getStatusColor(status);
  const icons = {
    healthy: faCheckCircle,
    connected: faCheckCircle,
    available: faCheckCircle,
    warning: faExclamationTriangle,
    critical: faTimesCircle,
    disconnected: faTimesCircle,
    error: faTimesCircle,
    unavailable: faClock,
  };
  
  return (
    <span className={`status-badge ${status}`} style={{ backgroundColor: `${color}20`, color }}>
      <FontAwesomeIcon icon={icons[status] || faNetworkWired} />
      {status}
      {latency && <small>({latency}ms)</small>}
    </span>
  );
};

const EndpointRow = ({ endpoint }) => (
  <tr className={`endpoint-row ${endpoint.status}`}>
    <td>
      <StatusBadge status={endpoint.status} latency={endpoint.latency} />
    </td>
    <td>
      <strong>{endpoint.name}</strong>
      {endpoint.required && <span className="required-badge">Required</span>}
    </td>
    <td className="endpoint-path">{endpoint.path}</td>
    <td>{endpoint.latency ? `${endpoint.latency}ms` : "-"}</td>
    <td>
      {endpoint.error ? (
        <span className="error-message" title={endpoint.error}>
          {endpoint.error.substring(0, 30)}...
        </span>
      ) : (
        <span className="success-message">OK</span>
      )}
    </td>
  </tr>
);

const ApiHealthCheck = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  const runCheck = useCallback(async () => {
    setLoading(true);
    const checkResults = await runFullHealthCheck();
    setResults(checkResults);
    setLastCheck(new Date());
    setLoading(false);
  }, []);
  
  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    runCheck(); // Initial check
    
    let interval;
    if (autoRefresh) {
      interval = setInterval(runCheck, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [runCheck, autoRefresh]);
  
  const getOverallStatus = () => {
    if (!results) return { text: "Checking...", color: "#64748b" };
    
    switch (results.overallStatus) {
      case "healthy":
        return { text: "All Systems Operational", color: "#10b981" };
      case "warning":
        return { text: "Partially Operational", color: "#f59e0b" };
      case "critical":
        return { text: "Critical Issues Detected", color: "#ef4444" };
      case "disconnected":
        return { text: "Backend Unreachable", color: "#ef4444" };
      default:
        return { text: "Unknown Status", color: "#64748b" };
    }
  };
  
  const status = getOverallStatus();
  
  return (
    <div className="api-health-check">
      <header className="health-header">
        <div className="health-title">
          <FontAwesomeIcon icon={faServer} className="server-icon" />
          <div>
            <h2>Backend Connection Status</h2>
            <p>Real-time API health monitoring</p>
          </div>
        </div>
        
        <div className="health-controls">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh (30s)</span>
          </label>
          
          <button
            className="refresh-btn"
            onClick={runCheck}
            disabled={loading}
          >
            <FontAwesomeIcon icon={faSync} spin={loading} />
            {loading ? "Checking..." : "Check Now"}
          </button>
        </div>
      </header>
      
      {/* Overall Status */}
      <section className="overall-status">
        <div
          className="status-card"
          style={{ borderColor: status.color, backgroundColor: `${status.color}10` }}
        >
          <div className="status-icon" style={{ color: status.color }}>
            <FontAwesomeIcon
              icon={
                results?.overallStatus === "healthy"
                  ? faCheckCircle
                  : results?.overallStatus === "warning"
                  ? faExclamationTriangle
                  : faTimesCircle
              }
            />
          </div>
          <div className="status-info">
            <h3 style={{ color: status.color }}>{status.text}</h3>
            <p>{results?.message || "Checking backend connection..."}</p>
            {lastCheck && (
              <small>Last checked: {lastCheck.toLocaleTimeString()}</small>
            )}
          </div>
        </div>
      </section>
      
      {/* Connection Details */}
      {results?.connection && (
        <section className="connection-details">
          <div className="detail-card">
            <strong>API URL</strong>
            <code>{API_URL}</code>
          </div>
          <div className="detail-card">
            <strong>Status</strong>
            <span className={results.connection.status}>
              {results.connection.status}
            </span>
          </div>
          <div className="detail-card">
            <strong>Latency</strong>
            <span>{results.connection.latency || "-"}ms</span>
          </div>
          <div className="detail-card">
            <strong>Status Code</strong>
            <span>{results.connection.statusCode || "-"}</span>
          </div>
        </section>
      )}
      
      {/* Endpoints Table */}
      {results?.endpoints && (
        <section className="endpoints-section">
          <h3>API Endpoints</h3>
          <div className="endpoints-table-wrapper">
            <table className="endpoints-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Endpoint Name</th>
                  <th>Path</th>
                  <th>Latency</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {results.endpoints.map((endpoint, index) => (
                  <EndpointRow key={index} endpoint={endpoint} />
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="endpoints-summary">
            <div className="summary-item success">
              <strong>{results.summary?.connected || 0}</strong>
              <span>Available</span>
            </div>
            <div className="summary-item warning">
              <strong>{results.summary?.missing || 0}</strong>
              <span>Not Implemented</span>
            </div>
            <div className="summary-item error">
              <strong>{results.summary?.failed || 0}</strong>
              <span>Failed</span>
            </div>
            <div className="summary-item total">
              <strong>{results.summary?.total || 0}</strong>
              <span>Total</span>
            </div>
          </div>
        </section>
      )}
      
      {/* Quick Actions */}
      <section className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="actions-grid">
          <button className="action-btn" onClick={() => pingBackend()}>
            <FontAwesomeIcon icon={faNetworkWired} />
            Ping Backend
          </button>
          <button className="action-btn" onClick={() => checkAdvancedAPIs()}>
            <FontAwesomeIcon icon={faServer} />
            Check Advanced APIs
          </button>
        </div>
      </section>
      
      {/* Implementation Guide */}
      {!results?.summary?.connected && (
        <section className="implementation-guide">
          <h3>
            <FontAwesomeIcon icon={faExclamationTriangle} />
            Backend Implementation Required
          </h3>
          <p>
            The frontend reporting system is ready, but backend APIs need to be implemented.
            See <code>backend/API_SPECIFICATIONS.md</code> for endpoint details.
          </p>
          <div className="guide-steps">
            <ol>
              <li>Implement <code>GET /health</code> endpoint for basic connectivity</li>
              <li>Create database migrations for new tables</li>
              <li>Implement Phase 2 APIs (Executive Dashboard, Predictive Analytics)</li>
              <li>Implement Phase 3 APIs (Segmentation, Comparative, Alerts)</li>
              <li>Implement Phase 4 APIs (Sales Analysis, Inventory, Staff)</li>
            </ol>
          </div>
        </section>
      )}
    </div>
  );
};

export default ApiHealthCheck;
