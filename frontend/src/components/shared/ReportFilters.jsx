import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendar,
  faFilter,
  faDownload,
  faFilePdf,
  faFileExcel,
  faFileCsv,
  faSearch,
  faTimes,
  faPrint,
} from "@fortawesome/free-solid-svg-icons";
import { getDateRangePreset } from "../../utils/reportExport";
import DatePickerInput from "./DatePickerInput";
import "./ReportFilters.css";

/**
 * Standardized Report Filters Component
 * Provides consistent filtering and export controls across all report modules
 *
 * @param {Object} props
 * @param {string} props.searchTerm - Current search term
 * @param {Function} props.onSearchChange - Search change handler
 * @param {string} props.startDate - Start date (YYYY-MM-DD)
 * @param {string} props.endDate - End date (YYYY-MM-DD)
 * @param {Function} props.onDateChange - Date change handler (key, value)
 * @param {string} props.statusFilter - Current status filter
 * @param {Function} props.onStatusChange - Status change handler
 * @param {Array} props.statusOptions - Array of {value, label} for status dropdown
 * @param {string} props.roleFilter - Current role filter
 * @param {Function} props.onRoleChange - Role change handler
 * @param {Array} props.roleOptions - Array of {value, label} for role dropdown
 * @param {string} props.serviceTypeFilter - Current service type filter
 * @param {Function} props.onServiceTypeChange - Service type change handler
 * @param {Array} props.serviceTypeOptions - Array of {value, label} for service type dropdown
 * @param {Function} props.onExportCSV - CSV export handler
 * @param {Function} props.onExportPDF - PDF export handler
 * @param {Function} props.onExportExcel - Excel export handler
 * @param {Function} props.onPrint - Print handler
 * @param {boolean} props.loading - Loading state
 * @param {Function} props.onRefresh - Refresh data handler
 * @param {Function} props.onClearFilters - Clear all filters handler
 * @param {boolean} props.showDateRange - Show date range filters (default: true)
 * @param {boolean} props.showStatus - Show status filter (default: true)
 * @param {boolean} props.showRole - Show role filter (default: false)
 * @param {boolean} props.showServiceType - Show service type filter (default: false)
 * @param {boolean} props.showSearch - Show search input (default: true)
 * @param {boolean} props.showExport - Show export buttons (default: true)
 * @param {string} props.searchPlaceholder - Custom search placeholder
 */
