import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import "./StandardReportHeader.css";

/**
 * Standardized Report Header Component
 * Provides consistent header layout and actions across all report modules
 *
 * @param {Object} props
 * @param {string} props.title - Report page title
 * @param {string} props.subtitle - Report page subtitle
 * @param {string} props.icon - FontAwesome icon for the report
 * @param {boolean} props.loading - Loading state
 * @param {Function} props.onExport - Export handler (optional)
 * @param {string} props.lastUpdated - Last updated timestamp
 */
const StandardReportHeader = ({
  title,
  subtitle,
  icon,
  loading = false,
  onExport,
  lastUpdated,
}) => {
  return (
    <div className="standard-report-header">
      <div className="header-content">
        <div className="header-title-section">
          {icon && (
            <div className="header-icon-wrap">
              <FontAwesomeIcon icon={icon} className="header-icon" />
            </div>
          )}
          <div className="header-text">
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">{subtitle}</p>
          </div>
        </div>
        
        <div className="header-actions">
          {lastUpdated && (
            <div className="last-updated">
              <span className="updated-text">Last updated: {lastUpdated}</span>
            </div>
          )}
          
          <div className="action-buttons">
            {onExport && (
              <button 
                className="action-btn export-btn" 
                onClick={onExport} 
                disabled={loading}
                title="Export report"
              >
                <FontAwesomeIcon icon={faDownload} />
                <span className="btn-text">Export</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StandardReportHeader;
