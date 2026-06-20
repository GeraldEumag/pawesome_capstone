import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faFilter,
  faSync,
  faDownload,
  faExclamationTriangle,
  faCalendarAlt,
  faSearch,
  faTimes,
  faChevronDown,
  faSave,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import StandardReportLayout from './StandardReportLayout';
import StandardTable from './StandardTable';
import { exportToCSV, exportToPDF, exportToExcel, getDateRangePreset } from '../../utils/reportExport';
import './UnifiedReportEngine.css';

/**
 * UnifiedReportEngine - Standardized reporting component for all roles
 * Provides consistent: filters, loading states, exports, charts, and data handling
 */

const CHART_COLORS = ['#ff5f93', '#ff8db5', '#ffc8dd', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'];

const DATE_PRESETS = [
  { key: 'today', label: 'Today', icon: faClock },
  { key: 'yesterday', label: 'Yesterday', icon: faClock },
  { key: 'last7days', label: 'Last 7 Days', icon: faCalendarAlt },
  { key: 'last30days', label: 'Last 30 Days', icon: faCalendarAlt },
  { key: 'month', label: 'This Month', icon: faCalendarAlt },
  { key: 'quarter', label: 'This Quarter', icon: faCalendarAlt },
  { key: 'year', label: 'This Year', icon: faCalendarAlt },
];

// Utility functions
const normalizeStatus = (value) =>
  String(value || 'pending').toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');

const formatLabel = (value) =>
  String(value || 'N/A')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getNestedValue = (obj, path) => {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((value, key) => {
    if (value === null || value === undefined) return undefined;
    return value[key];
  }, obj);
};

/**
 * Advanced Filter Panel Component
 */
const AdvancedFilterPanel = ({
  filters,
  onFilterChange,
  onClearFilters,
  onApplyFilters,
  savedFilters = [],
  onSaveFilter,
  dateRange,
  onDateRangeChange,
  statusOptions = [],
  customFilters = [],
}) => {
  const [showSavedFilters, setShowSavedFilters] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [activePreset, setActivePreset] = useState('month');

  const handlePresetClick = (presetKey) => {
    setActivePreset(presetKey);
    const range = getDateRangePreset(presetKey);
    onDateRangeChange(range);
    onApplyFilters(range);
  };

  const handleSaveFilter = () => {
    if (filterName.trim()) {
      onSaveFilter({
        name: filterName,
        filters: { ...filters },
        dateRange: { ...dateRange },
      });
      setFilterName('');
      setShowSavedFilters(false);
    }
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.searchTerm) count++;
    if (filters.status && filters.status !== 'all') count++;
    if (dateRange.startDate || dateRange.endDate) count++;
    customFilters.forEach((cf) => {
      if (filters[cf.key] && filters[cf.key] !== 'all') count++;
    });
    return count;
  }, [filters, dateRange, customFilters]);

  return (
    <div className="ure-filter-panel">
      {/* Date Range Presets */}
      <div className="ure-date-presets">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className={`ure-preset-btn ${activePreset === preset.key ? 'active' : ''}`}
            onClick={() => handlePresetClick(preset.key)}
          >
            <FontAwesomeIcon icon={preset.icon} />
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom Date Range */}
      <div className="ure-custom-date-range">
        <label>
          From
          <input
            type="date"
            value={dateRange.startDate || ''}
            onChange={(e) => onDateRangeChange({ ...dateRange, startDate: e.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={dateRange.endDate || ''}
            onChange={(e) => onDateRangeChange({ ...dateRange, endDate: e.target.value })}
          />
        </label>
      </div>

      {/* Search Input */}
      <div className="ure-search-box">
        <FontAwesomeIcon icon={faSearch} />
        <input
          type="text"
          placeholder="Search records..."
          value={filters.searchTerm || ''}
          onChange={(e) => onFilterChange({ ...filters, searchTerm: e.target.value })}
        />
        {filters.searchTerm && (
          <button
            type="button"
            className="ure-clear-search"
            onClick={() => onFilterChange({ ...filters, searchTerm: '' })}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        )}
      </div>

      {/* Status Filter */}
      {statusOptions.length > 0 && (
        <div className="ure-status-filter">
          <label>Status</label>
          <select
            value={filters.status || 'all'}
            onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
          >
            <option value="all">All Statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={normalizeStatus(status)}>
                {formatLabel(status)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Custom Filters */}
      {customFilters.map((customFilter) => (
        <div key={customFilter.key} className="ure-custom-filter">
          <label>{customFilter.label}</label>
          <select
            value={filters[customFilter.key] || 'all'}
            onChange={(e) => onFilterChange({ ...filters, [customFilter.key]: e.target.value })}
          >
            <option value="all">All {customFilter.label}</option>
            {customFilter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {/* Action Buttons */}
      <div className="ure-filter-actions">
        <button type="button" className="ure-btn-clear" onClick={onClearFilters}>
          <FontAwesomeIcon icon={faTimes} />
          Clear ({activeFilterCount})
        </button>
        <button type="button" className="ure-btn-apply" onClick={onApplyFilters}>
          <FontAwesomeIcon icon={faFilter} />
          Apply Filters
        </button>
        {onSaveFilter && (
          <button
            type="button"
            className="ure-btn-save"
            onClick={() => setShowSavedFilters(!showSavedFilters)}
          >
            <FontAwesomeIcon icon={faSave} />
            Save
          </button>
        )}
      </div>

      {/* Save Filter Dialog */}
      {showSavedFilters && (
        <div className="ure-save-filter-dialog">
          <input
            type="text"
            placeholder="Filter name..."
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
          />
          <button type="button" onClick={handleSaveFilter}>
            Save Filter
          </button>
        </div>
      )}

      {/* Saved Filters List */}
      {savedFilters.length > 0 && (
        <div className="ure-saved-filters">
          <label>Saved Filters:</label>
          <div className="ure-saved-filter-chips">
            {savedFilters.map((saved, idx) => (
              <button
                key={idx}
                type="button"
                className="ure-filter-chip"
                onClick={() => {
                  onFilterChange(saved.filters);
                  onDateRangeChange(saved.dateRange);
                }}
              >
                {saved.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Summary Cards Component
 */
const SummaryCards = ({ cards, layout = 'grid' }) => {
  const getToneClass = (tone) => {
    const toneMap = {
      primary: 'ure-tone-primary',
      success: 'ure-tone-success',
      warning: 'ure-tone-warning',
      danger: 'ure-tone-danger',
      info: 'ure-tone-info',
      money: 'ure-tone-money',
      secondary: 'ure-tone-secondary',
    };
    return toneMap[tone] || 'ure-tone-primary';
  };

  return (
    <div className={`ure-summary-cards ${layout}`}>
      {cards.map((card) => (
        <article key={card.id} className={`ure-summary-card ${getToneClass(card.tone)}`}>
          <div className="ure-card-icon">
            <FontAwesomeIcon icon={card.icon} />
          </div>
          <div className="ure-card-content">
            <strong>{card.value}</strong>
            <span>{card.label}</span>
            {card.change && (
              <small className={`ure-change ${card.trend}`}>
                {card.trend === 'up' ? '↑' : card.trend === 'down' ? '↓' : '→'} {card.change}
              </small>
            )}
          </div>
        </article>
      ))}
    </div>
  );
};

/**
 * Chart Container Component
 */
const ChartContainer = ({ title, subtitle, children, height = 300, actions = null }) => (
  <article className="ure-chart-container">
    <div className="ure-chart-header">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="ure-chart-actions">{actions}</div>}
    </div>
    <div className="ure-chart-body" style={{ height }}>
      {children}
    </div>
  </article>
);

/**
 * Main UnifiedReportEngine Component (Base)
 */
const UnifiedReportEngineBase = ({
  // Core props
  title,
  subtitle,
  icon = faChartLine,
  
  // Data props
  fetchData,
  data = [],
  rawData = {},
  
  // Configuration
  columns = [],
  summaryCards = [],
  charts = null,
  
  // Filter configuration
  statusOptions = [],
  customFilters = [],
  enableDateFilter = true,
  enableSearch = true,
  
  // Export configuration
  exportEnabled = true,
  exportFilename = 'report',
  exportTitle = 'Report',
  
  // Features
  enableRefresh = true,
  refreshInterval = 0, // 0 = no auto-refresh
  enableSavedFilters = true,
  
  // State callbacks
  onError,
  onLoadingChange,
  
  // Custom renderers
  renderCustomContent,
  renderDetailModal,
  
  // Table options
  tablePageSize = 10,
  tableEmptyMessage = 'No records found',
}) => {
  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [chartsReady, setChartsReady] = useState(false);
  const chartsSectionRef = useRef(null);

  useEffect(() => {
    const section = chartsSectionRef.current;
    if (!section) return;
    let fallbackId;
    const update = () => {
      const rect = section.getBoundingClientRect();
      const ready = rect.width > 0 && rect.height > 0;
      setChartsReady(ready);
      if (ready) clearTimeout(fallbackId);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(section);
    fallbackId = setTimeout(() => setChartsReady(true), 500);
    return () => {
      observer.disconnect();
      clearTimeout(fallbackId);
    };
  }, [loading]);
  
  // Filter state
  const defaultDateRange = useMemo(() => getDateRangePreset('month'), []);
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [filters, setFilters] = useState({
    searchTerm: '',
    status: 'all',
  });
  const [savedFilters, setSavedFilters] = useState([]);
  const [appliedFilters, setAppliedFilters] = useState({ ...filters });
  const [appliedDateRange, setAppliedDateRange] = useState({ ...dateRange });
  
  // Data loading
  const loadData = useCallback(async ({ silent = false, overrideParams = null } = {}) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const params = overrideParams || {
        ...appliedFilters,
        startDate: appliedDateRange.startDate,
        endDate: appliedDateRange.endDate,
      };

      await fetchData(params);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Report fetch error:', err);
      setError(err.message || 'Failed to load report data');
      if (onError) onError(err);
    } finally {
      setLoading(false);
      if (onLoadingChange) onLoadingChange(false);
    }
  }, [fetchData, appliedFilters, appliedDateRange, onError, onLoadingChange]);
  
  // Initial load
  useEffect(() => {
    loadData();
  }, []);
  
  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => loadData({ silent: true }), refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, loadData]);
  
  // Filter handlers
  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
  }, []);
  
  const handleDateRangeChange = useCallback((newRange) => {
    setDateRange(newRange);
  }, []);
  
  const handleApplyFilters = useCallback((forcedDateRange = null) => {
    const nextFilters = { ...filters };
    const nextDateRange = forcedDateRange ? { ...forcedDateRange } : { ...dateRange };
    setAppliedFilters(nextFilters);
    setAppliedDateRange(nextDateRange);
    loadData({
      overrideParams: {
        ...nextFilters,
        startDate: nextDateRange.startDate,
        endDate: nextDateRange.endDate,
      },
    });
  }, [filters, dateRange, loadData]);

  const handleClearFilters = useCallback(() => {
    const resetFilters = { searchTerm: '', status: 'all' };
    customFilters.forEach((cf) => {
      resetFilters[cf.key] = 'all';
    });

    setFilters(resetFilters);
    setDateRange(defaultDateRange);
    setAppliedFilters(resetFilters);
    setAppliedDateRange(defaultDateRange);
    loadData({
      overrideParams: {
        ...resetFilters,
        startDate: defaultDateRange.startDate,
        endDate: defaultDateRange.endDate,
      },
    });
  }, [customFilters, defaultDateRange, loadData]);
  
  const handleSaveFilter = useCallback((filterConfig) => {
    setSavedFilters((prev) => [...prev, filterConfig]);
  }, []);
  
  // Export handlers
  const handleExportCSV = useCallback(() => {
    exportToCSV(data, columns, exportFilename);
  }, [data, columns, exportFilename]);
  
  const handleExportPDF = useCallback(() => {
    exportToPDF(data, columns, exportTitle, exportFilename);
  }, [data, columns, exportTitle, exportFilename]);
  
  const handleExportExcel = useCallback(() => {
    exportToExcel(data, columns, exportFilename);
  }, [data, columns, exportFilename]);
  
  // Filter data
  const filteredData = useMemo(() => {
    let result = [...data];
    
    // Search filter
    if (appliedFilters.searchTerm) {
      const search = appliedFilters.searchTerm.toLowerCase();
      result = result.filter((item) =>
        columns.some((col) => {
          const value = getNestedValue(item, col.key);
          return value && String(value).toLowerCase().includes(search);
        })
      );
    }
    
    // Status filter
    if (appliedFilters.status && appliedFilters.status !== 'all') {
      result = result.filter((item) => {
        const itemStatus = normalizeStatus(item.status || item.payment_status);
        return itemStatus === appliedFilters.status;
      });
    }
    
    // Custom filters
    customFilters.forEach((cf) => {
      const filterValue = appliedFilters[cf.key];
      if (filterValue && filterValue !== 'all') {
        result = result.filter((item) => {
          const itemValue = getNestedValue(item, cf.dataKey || cf.key);
          return String(itemValue).toLowerCase() === String(filterValue).toLowerCase();
        });
      }
    });
    
    // Date range filter
    if (appliedDateRange.startDate || appliedDateRange.endDate) {
      result = result.filter((item) => {
        const itemDate = item.date || item.created_at || item.timestamp;
        if (!itemDate) return true;
        
        const dateStr = new Date(itemDate).toISOString().split('T')[0];
        if (dateStr === 'Invalid Date') return true;
        
        if (appliedDateRange.startDate && dateStr < appliedDateRange.startDate) return false;
        if (appliedDateRange.endDate && dateStr > appliedDateRange.endDate) return false;
        
        return true;
      });
    }
    
    return result;
  }, [data, appliedFilters, appliedDateRange, columns, customFilters]);
  
  // Export actions
  const exportActions = exportEnabled ? (
    <>
      <button type="button" onClick={handleExportCSV} title="Export CSV">
        CSV
      </button>
      <button type="button" onClick={handleExportExcel} title="Export Excel">
        Excel
      </button>
      <button type="button" onClick={handleExportPDF} title="Export PDF">
        PDF
      </button>
    </>
  ) : null;
  
  return (
    <StandardReportLayout
      title={title}
      subtitle={subtitle}
      icon={icon}
      loading={loading}
      error={error}
      onRefresh={enableRefresh ? () => loadData({ silent: true }) : null}
      lastUpdated={lastUpdated?.toLocaleString('en-PH') || 'Not refreshed yet'}
    >
      <div className="unified-report-engine">
        {/* Filter Panel */}
        {(enableDateFilter || enableSearch || statusOptions.length > 0 || customFilters.length > 0) && (
          <AdvancedFilterPanel
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            onApplyFilters={handleApplyFilters}
            onSaveFilter={enableSavedFilters ? handleSaveFilter : null}
            savedFilters={savedFilters}
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            statusOptions={statusOptions}
            customFilters={customFilters}
          />
        )}
        
        {/* Summary Cards */}
        {summaryCards.length > 0 && (
          <SummaryCards cards={summaryCards} layout="grid" />
        )}
        
        {/* Charts Section */}
        {charts && (
          <div className="ure-charts-section" ref={chartsSectionRef}>
            {chartsReady && charts}
          </div>
        )}
        
        {/* Custom Content */}
        {renderCustomContent && renderCustomContent({
          data: filteredData,
          rawData,
          loading,
          filters: appliedFilters,
          dateRange: appliedDateRange,
        })}
        
        {/* Data Table */}
        {columns.length > 0 && (
          <div className="ure-table-section">
            <div className="ure-table-header">
              <div>
                <h3>Records</h3>
                <p>
                  Showing <strong>{filteredData.length}</strong> of {data.length} total records
                </p>
              </div>
              {exportEnabled && <div className="ure-table-actions">{exportActions}</div>}
            </div>
            
            <StandardTable
              columns={columns.map((col) => ({
                ...col,
                render: col.render || ((value, record) => {
                  if (col.format === 'currency') {
                    return `₱${safeNumber(value).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
                  }
                  if (col.format === 'date') {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-PH');
                  }
                  if (col.format === 'datetime') {
                    const date = new Date(value);
                    return date.toLocaleString('en-PH');
                  }
                  if (col.key === 'status' || col.key === 'payment_status') {
                    const statusClass = normalizeStatus(value);
                    return <span className={`ure-status-badge ${statusClass}`}>{formatLabel(value)}</span>;
                  }
                  return value;
                }),
              }))}
              data={filteredData}
              loading={loading}
              emptyMessage={tableEmptyMessage}
              pageSize={tablePageSize}
              onRowClick={renderDetailModal ? setSelectedRecord : null}
            />
          </div>
        )}
        
        {/* Detail Modal */}
        {selectedRecord && renderDetailModal && (
          <div className="ure-modal-overlay" onClick={() => setSelectedRecord(null)}>
            <div className="ure-modal" onClick={(e) => e.stopPropagation()}>
              {renderDetailModal(selectedRecord, () => setSelectedRecord(null))}
            </div>
          </div>
        )}
      </div>
    </StandardReportLayout>
  );
};

// Memoized component for performance - prevents re-renders when props are unchanged
const UnifiedReportEngine = memo(UnifiedReportEngineBase);

export default UnifiedReportEngine;
export { SummaryCards, ChartContainer, CHART_COLORS, normalizeStatus, formatLabel, safeNumber };
