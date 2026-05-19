import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSort, faSortUp, faSortDown } from "@fortawesome/free-solid-svg-icons";
import { getNestedValue } from "../../utils/reportExport";
import "./StandardTable.css";

/**
 * Standardized Table Component
 * Provides consistent table layout and functionality across all report modules
 *
 * @param {Object} props
 * @param {Array} props.data - Table data array
 * @param {Array} props.columns - Column configuration array
 * @param {string} props.columns[].key - Data key for column
 * @param {string} props.columns[].label - Column header label
 * @param {Function} props.columns[].render - Custom render function (optional)
 * @param {string} props.columns[].className - Column CSS class (optional)
 * @param {boolean} props.columns[].sortable - Whether column is sortable (default: false)
 * @param {string} props.sortKey - Current sort key
 * @param {string} props.sortDirection - Current sort direction (asc/desc)
 * @param {Function} props.onSort - Sort handler function
 * @param {boolean} props.loading - Loading state
 * @param {string} props.emptyMessage - Empty state message
 * @param {boolean} props.striped - Whether to show striped rows (default: true)
 * @param {boolean} props.hoverable - Whether rows are hoverable (default: true)
 * @param {boolean} props.compact - Compact table variant (default: false)
 */
const StandardTable = ({
  data = [],
  columns = [],
  sortKey,
  sortDirection,
  onSort,
  loading = false,
  emptyMessage = "No data available",
  striped = true,
  hoverable = true,
  compact = false,
  pageSize = 10,
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil((data?.length || 0) / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, currentPage, pageSize]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [data, pageSize]);

  const handleSort = (key) => {
    if (!onSort) return;
    
    let newDirection = 'asc';
    if (sortKey === key && sortDirection === 'asc') {
      newDirection = 'desc';
    } else if (sortKey === key && sortDirection === 'desc') {
      newDirection = 'asc';
    }
    
    onSort(key, newDirection);
  };

  const getSortIcon = (column) => {
    if (!column.sortable || !onSort) return null;
    
    if (sortKey !== column.key) {
      return <FontAwesomeIcon icon={faSort} className="sort-icon inactive" />;
    }
    
    return sortDirection === 'asc' 
      ? <FontAwesomeIcon icon={faSortUp} className="sort-icon active" />
      : <FontAwesomeIcon icon={faSortDown} className="sort-icon active" />;
  };

  const renderCell = (column, item, index) => {
    const value = getNestedValue(item, column.key);
    
    if (column.render) {
      return column.render(value, item, index);
    }
    
    // Handle different data types
    if (typeof value === 'number' && column.format === 'currency') {
      return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
      }).format(value);
    }
    
    if (typeof value === 'number' && column.format === 'number') {
      return new Intl.NumberFormat('en-PH').format(value);
    }
    
    if (column.format === 'date' && value) {
      return new Date(value).toLocaleDateString('en-PH');
    }
    
    if (column.format === 'datetime' && value) {
      return new Date(value).toLocaleString('en-PH');
    }
    
    return value || '-';
  };

  const getRowKey = (item, index) => {
    const rowId = item?.id ?? item?.uuid ?? item?.reference_number ?? index;
    const rowSource = item?.source ?? item?.type ?? item?.role ?? "row";
    return `${rowSource}-${rowId}-${(currentPage - 1) * pageSize + index}`;
  };

  const tableClasses = [
    'standard-table',
    striped && 'striped',
    hoverable && 'hoverable',
    compact && 'compact'
  ].filter(Boolean).join(' ');

  if (loading) {
    return (
      <div className="table-loading-state">
        <div className="loading-spinner"></div>
        <div className="loading-text">Loading table data...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="table-empty-state">
        <div className="empty-icon">📊</div>
        <div className="empty-message">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="standard-table-container">
      <table className={tableClasses}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th 
                key={column.key}
                className={`${column.className || ''} ${column.sortable ? 'sortable' : ''}`}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="header-content">
                  <span className="header-text">{column.label}</span>
                  {getSortIcon(column)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginatedData.map((item, index) => (
            <tr key={getRowKey(item, index)} className="table-row">
              {columns.map((column) => (
                <td key={column.key} className={column.className || ''}>
                  {renderCell(column, item, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > pageSize && (
        <div className="standard-table-pagination">
          <span>
            Showing {(currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, data.length)} of {data.length}
          </span>
          <div className="pagination-actions">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <strong>{currentPage} / {totalPages}</strong>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StandardTable;