const ReportFilters = ({
  searchTerm = "",
  onSearchChange,
  startDate = "",
  endDate = "",
  onDateChange,
  statusFilter = "all",
  onStatusChange,
  statusOptions = [],
  roleFilter = "all",
  onRoleChange,
  roleOptions = [],
  serviceTypeFilter = "all",
  onServiceTypeChange,
  serviceTypeOptions = [],
  salespersonFilter = "all",
  onSalespersonChange,
  salespersonOptions = [],
  onExportCSV,
  onExportPDF,
  onExportExcel,
  onPrint,
  loading = false,
  onRefresh,
  onClearFilters,
  showDateRange = true,
  showStatus = true,
  showRole = false,
  showServiceType = false,
  showSalesperson = false,
  showSearch = true,
  showExport = true,
  searchPlaceholder = "Search...",
}) => {
  const hasActiveFilters =
    searchTerm || startDate || endDate || statusFilter !== "all" || roleFilter !== "all" || serviceTypeFilter !== "all" || salespersonFilter !== "all";

  const handleDatePresetChange = (preset) => {
    const { startDate: newStart, endDate: newEnd } = getDateRangePreset(preset);
    onDateChange("startDate", newStart);
    onDateChange("endDate", newEnd);
  };

  return (
    <div className="report-filters-container">
      {/* Search Section */}
      {showSearch && (
        <div className="filter-section search-section">
          <div className="search-input-wrapper">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
              disabled={loading}
            />
            {searchTerm && (
              <button
                className="clear-search-btn"
                onClick={() => onSearchChange && onSearchChange("")}
                title="Clear search"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Date Range Section */}
      {showDateRange && (
        <div className="filter-section date-range-section">
          <div className="filter-label">
            <FontAwesomeIcon icon={faCalendar} />
            <span>Date Range</span>
          </div>
          <div className="date-presets">
            <button className="preset-btn" onClick={() => handleDatePresetChange("today")}>
              Today
            </button>
            <button className="preset-btn" onClick={() => handleDatePresetChange("week")}>
              This Week
            </button>
            <button className="preset-btn" onClick={() => handleDatePresetChange("month")}>
              This Month
            </button>
            <button className="preset-btn" onClick={() => handleDatePresetChange("quarter")}>
              This Quarter
            </button>
            <button className="preset-btn" onClick={() => handleDatePresetChange("year")}>
              This Year
            </button>
          </div>
          <div className="date-inputs">
            <div className="date-input-group">
              <label>From</label>
              <DatePickerInput
                selected={startDate ? new Date(startDate) : null}
                onChange={(date) => onDateChange && onDateChange("startDate", date ? date.toISOString().split("T")[0] : "")}
                placeholderText="From..."
                disabled={loading}
              />
            </div>
            <div className="date-input-group">
              <label>To</label>
              <DatePickerInput
                selected={endDate ? new Date(endDate) : null}
                onChange={(date) => onDateChange && onDateChange("endDate", date ? date.toISOString().split("T")[0] : "")}
                placeholderText="To..."
                disabled={loading}
              />
            </div>
          </div>
        </div>
      )}

      {/* Filter Dropdowns Section */}
      <div className="filter-section dropdowns-section">
        <div className="filter-label">
          <FontAwesomeIcon icon={faFilter} />
          <span>Filters</span>
        </div>
        <div className="filter-dropdowns">
          {showStatus && (
            <div className="filter-dropdown">
              <label>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => onStatusChange && onStatusChange(e.target.value)}
                disabled={loading}
              >
                <option value="all">All Status</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showRole && (
            <div className="filter-dropdown">
              <label>Role</label>
              <select
                value={roleFilter}
                onChange={(e) => onRoleChange && onRoleChange(e.target.value)}
                disabled={loading}
              >
                <option value="all">All Roles</option>
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showServiceType && (
            <div className="filter-dropdown">
              <label>Service Type</label>
              <select
                value={serviceTypeFilter}
                onChange={(e) => onServiceTypeChange && onServiceTypeChange(e.target.value)}
                disabled={loading}
              >
                <option value="all">All Services</option>
                {serviceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showSalesperson && (
            <div className="filter-dropdown">
              <label>Salesperson</label>
              <select
                value={salespersonFilter}
                onChange={(e) => onSalespersonChange && onSalespersonChange(e.target.value)}
                disabled={loading}
              >
                <option value="all">All Salespeople</option>
                {salespersonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons Section */}
      <div className="filter-section actions-section">
        {hasActiveFilters && onClearFilters && (
          <button className="action-btn clear-btn" onClick={onClearFilters} disabled={loading}>
            <FontAwesomeIcon icon={faTimes} />
            Clear Filters
          </button>
        )}

        {onRefresh && (
          <button className="action-btn refresh-btn" onClick={onRefresh} disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" />
                Loading...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faSearch} />
                Refresh
              </>
            )}
          </button>
        )}

        {showExport && (
          <div className="export-dropdown">
            <button className="action-btn export-btn" disabled={loading}>
              <FontAwesomeIcon icon={faDownload} />
              Export
              <span className="export-chevron">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            <div className="export-options">
              <div className="export-options-header">
                <FontAwesomeIcon icon={faDownload} />
                <span>Export Options</span>
              </div>
              {onExportExcel && (
                <button className="export-option excel" onClick={onExportExcel}>
                  <span className="export-icon-wrap excel-icon">
                    <FontAwesomeIcon icon={faFileExcel} />
                  </span>
                  <span className="export-label">Excel (.xlsx)</span>
                </button>
              )}
              {onExportCSV && (
                <button className="export-option csv" onClick={onExportCSV}>
                  <span className="export-icon-wrap csv-icon">
                    <FontAwesomeIcon icon={faFileCsv} />
                  </span>
                  <span className="export-label">CSV (.csv)</span>
                </button>
              )}
              {onExportPDF && (
                <button className="export-option pdf" onClick={onExportPDF}>
                  <span className="export-icon-wrap pdf-icon">
                    <FontAwesomeIcon icon={faFilePdf} />
                  </span>
                  <span className="export-label">PDF (.pdf)</span>
                </button>
              )}
              {onPrint && (
                <button className="export-option print" onClick={onPrint}>
                  <span className="export-icon-wrap print-icon">
                    <FontAwesomeIcon icon={faPrint} />
                  </span>
                  <span className="export-label">Print</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportFilters;
