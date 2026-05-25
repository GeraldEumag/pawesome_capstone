import React from "react";
import StandardReportHeader from "./StandardReportHeader";
import "./StandardReportLayout.css";

/**
 * Standardized Report Layout Component
 * Provides consistent layout structure across all report modules
 *
 * @param {Object} props
 * @param {string} props.title - Report page title
 * @param {string} props.subtitle - Report page subtitle
 * @param {Object} props.icon - FontAwesome icon for the report
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message
 * @param {boolean} props.empty - Empty state
 * @param {string} props.emptyMessage - Empty state message
 * @param {Function} props.onRefresh - Refresh data handler
 * @param {Function} props.onExport - Export handler (optional)
 * @param {string} props.lastUpdated - Last updated timestamp
 * @param {React.ReactNode} props.children - Report content
 */
const StandardReportLayout = ({
  title,
  subtitle,
  icon,
  loading = false,
  error = "",
  empty = false,
  emptyMessage = "No data available",
  onRefresh,
  onExport,
  lastUpdated,
  children,
}) => {
  const renderLoadingState = () => (
    <div className="standard-loading-state">
      <div className="loading-spinner"></div>
      <div className="loading-text">Loading report data...</div>
      <div className="loading-subtext">Please wait while we fetch the latest information</div>
    </div>
  );

  const renderErrorState = () => (
    <div className="standard-error-state">
      <div className="error-icon">⚠️</div>
      <div className="error-message">{error}</div>
      {onRefresh && (
        <button className="retry-btn" onClick={onRefresh}>
          🔄 Retry Loading
        </button>
      )}
    </div>
  );

  const renderEmptyState = () => (
    <div className="standard-empty-state">
      <div className="empty-icon">📊</div>
      <div className="empty-message">{emptyMessage}</div>
      {onRefresh && (
        <button className="refresh-btn" onClick={onRefresh}>
          🔄 Refresh Data
        </button>
      )}
    </div>
  );

  return (
    <div className="standard-report-layout">
      <StandardReportHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        loading={loading}
        onRefresh={onRefresh}
        onExport={onExport}
        lastUpdated={lastUpdated}
      />

      <div className="report-content">
        {loading ? (
          renderLoadingState()
        ) : error ? (
          renderErrorState()
        ) : empty ? (
          renderEmptyState()
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default StandardReportLayout;
